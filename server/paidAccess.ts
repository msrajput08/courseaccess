import {owner,type LiveCheckoutEnv} from './liveCheckout';
import {responseJSON,requireSameOrigin,readBody,ApiError,rateLimit} from './accountSecurity';
export function paidPeriodValid(status:unknown,end:unknown,now=Date.now()):boolean{
 return status==='past_due'||((status==='active'||status==='trialing')&&typeof end==='number'&&Number.isSafeInteger(end)&&end>now);
}
async function access(req:Request,env:LiveCheckoutEnv){
 const account=await owner(req,env);
 if(!account||!env.DB||env.COURSEACCESS_PAID_FEATURES_ENABLED!=='true')return {account,pro:false,institution:false};
 const rows=await env.DB.prepare("SELECT s.tier,c.provider_status AS status,s.period_end_ms FROM subscriptions s JOIN paddle_subscription_catalog c ON c.subscription_id=s.provider_subscription_ref AND c.customer_id=s.provider_customer_ref AND c.scope_review=0 WHERE s.provider='paddle' AND s.verified_at_ms IS NOT NULL AND s.provider_subscription_ref IS NOT NULL AND NOT EXISTS(SELECT 1 FROM paddle_subscription_holds h WHERE h.subscription_id=s.provider_subscription_ref) AND ((s.owner_kind='account' AND s.owner_id=? AND s.tier='pro') OR (s.owner_kind='organization' AND s.tier='institution' AND EXISTS(SELECT 1 FROM organization_members m WHERE m.organization_id=s.owner_id AND m.account_id=?)))").bind(account,account).all<{tier:string;status:string;period_end_ms:number}>();
 const active=rows.results.filter(s=>paidPeriodValid(s.status,s.period_end_ms));
 return {account,pro:active.some(s=>s.tier==='pro'),institution:active.some(s=>s.tier==='institution')};
}
export async function handleEntitlements(req:Request,env:LiveCheckoutEnv):Promise<Response>{
 try{
  const a=await access(req,env);
  return responseJSON({authenticated:!!a.account,paidFeaturesEnabled:a.pro||a.institution,features:{'pdf-inspection':true,'semantic-html':true,'advanced-remediation':false,'history-cloud':a.pro||a.institution,'team-workspace':false}});
 }catch{return responseJSON({error:'Entitlements unavailable.'},503);}
}
export async function handlePaidReviewHistory(req:Request,env:LiveCheckoutEnv):Promise<Response>{
 try{
  const a=await access(req,env);
  if(!a.account)return responseJSON({error:'Sign in first.'},401);
  if(!env.DB)return responseJSON({error:'Unavailable.'},503);
  const db=env.DB;
  requireSameOrigin(req);
  // Permit deletion even after expiry; customer controls stored metadata.
  if(req.method==='DELETE'){await db.prepare('DELETE FROM paid_review_history WHERE account_id=?').bind(a.account).run();return responseJSON({deleted:true});}
  if(!a.pro&&!a.institution)return responseJSON({error:'Active subscription required.'},403);
  if(req.method==='GET'){
   const rows=await db.prepare('SELECT id,page_count,finding_count,created_at_ms FROM paid_review_history WHERE account_id=? ORDER BY created_at_ms DESC LIMIT 100').bind(a.account).all();
   return responseJSON({history:rows.results});
  }
  await rateLimit(db,req,'paid-review-history',100);
  const body=await readBody(req);
  const count=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
  if(!count(body.pageCount,1,10000)||!count(body.findingCount,0,100000))return responseJSON({error:'Invalid summary counts.'},400);
  const id=crypto.randomUUID();
  await db.batch([
   db.prepare('INSERT INTO paid_review_history(id,account_id,page_count,finding_count,created_at_ms) VALUES(?,?,?,?,?)').bind(id,a.account,body.pageCount,body.findingCount,Date.now()),
   db.prepare('DELETE FROM paid_review_history WHERE account_id=? AND id NOT IN (SELECT id FROM paid_review_history WHERE account_id=? ORDER BY created_at_ms DESC,id DESC LIMIT 100)').bind(a.account,a.account),
  ]);
  return responseJSON({saved:true},201);
 }catch(e){return e instanceof ApiError?responseJSON({error:e.message},e.status):responseJSON({error:'History unavailable.'},503);}
}
