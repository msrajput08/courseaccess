// No secrets or raw provider responses may appear in stdout.
const key=process.env.PADDLE_LIVE_API_KEY||'',secret=process.env.PADDLE_LIVE_WEBHOOK_SECRET||'',token=process.env.PADDLE_LIVE_CLIENT_TOKEN||'';
if(!key.startsWith('pdl_live_apikey_')||!secret||!token.startsWith('live_'))throw Error('Live credential configuration incomplete.');
let failures=0;
function check(label,value){console.log(label+': '+(value?'PASS':'FAIL'));if(!value)failures++;}
async function get(path){
 const r=await fetch('https://api.paddle.com'+path,{headers:{Authorization:'Bearer '+key,Accept:'application/json','Paddle-Version':'1'},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!r.ok){console.log(path+': HTTP '+r.status);failures++;return null;}
 return (await r.json()).data;
}
const expected='https://courseaccess.minty-12-shar.workers.dev';
const events=['transaction.completed','transaction.payment_failed','transaction.past_due','transaction.canceled','subscription.created','subscription.updated','subscription.canceled','subscription.activated','subscription.trialing','subscription.paused','subscription.resumed','subscription.past_due','customer.created','customer.updated','adjustment.created','adjustment.updated'];
const rows=await get('/notification-settings?per_page=200&active=true');
const matches=Array.isArray(rows)?rows.filter(r=>r.type==='url'&&r.active===true&&r.destination===expected+'/api/billing/webhook'&&['platform','all'].includes(r.traffic_source)):[];
check('Exactly one active live notification destination',matches.length===1);
const destination=matches[0];
if(destination){
 check('Saved signing secret matches live Paddle destination',destination.endpoint_secret_key===secret);
 const selected=new Set((destination.subscribed_events||[]).map(x=>x.name));
 for(const event of events)check('Subscribed '+event,selected.has(event));
 console.log('Simulation traffic enabled: '+String(destination.traffic_source==='all'));
}
const checkout=await get('/settings/checkout-url');
check('Exact live default payment link',checkout?.default_url===expected+'/checkout');
const catalog=[
 ['Professor Pro','pro_01m87ccf14cemskhymbze0w9gd','pri_01m87cf8a3d6nedgenr8jmhzwc','1200'],
 ['Institution','pro_01m87cg6jmsj8ptqynxa1rf10h','pri_01m87chg5xqcnggt17wvsknvw9','7900']
];
for(const [name,productId,priceId,amount] of catalog){
 const product=await get('/products/'+productId),price=await get('/prices/'+priceId);
 check(name+' live product and monthly price',product?.id===productId&&product?.status==='active'&&price?.id===priceId&&price?.product_id===productId&&price?.status==='active'&&price?.unit_price?.amount===amount&&price?.unit_price?.currency_code==='USD'&&price?.billing_cycle?.interval==='month'&&price?.billing_cycle?.frequency===1);
}
// Check that the receiver rejects unsigned events without creating any records.
const r=await fetch(expected+'/api/billing/webhook',{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(5000)});
check('Production unsigned webhook rejected',r.status===400);
console.log('Read-only configuration checks only; no checkout, email, simulation or payment initiated.');
if(failures){console.log('Failed checks: '+failures);process.exitCode=1;}
