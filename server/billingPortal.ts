import {owner,paddleData,type LiveCheckoutEnv} from './liveCheckout';
import {requireSameOrigin,readBody,responseJSON,validId,rateLimit,ApiError} from './accountSecurity';
const obj=(v:unknown):Record<string,unknown>|null=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
// A Paddle portal token grants customer-wide access. The app's passkey
// does not prove ownership of an email entered in checkout. Strip any
// authenticated token, and require Paddle's own email login.
export function emailPortalURL(value:unknown,subscription:string):string|null{
 if(typeof value!=='string')return null;
 try{
  const url=new URL(value);
  if(url.origin!=='https://customer-portal.paddle.com'||url.username||url.password||!/^\/cpl_[a-z0-9]{26}\/?$/.test(url.pathname))return null;
  const action=url.searchParams.get('action');
  if(!action||!['view_subscription','cancel_subscription','update_subscription_payment_method'].includes(action)||url.searchParams.get('subscription_id')!==subscription)return null;
  const safe=new URL(url.origin+url.pathname);
  safe.searchParams.set('action',action);safe.searchParams.set('subscription_id',subscription);
  return safe.href;
 }catch{return null;}
}
export async function handleBillingPortal(req:Request,env:LiveCheckoutEnv):Promise<Response>{
 try{
  requireSameOrigin(req);
  const account=await owner(req,env);
  if(!account||!env.DB)return responseJSON({error:'Sign in with your passkey first.'},401);
  const body=await readBody(req),kind=body.organizationId===undefined?'account':'organization';
  const id=kind==='account'?account:body.organizationId;
  if(!validId(id))return responseJSON({error:'Invalid owner.'},400);
  const db=env.DB;
  if(kind==='organization'&&!await db.prepare("SELECT 1 FROM organization_members WHERE account_id=? AND organization_id=? AND role='owner'").bind(account,id).first())return responseJSON({error:'Only the institution owner may manage billing.'},403);
  await rateLimit(db,req,'billing-management',12);
  const row=await db.prepare("SELECT provider_customer_ref AS customer,provider_subscription_ref AS subscription FROM subscriptions WHERE owner_kind=? AND owner_id=? AND provider='paddle' AND verified_at_ms IS NOT NULL ORDER BY verified_at_ms DESC LIMIT 1").bind(kind,id).first<{customer:string;subscription:string}>();
  if(!row||!/^ctm_[a-z0-9]{26}$/.test(row.customer)||!/^sub_[a-z0-9]{26}$/.test(row.subscription))return responseJSON({error:'No verified subscription. Use the link in your Paddle receipt.'},404);
  const remote=await paddleData(env,'/subscriptions/'+row.subscription);
  if(remote.id!==row.subscription||remote.customer_id!==row.customer)return responseJSON({error:'Billing identity mismatch.'},409);
  const links=obj(remote.management_urls);
  const url=emailPortalURL(links?.view_subscription,row.subscription)||emailPortalURL(links?.update_payment_method,row.subscription)||emailPortalURL(links?.cancel,row.subscription);
  if(!url)return responseJSON({error:'Open the billing link in your Paddle receipt to sign in by email.'},409);
  return responseJSON({url});
 }catch(e){return e instanceof ApiError?responseJSON({error:e.message},e.status):responseJSON({error:'Billing portal unavailable. Use the billing link in your Paddle receipt.'},503);}
}
