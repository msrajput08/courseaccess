import {describe,it,expect,vi} from 'vitest';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import type {Database,Statement} from '../server/accountSecurity';
import {sha256} from '../server/accountSecurity';
import {handleLiveWebhook,retryPaddleInbox,type BillingEnv} from '../server/billingApi';
import {handleEntitlements} from '../server/paidAccess';
import {handleScopeChange} from '../server/billingScope';
import {PRICE_IDS} from '../server/liveCheckout';
import {createHmac} from 'node:crypto';
const origin='https://courseaccess.minty-12-shar.workers.dev',secret='fixture-not-real';
const account='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const sub='sub_'+'a'.repeat(26),customer='ctm_'+'b'.repeat(26),tx='txn_'+'c'.repeat(26),adj='adj_'+'d'.repeat(26),intent='fixture-intent';
const token='A'.repeat(43),otherToken='B'.repeat(43);
function adapter(sqlite:DatabaseSync):Database{
 function prepare(sql:string,values:SQLInputValue[]=[]):Statement{
  const q=sqlite.prepare(sql);
  return {
   bind(...args:unknown[]){return prepare(sql,args as SQLInputValue[]);},
   async first<T>(){return (q.get(...values)??null) as T|null;},
   async all<T>(){return {results:q.all(...values) as T[]};},
   async run(){const result=q.run(...values);return {meta:{changes:Number(result.changes)}};}
  };
 }
 return {prepare,async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
}
describe('signed Paddle lifecycle against migrated SQLite',()=>{
 it('persists real SQL transitions, retries, owner access, scope changes and refund holds',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  try{
   for(const filename of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())sqlite.exec(readFileSync('migrations/'+filename,'utf8'));
   const DB=adapter(sqlite),now=Date.now();
   for(const [id,name,t] of [[account,'Owner',token],[other,'Other',otherToken]]){
    sqlite.prepare('INSERT INTO accounts(id,display_name,created_at_ms) VALUES(?,?,?)').run(id,name,now);
    sqlite.prepare('INSERT INTO sessions(token_hash,account_id,issued_at_ms,expires_at_ms) VALUES(?,?,?,?)').run(await sha256(t),id,now,now+86400000);
   }
   sqlite.prepare("INSERT INTO paddle_checkout_intents(id,account_id,tier,created_at_ms,state,transaction_id) VALUES(?,?,'pro',?,'ready',?)").run(intent,account,now,tx);
   sqlite.prepare("INSERT INTO paddle_intent_owners VALUES(?,'account',?)").run(intent,account);
   const env:BillingEnv={DB,COURSEACCESS_AUTH_ORIGIN:origin,COURSEACCESS_ACCOUNTS_ENABLED:'true',COURSEACCESS_LIVE_WEBHOOK_INBOX_ENABLED:'true',COURSEACCESS_PADDLE_RECONCILE_ENABLED:'true',COURSEACCESS_PAID_FEATURES_ENABLED:'true',PADDLE_LIVE_WEBHOOK_SECRET:secret,PADDLE_LIVE_API_KEY:'pdl_live_apikey_fixture'};
   const period={starts_at:new Date(now-1000).toISOString(),ends_at:new Date(now+86400000).toISOString()};
   const pro={quantity:1,price:{id:PRICE_IDS.pro,product_id:'pro_01m87ccf14cemskhymbze0w9gd'}};
   const institution={quantity:1,price:{id:PRICE_IDS.institution,product_id:'pro_01m87cg6jmsj8ptqynxa1rf10h'}};
   let canonical:Record<string,unknown>={id:sub,customer_id:customer,status:'active',updated_at:new Date(now).toISOString(),current_billing_period:period,items:[pro],custom_data:{courseaccess_intent:intent}};
   let unavailable=false;
   const fetchMock=vi.fn(async(input:unknown)=>{
    const path=new URL(String(input)).pathname;
    if(unavailable)return new Response(null,{status:503});
    const data=path==='/subscriptions/'+sub?canonical:path==='/transactions/'+tx?{id:tx,status:'completed',subscription_id:sub,customer_id:customer,items:[pro],custom_data:{courseaccess_intent:intent}}:path==='/customers/'+customer?{id:customer,status:'active',updated_at:new Date(now).toISOString()}:path==='/adjustments/'+adj?{id:adj,subscription_id:sub,status:'approved',action:'refund'}:null;
    return data?Response.json({data}):new Response(null,{status:404});
   });
   vi.stubGlobal('fetch',fetchMock);
   let sequence=0;
   async function event(type:string,id:string,eventId='evt_'+(++sequence).toString(16).padStart(26,'0')){
    const raw=JSON.stringify({event_id:eventId,event_type:type,occurred_at:new Date().toISOString(),data:{id}});
    const ts=Math.floor(Date.now()/1000),sig='ts='+ts+';h1='+createHmac('sha256',secret).update(ts+':'+raw).digest('hex');
    const tasks:Promise<unknown>[]=[];
    const result=await handleLiveWebhook(new Request(origin+'/api/billing/webhook',{method:'POST',headers:{'content-type':'application/json','Paddle-Signature':sig},body:raw}),env,{waitUntil(p){tasks.push(p);}});
    expect(result.status).toBe(200);await Promise.all(tasks);return eventId;
   }
   const access=async(t=token)=>(await (await handleEntitlements(new Request(origin+'/api/entitlements',{headers:{cookie:'__Host-courseaccess='+t}}),env)).json()).features['history-cloud'];
   const mirror=()=>sqlite.prepare('SELECT * FROM paddle_subscription_catalog WHERE subscription_id=?').get(sub);
   const applied=(id:string)=>sqlite.prepare('SELECT applied_at_ms FROM payment_event_receipts WHERE provider_event_id=?').get(id)?.applied_at_ms;
   function update(status:string,change:Record<string,unknown>={}){canonical={...canonical,status,updated_at:new Date(now+(++sequence)*1000).toISOString(),...change};}
   // Out-of-order subscription event is retained until initial fulfillment.
   const early=await event('subscription.created',sub);expect(applied(early)).toBeNull();
   expect(await access()).toBe(false);
   const initial=await event('transaction.completed',tx);expect(applied(initial)).not.toBeNull();
   expect(mirror()?.price_id).toBe(PRICE_IDS.pro);expect(mirror()?.product_id).toBe(pro.price.product_id);
   expect(await access()).toBe(true);expect(await access(otherToken)).toBe(false);
   await retryPaddleInbox(env);expect(applied(early)).not.toBeNull();
   const before=fetchMock.mock.calls.length;await event('transaction.completed',tx,initial);expect(fetchMock.mock.calls.length).toBe(before);
   await event('customer.created',customer);expect(sqlite.prepare('SELECT status FROM paddle_customers WHERE customer_id=?').get(customer)?.status).toBe('active');
   update('active',{scheduled_change:{action:'cancel',effective_at:period.ends_at}});await event('subscription.updated',sub);
   expect(mirror()?.scheduled_action).toBe('cancel');expect(await access()).toBe(true);
   update('trialing',{scheduled_change:null});await event('subscription.trialing',sub);expect(await access()).toBe(true);
   update('past_due');await event('transaction.payment_failed',tx);expect(await access()).toBe(true);
   update('paused',{current_billing_period:null});await event('subscription.paused',sub);expect(mirror()?.provider_status).toBe('paused');expect(await access()).toBe(false);
   update('active',{current_billing_period:period});unavailable=true;
   const retry=await event('subscription.resumed',sub);expect(applied(retry)).toBeNull();expect(await access()).toBe(false);
   unavailable=false;await retryPaddleInbox(env);expect(applied(retry)).not.toBeNull();expect(await access()).toBe(true);
   update('active',{items:[institution]});await event('subscription.updated',sub);expect(mirror()?.scope_review).toBe(1);expect(mirror()?.price_id).toBe(PRICE_IDS.institution);expect(await access()).toBe(false);
   const org='00000000-0000-4000-8000-000000000003';
   sqlite.prepare('INSERT INTO organizations(id,display_name,created_by,created_at_ms) VALUES(?,?,?,?)').run(org,'College',account,now);
   sqlite.prepare("INSERT INTO organization_members VALUES(?,?, 'owner',?)").run(org,account,now);
   sqlite.prepare("INSERT INTO organization_members VALUES(?,?, 'viewer',?)").run(org,other,now);
   const assign=(body:Record<string,unknown>,t=token)=>handleScopeChange(new Request(origin+'/api/billing/scope',{method:'POST',headers:{origin,'content-type':'application/json',cookie:'__Host-courseaccess='+t},body:JSON.stringify(body)}),env);
   expect((await assign({targetOrganizationId:org},otherToken)).status).not.toBe(200);
   expect((await assign({targetOrganizationId:org})).status).toBe(200);expect(mirror()?.scope_review).toBe(0);expect(await access()).toBe(true);expect(await access(otherToken)).toBe(true);
   await event('transaction.completed',tx);expect(await access(otherToken)).toBe(true);
   update('active',{items:[pro]});await event('subscription.updated',sub);expect(mirror()?.scope_review).toBe(1);expect(await access()).toBe(false);
   expect((await assign({sourceOrganizationId:org},otherToken)).status).toBe(403);
   expect((await assign({sourceOrganizationId:org})).status).toBe(200);expect(mirror()?.scope_review).toBe(0);expect(await access()).toBe(true);expect(await access(otherToken)).toBe(false);
   update('canceled',{current_billing_period:null});await event('subscription.canceled',sub);expect(await access()).toBe(false);
   update('active',{current_billing_period:period});await event('subscription.updated',sub);expect(await access()).toBe(true);
   await event('adjustment.updated',adj);expect(await access()).toBe(false);
   update('active');await event('subscription.updated',sub);expect(await access()).toBe(false);
  }finally{vi.unstubAllGlobals();sqlite.close();}
 });
});
