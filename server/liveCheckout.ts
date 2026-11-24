import {activeAccountService,getCookie,sessionCookie,sha256,responseJSON,requireSameOrigin,readBody,ApiError,validId,rateLimit,type AccountEnv} from './accountSecurity';
import {inboxEnabled,type BillingEnv} from './billingApi';
export const PRICE_IDS={pro:'pri_01m87cf8a3d6nedgenr8jmhzwc',institution:'pri_01m87chg5xqcnggt17wvsknvw9'} as const;
export type CheckoutTier=keyof typeof PRICE_IDS;
const origin='https://courseaccess.minty-12-shar.workers.dev';
export interface LiveCheckoutEnv extends AccountEnv,BillingEnv {
  PADDLE_LIVE_API_KEY?:string;
  PADDLE_LIVE_CLIENT_TOKEN?:string;
  COURSEACCESS_LIVE_CHECKOUT_ENABLED?:string;
  COURSEACCESS_LIVE_PRICE_PREVIEW_ENABLED?:string;
}
export const validTier=(v:unknown):v is CheckoutTier=>v==='pro'||v==='institution';
export const transactionId=(v:unknown):v is string=>typeof v==='string'&&/^txn_[a-z0-9]{26}$/.test(v);
export function checkoutEnabled(req:Request,env:LiveCheckoutEnv):boolean{
  return env.COURSEACCESS_LIVE_CHECKOUT_ENABLED==='true'&&env.COURSEACCESS_PAID_FEATURES_ENABLED==='true'&&env.COURSEACCESS_PADDLE_RECONCILE_ENABLED==='true'&&inboxEnabled(req,env)&&activeAccountService(req,env)&&!!env.PADDLE_LIVE_API_KEY?.startsWith('pdl_live_apikey_')&&!!env.PADDLE_LIVE_CLIENT_TOKEN?.startsWith('live_');
}
export function checkoutConfig(req:Request,env:LiveCheckoutEnv):Response{
  const enabled=checkoutEnabled(req,env);
  const preview=(enabled||env.COURSEACCESS_LIVE_PRICE_PREVIEW_ENABLED==='true')&&new URL(req.url).origin===origin&&!!env.PADDLE_LIVE_CLIENT_TOKEN?.startsWith('live_');
  return responseJSON({enabled,preview,clientToken:preview?env.PADDLE_LIVE_CLIENT_TOKEN:null});
}
export async function owner(req:Request,env:LiveCheckoutEnv):Promise<string|null>{
  if(!activeAccountService(req,env)||!env.DB)return null;
  const token=getCookie(req,sessionCookie);
  if(!token||!/^[a-zA-Z0-9_-]{40,50}$/.test(token))return null;
  const row=await env.DB.prepare('SELECT s.account_id FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.revoked_at_ms IS NULL AND s.expires_at_ms>? AND a.deleted_at_ms IS NULL').bind(await sha256(token),Date.now()).first<{account_id:string}>();
  return row?.account_id??null;
}
export async function paddleData(env:LiveCheckoutEnv,path:string,body?:unknown):Promise<Record<string,unknown>>{
  if(!env.PADDLE_LIVE_API_KEY?.startsWith('pdl_live_apikey_'))throw Error('Paddle API unavailable');
  const r=await fetch('https://api.paddle.com'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+env.PADDLE_LIVE_API_KEY,Accept:'application/json','Content-Type':'application/json','Paddle-Version':'1'},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error('Paddle API request failed');
  const result=await r.json() as {data?:Record<string,unknown>};
  if(!result.data||typeof result.data!=='object'||Array.isArray(result.data))throw Error('Invalid Paddle response');
  return result.data;
}
export async function createCheckoutIntent(req:Request,env:LiveCheckoutEnv):Promise<Response>{
  if(!checkoutEnabled(req,env))return responseJSON({error:'Live checkout is disabled.'},503);
  try{
    requireSameOrigin(req);
    const accountId=await owner(req,env);
    if(!accountId)return responseJSON({error:'Sign in to continue.'},401);
    const body=await readBody(req);
    if(!validTier(body.tier))return responseJSON({error:'Unknown subscription plan.'},400);
    const db=env.DB!;
    await rateLimit(db,req,'billing-intent',12);
    const kind=body.tier==='institution'?'organization':'account';
    const subject=kind==='organization'?body.organizationId:accountId;
    if(!validId(subject))return responseJSON({error:'Select an organization you own.'},400);
    if(kind==='organization'){
      const membership=await db.prepare("SELECT 1 AS allowed FROM organization_members WHERE organization_id=? AND account_id=? AND role='owner'").bind(subject,accountId).first();
      if(!membership)return responseJSON({error:'Only the institution owner can purchase.'},403);
    }
    const subscribed=await db.prepare("SELECT id FROM subscriptions WHERE owner_kind=? AND owner_id=? AND provider='paddle' AND status IN ('active','trialing','past_due') LIMIT 1").bind(kind,subject).first();
    if(subscribed)return responseJSON({error:'Manage your existing subscription.'},409);
    const intentId=crypto.randomUUID();
    // One unresolved intent per account. A network ambiguity must be reconciled
    // before creating another transaction; never blindly retry a charge flow.
    // Reserve the owner mapping in the same D1 transaction. The trigger checks
    // organization ownership at write time, and locks competing open intents.
    try{
      await db.batch([
        db.prepare("INSERT INTO paddle_checkout_intents(id,account_id,tier,created_at_ms,state) VALUES(?,?,?,?,'creating')").bind(intentId,accountId,body.tier,Date.now()),
        db.prepare("INSERT INTO paddle_intent_owners(intent_id,owner_kind,owner_id) VALUES(?,?,?)").bind(intentId,kind,subject),
      ]);
    }catch{
      const previous=await db.prepare("SELECT i.transaction_id,i.tier,i.state FROM paddle_checkout_intents i JOIN paddle_intent_owners o ON o.intent_id=i.id WHERE i.account_id=? AND o.owner_kind=? AND o.owner_id=? AND i.state IN ('creating','ready','review') LIMIT 1").bind(accountId,kind,subject).first<{transaction_id:string|null;tier:string;state:string}>();
      if(previous?.state==='ready'&&previous.tier===body.tier&&transactionId(previous.transaction_id)){
        const tx=await paddleData(env,'/transactions/'+previous.transaction_id);
        if(tx.id===previous.transaction_id&&['draft','ready','past_due'].includes(String(tx.status)))return responseJSON({transactionId:previous.transaction_id});
        if(tx.id===previous.transaction_id&&tx.status==='canceled'){
          await db.prepare("UPDATE paddle_checkout_intents SET state='canceled' WHERE transaction_id=? AND state='ready'").bind(previous.transaction_id).run();
          return responseJSON({error:'Previous checkout was canceled. Start a new checkout.'},409);
        }
      }
      return responseJSON({error:'An existing checkout requires reconciliation.'},409);
    }
    try{
      const data=await paddleData(env,'/transactions',{items:[{price_id:PRICE_IDS[body.tier],quantity:1}],collection_mode:'automatic',custom_data:{courseaccess_intent:intentId}});
      if(!transactionId(data.id))throw Error('Missing transaction ID');
      await db.prepare("UPDATE paddle_checkout_intents SET transaction_id=?,state='ready' WHERE id=? AND state='creating'").bind(data.id,intentId).run();
      return responseJSON({transactionId:data.id},201);
    }catch{
      await db.prepare("UPDATE paddle_checkout_intents SET state='review' WHERE id=? AND state='creating'").bind(intentId).run();
      return responseJSON({error:'Checkout requires reconciliation. No automatic retry was made.'},503);
    }
  }catch(error){return error instanceof ApiError?responseJSON({error:error.message},error.status):responseJSON({error:'Checkout unavailable.'},503);}
}
