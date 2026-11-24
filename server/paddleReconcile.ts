import type {BillingEnv} from './billingApi';
import type {VerifiedPaddleEvent} from './paddleWebhook';
import {paddleData,PRICE_IDS,transactionId,type CheckoutTier} from './liveCheckout';
import type {Database} from './accountSecurity';
const obj=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const providerId=(v:unknown,prefix:string):v is string=>typeof v==='string'&&new RegExp('^'+prefix+'_[a-z0-9]{26}$').test(v);
const time=(v:unknown):number|null=>typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
export function canonicalSubscription(data:Record<string,unknown>){
  if(!providerId(data.id,'sub')||!providerId(data.customer_id,'ctm'))return null;
  if(!Array.isArray(data.items)||data.items.length!==1)return null;
  const item=obj(data.items[0]),price=obj(item?.price);
  const tier=price?.id===PRICE_IDS.pro?'pro':price?.id===PRICE_IDS.institution?'institution':null;
  if(!tier||item?.quantity!==1)return null;
  const updated=time(data.updated_at),period=obj(data.current_billing_period);
  const start=time(period?.starts_at),end=time(period?.ends_at);
  const statuses:Record<string,string>={active:'active',trialing:'trialing',past_due:'past_due',paused:'past_due',canceled:'canceled'};
  const status=typeof data.status==='string'&&Object.prototype.hasOwnProperty.call(statuses,data.status)?statuses[data.status]:null;
  if(updated===null||!status||((start===null)!==(end===null))||(start!==null&&end!==null&&end<=start))return null;
  if(status==='active'&&(start===null||end===null))return null;
  return {id:data.id,customer:data.customer_id,tier,status,updated,start,end};
}
export function matchesInitialTransaction(data:Record<string,unknown>,id:string,tier:CheckoutTier='pro'){
  if(data.id!==id||data.status!=='completed'||!providerId(data.subscription_id,'sub')||!providerId(data.customer_id,'ctm'))return false;
  if(!Array.isArray(data.items)||data.items.length!==1)return false;
  const item=obj(data.items[0]);return item?.quantity===1&&obj(item.price)?.id===PRICE_IDS[tier];
}
type Owner={owner_kind:'account'|'organization';owner_id:string;tier:CheckoutTier;transaction_id?:string;provider_customer_ref:string|null;provider_subscription_ref:string|null};
async function receipt(db:Database,event:VerifiedPaddleEvent){
  await db.prepare("UPDATE payment_event_receipts SET applied_at_ms=? WHERE provider='paddle' AND provider_event_id=? AND applied_at_ms IS NULL").bind(Date.now(),event.eventId).run();
}
export async function reconcilePaddleEvent(env:BillingEnv,event:VerifiedPaddleEvent):Promise<boolean>{
  const db=env.DB!;
  const already=await db.prepare("SELECT applied_at_ms FROM payment_event_receipts WHERE provider='paddle' AND provider_event_id=?").bind(event.eventId).first<{applied_at_ms:number|null}>();
  if(already?.applied_at_ms!=null)return true;
  let owner:Owner|null=null;
  let subId:unknown;
  let intentId:string|null=null;
  if(event.eventType==='transaction.completed'&&transactionId(event.data.id)){
    const initial=await db.prepare("SELECT i.id,i.transaction_id,i.tier,o.owner_kind,o.owner_id FROM paddle_checkout_intents i JOIN paddle_intent_owners o ON o.intent_id=i.id JOIN accounts a ON a.id=i.account_id WHERE i.transaction_id=? AND i.state IN ('ready','completed') AND a.deleted_at_ms IS NULL").bind(event.data.id).first<{id:string;transaction_id:string;tier:CheckoutTier;owner_kind:'account'|'organization';owner_id:string}>();
    if(!initial){
      // An initial event can arrive before the intent write; do not permanently
      // acknowledge unresolved CourseAccess transactions.
      const tx=await paddleData(env,'/transactions/'+event.data.id);
      if(obj(tx.custom_data)?.courseaccess_intent)throw Error('Unresolved checkout intent');
      await receipt(db,event);return true;
    }
    const tx=await paddleData(env,'/transactions/'+event.data.id);
    if(!matchesInitialTransaction(tx,event.data.id,initial.tier))throw Error('Transaction reconciliation required');
    intentId=initial.id;subId=tx.subscription_id;
    owner={owner_kind:initial.owner_kind,owner_id:initial.owner_id,tier:initial.tier,transaction_id:initial.transaction_id,provider_customer_ref:String(tx.customer_id),provider_subscription_ref:String(subId)};
  }else if(event.eventType.startsWith('subscription.')&&providerId(event.data.id,'sub')){
    subId=event.data.id;
    const existing=await db.prepare("SELECT owner_kind,owner_id,tier,provider_customer_ref,provider_subscription_ref FROM subscriptions WHERE provider='paddle' AND provider_subscription_ref=?").bind(subId).first<Owner>();
    if(!existing){await receipt(db,event);return true;}
    owner=existing;
  }else if(event.eventType.startsWith('adjustment.')&&providerId(event.data.id,'adj')){
    const adjustment=await paddleData(env,'/adjustments/'+event.data.id);
    if(!providerId(adjustment.subscription_id,'sub')){
      if(!transactionId(adjustment.transaction_id)){await receipt(db,event);return true;}
      const tx=await paddleData(env,'/transactions/'+adjustment.transaction_id);
      subId=tx.subscription_id;
    }else subId=adjustment.subscription_id;
    if(!providerId(subId,'sub')){await receipt(db,event);return true;}
    // Conservative hold for approved refunds/chargebacks; no automatic reinstatement.
    if(adjustment.status==='approved'||adjustment.action==='chargeback'||adjustment.action==='chargeback_warning'){
      await db.batch([
        db.prepare("INSERT INTO paddle_subscription_holds(subscription_id,reason,created_at_ms) VALUES(?,'adjustment',?) ON CONFLICT(subscription_id) DO NOTHING").bind(subId,Date.now()),
        db.prepare("UPDATE subscriptions SET status='past_due' WHERE provider='paddle' AND provider_subscription_ref=? AND status IN ('active','trialing')").bind(subId),
        db.prepare("UPDATE payment_event_receipts SET applied_at_ms=? WHERE provider='paddle' AND provider_event_id=?").bind(Date.now(),event.eventId)
      ]);return true;
    }
    await receipt(db,event);return true;
  }else{await receipt(db,event);return true;}
  if(!owner||!providerId(subId,'sub'))throw Error('Unresolved subscription');
  const canonical=canonicalSubscription(await paddleData(env,'/subscriptions/'+subId));
  if(!canonical||canonical.id!==subId||canonical.customer!==owner.provider_customer_ref||canonical.tier!==owner.tier)throw Error('Subscription reconciliation required');
  const existing=await db.prepare("SELECT owner_kind,owner_id,tier,provider_customer_ref FROM subscriptions WHERE provider_subscription_ref=?").bind(subId).first<{owner_kind:string;owner_id:string;tier:string;provider_customer_ref:string}>();
  if(existing&&(existing.owner_id!==owner.owner_id||existing.owner_kind!==owner.owner_kind||existing.tier!==owner.tier||existing.provider_customer_ref!==canonical.customer))throw Error('Ownership conflict');
  const statements=[
    db.prepare("INSERT INTO subscriptions(id,owner_kind,owner_id,tier,status,provider,provider_customer_ref,provider_subscription_ref,period_start_ms,period_end_ms,verified_at_ms) SELECT ?, ?, ?, ?, CASE WHEN EXISTS(SELECT 1 FROM paddle_subscription_holds WHERE subscription_id=?) THEN 'past_due' ELSE ? END,'paddle',?,?,?,?,? WHERE (?='account' AND EXISTS(SELECT 1 FROM accounts WHERE id=? AND deleted_at_ms IS NULL)) OR (?='organization' AND EXISTS(SELECT 1 FROM organizations WHERE id=?)) ON CONFLICT(provider_subscription_ref) DO UPDATE SET status=excluded.status,period_start_ms=excluded.period_start_ms,period_end_ms=excluded.period_end_ms,verified_at_ms=excluded.verified_at_ms WHERE subscriptions.owner_id=excluded.owner_id AND subscriptions.owner_kind=excluded.owner_kind AND subscriptions.tier=excluded.tier AND subscriptions.provider_customer_ref=excluded.provider_customer_ref AND subscriptions.verified_at_ms<=excluded.verified_at_ms").bind(crypto.randomUUID(),owner.owner_kind,owner.owner_id,owner.tier,subId,canonical.status,canonical.customer,subId,canonical.start,canonical.end,canonical.updated,owner.owner_kind,owner.owner_id,owner.owner_kind,owner.owner_id),
    db.prepare("UPDATE payment_event_receipts SET applied_at_ms=? WHERE provider='paddle' AND provider_event_id=?").bind(Date.now(),event.eventId)
  ];
  if(intentId)statements.push(db.prepare("UPDATE paddle_checkout_intents SET state='completed' WHERE id=? AND transaction_id=? AND state='ready'").bind(intentId,owner.transaction_id));
  await db.batch(statements);
  return true;
}
