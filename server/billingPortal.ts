import {owner,paddleData,type LiveCheckoutEnv} from './liveCheckout';
import {requireSameOrigin,readBody,responseJSON,validId,rateLimit,ApiError,getCookie,sessionCookie,sha256,cookie,changes,requireRecentVerification} from './accountSecurity';
import {createPortalProof,verifyPortalProof,verifiedPortalURL} from './portalProof';
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
  if(body.action==='verify'||body.action==='open'){
   const key=env.COURSEACCESS_PORTAL_PROOF_SECRET,from=env.COURSEACCESS_BILLING_FROM_EMAIL;
   if(!key||key.length<32||!from||!env.BILLING_EMAIL)return responseJSON({error:'Email verification service is not configured. Use the Paddle email login instead.'},503);
   const sessionToken=getCookie(req,sessionCookie)!;
   const session=await db.prepare('SELECT issued_at_ms FROM sessions WHERE token_hash=? AND account_id=? AND revoked_at_ms IS NULL AND expires_at_ms>?').bind(await sha256(sessionToken),account,Date.now()).first<{issued_at_ms:number}>();
   if(!session)return responseJSON({error:'Sign in again.'},401);
   requireRecentVerification(session);
   const customer=await paddleData(env,'/customers/'+row.customer);
   if(customer.id!==row.customer||customer.status!=='active'||typeof customer.email!=='string'||customer.email.length>254||!/^\S+@\S+\.\S+$/.test(customer.email))return responseJSON({error:'Billing email unavailable.'},409);
   const context=JSON.stringify([account,kind,id,row.customer,row.subscription,customer.email,await sha256(sessionToken)]);
   const proofCookie='__Host-ca-portal-proof';
   if(body.action==='verify'){
    // Bound the number of messages even if multiple accounts/IPs target one customer.
    const now=Date.now(),window=Math.floor(now/3600000)*3600000,bucket=await sha256('portal-mail:'+row.customer);
    await db.prepare('INSERT INTO auth_rate_limits(bucket,window_start_ms,hits) VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN window_start_ms=excluded.window_start_ms THEN hits+1 ELSE 1 END,window_start_ms=excluded.window_start_ms').bind(bucket,window).run();
    const count=await db.prepare('SELECT hits FROM auth_rate_limits WHERE bucket=?').bind(bucket).first<{hits:number}>();
    if(!count||count.hits>3)return responseJSON({error:'Too many verification requests. Use Paddle email login or try later.'},429);
    const proof=await createPortalProof(key,context);
    await env.BILLING_EMAIL.send({to:customer.email,from,subject:'CourseAccess billing verification',text:'Your one-time billing verification code is: '+proof.code+'\nIt expires in 5 minutes. Enter it only on CourseAccess. If you did not request this, ignore this message.'});
    return responseJSON({verificationRequired:true},200,{'set-cookie':cookie(proofCookie,proof.challenge,300)});
   }
   const challenge=getCookie(req,proofCookie);
   if(!await verifyPortalProof(key,context,challenge,body.code))return responseJSON({error:'Invalid or expired billing verification code.'},403);
   // Atomic replay protection; hashed challenge is never a customer identifier.
   const once=await db.prepare('INSERT INTO auth_rate_limits(bucket,window_start_ms,hits) VALUES(?,?,1) ON CONFLICT(bucket) DO NOTHING').bind(await sha256('portal-consumed:'+challenge),Date.now()).run();
   if(!changes(once))return responseJSON({error:'Verification code already used. Request a new code.'},409);
   const result=await paddleData(env,'/customers/'+row.customer+'/portal-sessions',{subscription_ids:[row.subscription]});
   const url=verifiedPortalURL(result,row.customer,row.subscription);
   if(!url)return responseJSON({error:'Provider returned an invalid portal session.'},503);
   return responseJSON({url,authenticatedPortal:true},200,{'set-cookie':cookie(proofCookie,'',0)});
  }
  const links=obj(remote.management_urls);
  const url=emailPortalURL(links?.view_subscription,row.subscription)||emailPortalURL(links?.update_payment_method,row.subscription)||emailPortalURL(links?.cancel,row.subscription);
  if(!url)return responseJSON({error:'Open the billing link in your Paddle receipt to sign in by email.'},409);
  return responseJSON({url});
 }catch(e){return e instanceof ApiError?responseJSON({error:e.message},e.status):responseJSON({error:'Billing portal unavailable. Use the billing link in your Paddle receipt.'},503);}
}
