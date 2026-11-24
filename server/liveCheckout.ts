import {activeAccountService,getCookie,sessionCookie,sha256,responseJSON,requireSameOrigin,readBody,ApiError,type AccountEnv} from './accountSecurity';
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
  return env.COURSEACCESS_LIVE_CHECKOUT_ENABLED==='true'&&inboxEnabled(req,env)&&activeAccountService(req,env)&&!!env.PADDLE_LIVE_API_KEY?.startsWith('pdl_live_apikey_')&&!!env.PADDLE_LIVE_CLIENT_TOKEN?.startsWith('live_');
}
export function checkoutConfig(req:Request,env:LiveCheckoutEnv):Response{
  const enabled=checkoutEnabled(req,env);
  const preview=(enabled||env.COURSEACCESS_LIVE_PRICE_PREVIEW_ENABLED==='true')&&new URL(req.url).origin===origin&&!!env.PADDLE_LIVE_CLIENT_TOKEN?.startsWith('live_');
  return responseJSON({enabled,preview,clientToken:preview?env.PADDLE_LIVE_CLIENT_TOKEN:null});
}
async function owner(req:Request,env:LiveCheckoutEnv):Promise<string|null>{
  if(!activeAccountService(req,env)||!env.DB)return null;
  const token=getCookie(req,sessionCookie);
  if(!token||!/^[a-zA-Z0-9_-]{40,50}$/.test(token))return null;
  const row=await env.DB.prepare('SELECT s.account_id FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.revoked_at_ms IS NULL AND s.expires_at_ms>? AND a.deleted_at_ms IS NULL').bind(await sha256(token),Date.now()).first<{account_id:string}>();
  return row?.account_id??null;
}
export async function paddleData(env:LiveCheckoutEnv,path:string,body?:unknown):Promise<Record<string,unknown>>{
  if(!env.PADDLE_LIVE_API_KEY?.startsWith('pdl_live_apikey_'))throw Error('Paddle API unavailable');
  const r=await fetch('https://api.paddle.com'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+env.PADDLE_LIVE_API_KEY,Accept:'application/json','Content-Type':'application/json','Paddle-Version':'1'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(8000)});
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
    // Institution ownership and organization entitlements need a separate audited flow.
    if(body.tier==='institution')return responseJSON({error:'Institution checkout is not available yet.'},409);
    const db=env.DB!;
    const subscribed=await db.prepare("SELECT id FROM subscriptions WHERE owner_kind='account' AND owner_id=? AND provider='paddle' AND status IN ('active','trialing','past_due') LIMIT 1").bind(accountId).first();
    if(subscribed)return responseJSON({error:'Manage your existing subscription.'},409);
    const intentId=crypto.randomUUID();
    // One unresolved intent per account. A network ambiguity must be reconciled
    // before creating another transaction; never blindly retry a charge flow.
    const reserved=await db.prepare("INSERT INTO paddle_checkout_intents(id,account_id,tier,created_at_ms,state) VALUES(?,?,?,?,'creating') ON CONFLICT DO NOTHING").bind(intentId,accountId,body.tier,Date.now()).run();
    if((reserved.meta?.changes??reserved.changes??0)!==1){
      const previous=await db.prepare("SELECT transaction_id,tier,state FROM paddle_checkout_intents WHERE account_id=? AND state IN ('creating','ready','review') LIMIT 1").bind(accountId).first<{transaction_id:string|null;tier:string;state:string}>();
      if(previous?.state==='ready'&&previous.tier===body.tier&&transactionId(previous.transaction_id))return responseJSON({transactionId:previous.transaction_id});
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
