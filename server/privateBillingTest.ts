import {owner,paddleData,PRICE_IDS,transactionId,type LiveCheckoutEnv} from './liveCheckout';
import {requireSameOrigin,readBody,responseJSON,rateLimit,sha256,changes,ApiError} from './accountSecurity';
import {inboxEnabled} from './billingApi';
const origin='https://courseaccess.minty-12-shar.workers.dev';
export const TEST_DESCRIPTION='CourseAccess private live verification — zero cost';
const obj=(v:unknown):Record<string,unknown>|null=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
export const validPrivateCode=(code:string)=>/^[A-Z0-9]{8,32}$/.test(code);
export function safeTestDiscount(d:Record<string,unknown>,code:string,now=Date.now()):boolean{
 return typeof d.id==='string'&&/^dsc_[a-z0-9]{26}$/.test(d.id)&&d.description===TEST_DESCRIPTION&&typeof d.code==='string'&&d.code.toUpperCase()===code&&d.status==='active'&&d.type==='percentage'&&Number(d.amount)===100&&d.enabled_for_checkout===true&&d.recur===true&&d.maximum_recurring_intervals===null&&d.usage_limit===1&&d.times_used===0&&Array.isArray(d.restrict_to)&&d.restrict_to.length===1&&d.restrict_to[0]===PRICE_IDS.pro&&typeof d.expires_at==='string'&&Date.parse(d.expires_at)>now;
}
export async function handlePrivateTestStatus(req:Request,env:LiveCheckoutEnv):Promise<Response>{
 const account=await owner(req,env);
 if(!account||!env.DB)return responseJSON({error:'Sign in first.'},401);
 const db=env.DB;
 const row=await db.prepare("SELECT i.state,i.transaction_id,s.status,c.provider_status FROM paddle_checkout_intents i LEFT JOIN subscriptions s ON s.owner_kind='account' AND s.owner_id=i.account_id AND s.id LIKE 'qa-%' LEFT JOIN paddle_subscription_catalog c ON c.subscription_id=s.provider_subscription_ref WHERE i.account_id=? AND i.id LIKE 'qa-%' ORDER BY i.created_at_ms DESC LIMIT 1").bind(account).first<{state:string;transaction_id:string|null;status:string|null;provider_status:string|null}>();
 return responseJSON({test:row?{state:row.state,status:row.provider_status||row.status}:null});
}
export async function handlePrivateTestCheckout(req:Request,env:LiveCheckoutEnv):Promise<Response>{
 try{
  requireSameOrigin(req);const account=await owner(req,env);
  if(!account||!env.DB)return responseJSON({error:'Sign in with a passkey first.'},401);
  if(new URL(req.url).origin!==origin||!inboxEnabled(req,env)||env.COURSEACCESS_PADDLE_RECONCILE_ENABLED!=='true'||!env.PADDLE_LIVE_API_KEY?.startsWith('pdl_live_apikey_'))return responseJSON({error:'Private verification unavailable.'},503);
  const db=env.DB,body=await readBody(req);await rateLimit(db,req,'private-billing-verification',10);
  if(body.action==='cancel'){
   const s=await db.prepare("SELECT provider_subscription_ref AS id,provider_customer_ref AS customer FROM subscriptions WHERE owner_kind='account' AND owner_id=? AND id LIKE 'qa-%' AND provider='paddle' AND status IN ('active','trialing','past_due') ORDER BY verified_at_ms DESC LIMIT 1").bind(account).first<{id:string;customer:string}>();
   if(!s||!/^sub_[a-z0-9]{26}$/.test(s.id))return responseJSON({error:'No active private test subscription.'},404);
   const remote=await paddleData(env,'/subscriptions/'+s.id);
   if(remote.id!==s.id||remote.customer_id!==s.customer||!String(obj(remote.custom_data)?.courseaccess_intent||'').startsWith('qa-'))return responseJSON({error:'Test subscription identity mismatch.'},409);
   const result=await paddleData(env,'/subscriptions/'+s.id+'/cancel',{effective_from:'immediately'});
   if(result.id!==s.id||result.status!=='canceled')return responseJSON({error:'Cancellation not yet confirmed. Check Paddle.'},409);
   return responseJSON({canceled:true});
  }
  const code=typeof body.code==='string'?body.code.trim().toUpperCase():'';
  if(!validPrivateCode(code))return responseJSON({error:'Invalid private verification code.'},400);
  const reply=await fetch('https://api.paddle.com/discounts?code='+encodeURIComponent(code),{headers:{Authorization:'Bearer '+env.PADDLE_LIVE_API_KEY,Accept:'application/json','Paddle-Version':'1'},redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!reply.ok)return responseJSON({error:'Unable to verify private discount.'},503);
  const data=(await reply.json() as {data?:Record<string,unknown>[]}).data;
  if(!Array.isArray(data)||data.length!==1||!safeTestDiscount(data[0],code))return responseJSON({error:'Private discount invalid, expired or already used.'},403);
  const discountId=data[0].id;
  const input={items:[{price_id:PRICE_IDS.pro,quantity:1}],collection_mode:'automatic',discount_id:discountId};
  const preview=await paddleData(env,'/transactions/preview',input);
  if(obj(obj(preview.details)?.totals)?.total!=='0')return responseJSON({error:'Checkout preview was not zero. No transaction created.'},409);
  if(await db.prepare("SELECT id FROM subscriptions WHERE owner_kind='account' AND owner_id=? AND provider='paddle' AND status IN ('active','trialing','past_due')").bind(account).first())return responseJSON({error:'An active subscription already exists.'},409);
  // Never create a second draft for a private code, even after a network ambiguity.
  const lock=await db.prepare('INSERT INTO auth_rate_limits(bucket,window_start_ms,hits) VALUES(?,?,1) ON CONFLICT(bucket) DO NOTHING').bind(await sha256('private-test:'+discountId),Date.now()).run();
  if(!changes(lock))return responseJSON({error:'This test code has already been reserved.'},409);
  const id='qa-'+crypto.randomUUID();
  await db.batch([db.prepare("INSERT INTO paddle_checkout_intents(id,account_id,tier,created_at_ms,state) VALUES(?,?,'pro',?,'creating')").bind(id,account,Date.now()),db.prepare("INSERT INTO paddle_intent_owners VALUES(?,'account',?)").bind(id,account)]);
  try{
   const tx=await paddleData(env,'/transactions',{...input,custom_data:{courseaccess_intent:id}});
   if(!transactionId(tx.id)||tx.discount_id!==discountId||obj(obj(tx.details)?.totals)?.total!=='0')throw Error('Unsafe test transaction');
   await db.prepare("UPDATE paddle_checkout_intents SET transaction_id=?,state='ready' WHERE id=? AND state='creating'").bind(tx.id,id).run();
   return responseJSON({url:origin+'/checkout?_ptxn='+tx.id,total:0},201);
  }catch{await db.prepare("UPDATE paddle_checkout_intents SET state='review' WHERE id=? AND state='creating'").bind(id).run();return responseJSON({error:'Test checkout needs reconciliation. No retry was made.'},503);}
 }catch(e){return e instanceof ApiError?responseJSON({error:e.message},e.status):responseJSON({error:'Private test checkout unavailable.'},503);}
}
