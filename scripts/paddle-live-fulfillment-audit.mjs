// Read-only audit; no customer identifiers, payment details, codes or tokens are logged.
const {PADDLE_LIVE_API_KEY:key,CLOUDFLARE_API_TOKEN:cf,CLOUDFLARE_ACCOUNT_ID:account}=process.env;
if(!key||!cf||!account)throw Error('Missing read-only audit credentials');
const endpoint='https://courseaccess.minty-12-shar.workers.dev/api/billing/webhook';
let failed=0;
const check=(label,ok)=>{console.log(label+': '+(ok?'PASS':'FAIL'));if(!ok)failed++;};
async function paddle(path){const r=await fetch('https://api.paddle.com'+path,{headers:{Authorization:'Bearer '+key,'Paddle-Version':'1'},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Paddle '+path.split('?')[0]+' HTTP '+r.status);return (await r.json()).data;}
async function cloud(path,body){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+cf,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('D1 read API HTTP '+r.status);const j=await r.json();if(!j.success)throw Error('D1 read failed');return j.result;}
const dbs=await cloud('?name=courseaccess-primary');
const db=dbs.filter(x=>x.name==='courseaccess-primary');if(db.length!==1)throw Error('D1 database not uniquely resolved');
async function sql(query,params=[]){const result=await cloud('/'+db[0].uuid+'/query',{sql:query,params});if(result.some(x=>!x.success))throw Error('D1 query unsuccessful');return result.flatMap(x=>x.results||[]);}
const intents=await sql("SELECT i.id,i.state,i.transaction_id,i.account_id,s.id AS subscription_row_id,s.provider_subscription_ref,s.provider_customer_ref,s.status,c.provider_status,c.price_id,c.product_id,c.scope_review,s.period_end_ms,(SELECT COUNT(*) FROM paddle_subscription_holds h WHERE h.subscription_id=s.provider_subscription_ref) AS holds FROM paddle_checkout_intents i LEFT JOIN subscriptions s ON s.owner_kind='account' AND s.owner_id=i.account_id AND s.id LIKE 'qa-%' LEFT JOIN paddle_subscription_catalog c ON c.subscription_id=s.provider_subscription_ref WHERE i.id LIKE 'qa-%' ORDER BY i.created_at_ms DESC LIMIT 5");
check('Private checkout intent found',intents.length>0);
if(!intents.length)process.exit(1);
const intent=intents[0];
console.log('Intent state: '+intent.state);
check('Paddle transaction linked to intent',/^txn_[a-z0-9]{26}$/.test(intent.transaction_id||''));
if(!/^txn_[a-z0-9]{26}$/.test(intent.transaction_id||''))process.exit(1);
const tx=await paddle('/transactions/'+intent.transaction_id);
check('Real live transaction completed',tx.status==='completed');
check('Transaction total zero',tx.details?.totals?.total==='0');
check('Transaction belongs to private intent',tx.custom_data?.courseaccess_intent===intent.id);
check('Correct Professor Pro price',tx.items?.length===1&&tx.items[0]?.price?.id==='pri_01m87cf8a3d6nedgenr8jmhzwc');
check('Live subscription created',/^sub_[a-z0-9]{26}$/.test(tx.subscription_id||''));
if(!/^sub_[a-z0-9]{26}$/.test(tx.subscription_id||''))process.exit(1);
const sub=await paddle('/subscriptions/'+tx.subscription_id);
console.log('Live provider subscription status: '+sub.status);
check('Subscription customer matches transaction',sub.customer_id===tx.customer_id);
check('Subscription active or trialing',['active','trialing'].includes(sub.status));
const destinations=await paddle('/notification-settings?per_page=200&active=true');
const dest=destinations.filter(x=>x.destination===endpoint&&x.active===true);
check('Live notification destination uniquely identified',dest.length===1);
if(dest.length===1){
 const notifications=await paddle('/notifications?per_page=200&notification_setting_id='+encodeURIComponent(dest[0].id));
 const completed=notifications.filter(n=>n.payload?.event_type==='transaction.completed'&&n.payload?.data?.id===tx.id);
 check('Paddle transaction.completed delivered (2xx)',completed.some(n=>n.status==='delivered'));
 for(const n of completed.filter(n=>n.status==='delivered').slice(0,1)){
  const receipts=await sql("SELECT r.applied_at_ms,i.event_type FROM paddle_event_inbox i JOIN payment_event_receipts r ON r.provider='paddle' AND r.provider_event_id=i.event_id WHERE i.event_id=? AND i.object_id=?",[n.payload.event_id,tx.id]);
  check('Actual signed event persisted in D1',receipts.length===1&&receipts[0].event_type==='transaction.completed');
  check('Actual fulfillment receipt applied',receipts.length===1&&receipts[0].applied_at_ms!==null);
 }
}
check('Intent completed in production D1',intent.state==='completed');
check('Production customer and subscription mapping',intent.provider_customer_ref===tx.customer_id&&intent.provider_subscription_ref===tx.subscription_id);
check('Production mirrored catalog and status',intent.price_id==='pri_01m87cf8a3d6nedgenr8jmhzwc'&&intent.product_id==='pro_01m87ccf14cemskhymbze0w9gd'&&intent.provider_status===sub.status);
check('Test account entitled by production SQL rules',String(intent.subscription_row_id||'').startsWith('qa-')&&intent.scope_review===0&&intent.holds===0&&(intent.provider_status==='past_due'||(['active','trialing'].includes(intent.provider_status)&&intent.period_end_ms>Date.now())));
console.log('Read-only evidence; no subscription or discount changed.');
if(failed)process.exitCode=1;
