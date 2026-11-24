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
const intents=await sql("SELECT i.id,i.state,i.transaction_id,s.provider_subscription_ref,c.provider_status FROM paddle_checkout_intents i LEFT JOIN subscriptions s ON s.owner_kind='account' AND s.owner_id=i.account_id AND s.id LIKE 'qa-%' LEFT JOIN paddle_subscription_catalog c ON c.subscription_id=s.provider_subscription_ref WHERE i.id LIKE 'qa-%' ORDER BY i.created_at_ms DESC LIMIT 20");
check('Completed private checkout evidence exists',intents.some(i=>i.state==='completed'&&i.transaction_id&&i.provider_subscription_ref));
check('No unresolved private checkout',intents.every(i=>['completed','canceled'].includes(i.state)));
for(const i of intents.filter(x=>x.state==='completed')){
 if(!/^txn_[a-z0-9]{26}$/.test(i.transaction_id||'')||!/^sub_[a-z0-9]{26}$/.test(i.provider_subscription_ref||'')){check('Test mapping valid',false);continue;}
 const tx=await paddle('/transactions/'+i.transaction_id),sub=await paddle('/subscriptions/'+i.provider_subscription_ref);
 check('Real checkout completed with zero total',tx.status==='completed'&&tx.details?.totals?.total==='0'&&tx.custom_data?.courseaccess_intent===i.id&&tx.subscription_id===sub.id);
 check('Test subscription canceled at Paddle',sub.status==='canceled');
 check('Test cancellation synchronized in D1',i.provider_status==='canceled');
}
const discounts=await paddle('/discounts?per_page=200&status=active,archived');
check('Private test discounts archived',Array.isArray(discounts)&&discounts.length<200&&discounts.filter(x=>x.description==='CourseAccess private live verification — zero cost').length>0&&discounts.filter(x=>x.description==='CourseAccess private live verification — zero cost').every(x=>x.status==='archived'));
const destinations=await paddle('/notification-settings?per_page=200&active=true');
check('Production webhook destination exists',destinations.filter(x=>x.destination===endpoint&&x.active===true).length===1);
console.log('Read-only launch cleanup audit. No charges, subscriptions, or discounts modified.');
if(failed)process.exitCode=1;
