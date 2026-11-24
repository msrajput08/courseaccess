import {activeAccountService,getCookie,sessionCookie,sha256,responseJSON,type AccountEnv} from './accountSecurity';
import {verifyPaddleWebhook,type VerifiedPaddleEvent} from './paddleWebhook';
import {reconcilePaddleEvent} from './paddleReconcile';
export interface BillingExecutionContext {waitUntil(promise:Promise<unknown>):void}
export interface BillingEnv extends AccountEnv {
  PADDLE_LIVE_WEBHOOK_SECRET?:string;
  COURSEACCESS_LIVE_WEBHOOK_INBOX_ENABLED?:string;
  COURSEACCESS_PADDLE_RECONCILE_ENABLED?:string;
  PADDLE_LIVE_API_KEY?:string;
  COURSEACCESS_PAID_FEATURES_ENABLED?:string;
}
const productionOrigin='https://courseaccess.minty-12-shar.workers.dev';
// This is an inbox only. It must never enable a paid entitlement.
export function inboxEnabled(request:Request,env:BillingEnv):boolean{
  return env.COURSEACCESS_LIVE_WEBHOOK_INBOX_ENABLED==='true'&&!!env.PADDLE_LIVE_WEBHOOK_SECRET&&!!env.DB&&new URL(request.url).origin===productionOrigin;
}
export async function handleBillingStatus(request:Request,env:BillingEnv):Promise<Response>{
  const empty={authenticated:false,billingEnabled:false,subscription:null};
  if(!activeAccountService(request,env)||!env.DB)return responseJSON(empty);
  const cookie=getCookie(request,sessionCookie);
  if(!cookie||!/^[a-zA-Z0-9_-]{40,50}$/.test(cookie))return responseJSON(empty);
  try{
    const id=await env.DB.prepare('SELECT s.account_id FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.revoked_at_ms IS NULL AND s.expires_at_ms>? AND a.deleted_at_ms IS NULL').bind(await sha256(cookie),Date.now()).first<{account_id:string}>();
    if(!id)return responseJSON(empty);
    const sub=await env.DB.prepare("SELECT tier,status,period_end_ms FROM subscriptions WHERE owner_kind='account' AND owner_id=? AND provider='paddle' AND verified_at_ms IS NOT NULL ORDER BY verified_at_ms DESC LIMIT 1").bind(id.account_id).first<{tier:string;status:string;period_end_ms:number|null}>();
    const institutions=await env.DB.prepare("SELECT o.id AS organizationId,o.display_name AS name,s.status,s.period_end_ms AS periodEnd FROM organization_members m JOIN organizations o ON o.id=m.organization_id JOIN subscriptions s ON s.owner_kind='organization' AND s.owner_id=o.id WHERE m.account_id=? AND m.role='owner' AND s.provider='paddle' AND s.verified_at_ms IS NOT NULL ORDER BY s.verified_at_ms DESC").bind(id.account_id).all();
    return responseJSON({authenticated:true,billingEnabled:false,subscription:sub?{tier:sub.tier,status:sub.status,periodEnd:sub.period_end_ms}:null,institutions:institutions.results});
  }catch{return responseJSON({error:'Billing information unavailable.'},503);}
}
export function inboxEvent(event:VerifiedPaddleEvent){
  // Store only provider identifiers and event metadata, not customer names,
  // addresses, payment instruments, document content or raw webhook bodies.
  const prefix:Record<string,string>={subscription:'sub',transaction:'txn',adjustment:'adj',customer:'ctm'};
  const kind=event.eventType.split('.')[0];
  const objectId=event.data.id;
  if(!Object.hasOwn(prefix,kind)||typeof objectId!=='string'||!new RegExp('^'+prefix[kind]+'_[a-z0-9]{26}$').test(objectId))return null;
  return {id:event.eventId,type:event.eventType,occurred:Date.parse(event.occurredAt),objectId};
}
export async function handleLiveWebhook(request:Request,env:BillingEnv,ctx?:BillingExecutionContext):Promise<Response>{
  if(!inboxEnabled(request,env))return responseJSON({error:'Live webhook inbox disabled.'},503);
  let event:VerifiedPaddleEvent;
  try{event=await verifyPaddleWebhook(request,env.PADDLE_LIVE_WEBHOOK_SECRET!);}
  catch{return responseJSON({error:'Invalid webhook.'},400);}
  const entry=inboxEvent(event);
  if(!entry)return responseJSON({received:true,ignored:true,applied:false});
  try{
    const db=env.DB!;
    await db.batch([
      db.prepare("INSERT INTO paddle_event_inbox(event_id,event_type,occurred_at_ms,object_id,received_at_ms) VALUES(?,?,?,?,?) ON CONFLICT(event_id) DO NOTHING").bind(entry.id,entry.type,entry.occurred,entry.objectId,Date.now()),
      db.prepare("INSERT INTO payment_event_receipts(provider,provider_event_id,verified_at_ms) VALUES('paddle',?,?) ON CONFLICT(provider,provider_event_id) DO NOTHING").bind(entry.id,Date.now()),
    ]);
    // The eventual reconciliation consumer must fetch canonical provider state
    // and atomically apply entitlement changes before setting applied_at_ms.
    if(env.COURSEACCESS_PADDLE_RECONCILE_ENABLED==='true'){
      if(ctx){
        ctx.waitUntil(reconcilePaddleEvent(env,event).catch(()=>undefined));
        return responseJSON({received:true,queued:true,applied:false});
      }
      const applied=await reconcilePaddleEvent(env,event);
      return responseJSON({received:true,applied});
    }
    return responseJSON({received:true,applied:false});
  }catch{return responseJSON({error:'Webhook persistence unavailable; retry required.'},503);}
}

// Scheduled retries use the authenticated event references already persisted in D1.
// No raw personal payload is needed; the reconciler fetches current Paddle state.
export async function retryPaddleInbox(env:BillingEnv):Promise<void>{
 if(env.COURSEACCESS_PADDLE_RECONCILE_ENABLED!=='true'||env.COURSEACCESS_LIVE_WEBHOOK_INBOX_ENABLED!=='true'||!env.DB||!env.PADDLE_LIVE_API_KEY)return;
 const pending=await env.DB.prepare("SELECT i.event_id,i.event_type,i.occurred_at_ms,i.object_id FROM paddle_event_inbox i JOIN payment_event_receipts r ON r.provider='paddle' AND r.provider_event_id=i.event_id WHERE r.applied_at_ms IS NULL ORDER BY i.received_at_ms LIMIT 12").all<{event_id:string;event_type:string;occurred_at_ms:number;object_id:string}>();
 await Promise.allSettled(pending.results.map(row=>reconcilePaddleEvent(env,{eventId:row.event_id,eventType:row.event_type,occurredAt:new Date(row.occurred_at_ms).toISOString(),data:{id:row.object_id}})));
}
