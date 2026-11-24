import {owner,paddleData,type LiveCheckoutEnv} from './liveCheckout';
import {canonicalSubscription} from './paddleReconcile';
import {ApiError,changes,getCookie,readBody,requireRecentVerification,requireSameOrigin,responseJSON,sessionCookie,sha256,validId,rateLimit} from './accountSecurity';
export async function handleScopeChange(req:Request,env:LiveCheckoutEnv):Promise<Response>{
 try{
  requireSameOrigin(req);
  const account=await owner(req,env);
  if(!account||!env.DB)return responseJSON({error:'Sign in with your passkey first.'},401);
  const db=env.DB;
  const session=await db.prepare('SELECT issued_at_ms FROM sessions WHERE token_hash=? AND account_id=? AND revoked_at_ms IS NULL AND expires_at_ms>?').bind(await sha256(getCookie(req,sessionCookie)!),account,Date.now()).first<{issued_at_ms:number}>();
  if(!session)return responseJSON({error:'Sign in again.'},401);
  requireRecentVerification(session);
  await rateLimit(db,req,'billing-scope',12);
  const body=await readBody(req),fromOrg=body.sourceOrganizationId,toOrg=body.targetOrganizationId;
  if((fromOrg===undefined)===(toOrg===undefined)||!validId(fromOrg??toOrg))return responseJSON({error:'Choose one organization.'},400);
  const org=String(fromOrg??toOrg),fromKind=fromOrg?'organization':'account',toKind=fromOrg?'account':'organization',fromId=fromOrg?org:account,toId=fromOrg?account:org;
  const tier=fromOrg?'pro':'institution';
  if(!await db.prepare("SELECT 1 FROM organization_members WHERE account_id=? AND organization_id=? AND role='owner'").bind(account,org).first())return responseJSON({error:'Only the institution owner may assign billing access.'},403);
  const rows=await db.prepare("SELECT s.provider_subscription_ref AS subscription,s.provider_customer_ref AS customer,c.updated_at_ms FROM subscriptions s JOIN paddle_subscription_catalog c ON c.subscription_id=s.provider_subscription_ref WHERE s.owner_kind=? AND s.owner_id=? AND s.provider='paddle' AND c.scope_review=1 AND c.provider_status IN ('active','trialing','past_due') AND NOT EXISTS(SELECT 1 FROM paddle_subscription_holds h WHERE h.subscription_id=s.provider_subscription_ref)").bind(fromKind,fromId).all<{subscription:string;customer:string;updated_at_ms:number}>();
  if(rows.results.length!==1)return responseJSON({error:'Exactly one verified plan change must be awaiting assignment.'},409);
  const row=rows.results[0];
  if(!/^sub_[a-z0-9]{26}$/.test(row.subscription)||!/^ctm_[a-z0-9]{26}$/.test(row.customer))return responseJSON({error:'Invalid billing reference.'},409);
  const remote=canonicalSubscription(await paddleData(env,'/subscriptions/'+row.subscription));
  if(!remote||remote.id!==row.subscription||remote.customer!==row.customer||remote.tier!==tier||remote.updated!==row.updated_at_ms||!['active','trialing','past_due'].includes(remote.providerStatus))return responseJSON({error:'Plan state changed. Refresh after billing synchronization.'},409);
  // Scope assignment does not change Paddle billing. The current owner explicitly
  // selects the recipient. D1 evaluates ownership, catalog version and conflicts
  // again inside a single atomic batch; a concurrent webhook cannot grant twice.
  const result=await db.batch([
   db.prepare("UPDATE subscriptions SET owner_kind=?,owner_id=?,tier=? WHERE provider='paddle' AND provider_subscription_ref=? AND provider_customer_ref=? AND owner_kind=? AND owner_id=? AND EXISTS(SELECT 1 FROM organization_members WHERE organization_id=? AND account_id=? AND role='owner') AND EXISTS(SELECT 1 FROM paddle_subscription_catalog WHERE subscription_id=? AND scope_review=1 AND updated_at_ms=? AND price_id=? AND provider_status IN ('active','trialing','past_due')) AND NOT EXISTS(SELECT 1 FROM paddle_subscription_holds WHERE subscription_id=?) AND NOT EXISTS(SELECT 1 FROM subscriptions WHERE owner_kind=? AND owner_id=? AND provider='paddle' AND status IN ('active','trialing','past_due')) AND NOT EXISTS(SELECT 1 FROM paddle_intent_owners o JOIN paddle_checkout_intents i ON i.id=o.intent_id WHERE o.owner_kind=? AND o.owner_id=? AND i.state IN ('creating','ready','review'))").bind(toKind,toId,tier,row.subscription,row.customer,fromKind,fromId,org,account,row.subscription,remote.updated,remote.priceId,row.subscription,toKind,toId,toKind,toId),
   db.prepare("UPDATE paddle_subscription_catalog SET scope_review=0 WHERE subscription_id=? AND updated_at_ms=? AND price_id=? AND EXISTS(SELECT 1 FROM subscriptions WHERE provider_subscription_ref=? AND owner_kind=? AND owner_id=? AND tier=?)").bind(row.subscription,remote.updated,remote.priceId,row.subscription,toKind,toId,tier)
  ]);
  if(!changes(result[0] as {meta?:{changes?:number};changes?:number}))return responseJSON({error:'Billing assignment conflicted with another subscription or checkout. No change made.'},409);
  return responseJSON({assigned:true});
 }catch(e){return e instanceof ApiError?responseJSON({error:e.message},e.status):responseJSON({error:'Unable to assign plan access.'},503);}
}
