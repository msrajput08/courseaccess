// Read-only audit, never prints credentials or full API responses.
const expected=[
 {name:'Professor Pro',product:'pro_01m87ccf14cemskhymbze0w9gd',price:'pri_01m87cf8a3d6nedgenr8jmhzwc',amount:'1200'},
 {name:'Institution',product:'pro_01m87cg6jmsj8ptqynxa1rf10h',price:'pri_01m87chg5xqcnggt17wvsknvw9',amount:'7900'}
];
let blocked=false;
async function audit(name,base,key,token){
 const live=name==='live';
 const keyOK=key.startsWith(live?'pdl_live_apikey_':'pdl_sdbx_apikey_');
 const tokenOK=token.startsWith(live?'live_':'test_');
 console.log(name+': API key configured with correct prefix: '+keyOK+'; client token prefix correct: '+tokenOK);
 if(!tokenOK)blocked=true;
 if(!keyOK){blocked=true;return;}
 async function get(path){
   try{
     const r=await fetch(base+path,{headers:{Authorization:'Bearer '+key,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
     if(!r.ok){console.log(name+' '+path+': HTTP '+r.status);blocked=true;return null;}
     return (await r.json()).data??null;
   }catch{console.log(name+' '+path+': unavailable');blocked=true;return null;}
 }
 if(live)for(const p of expected){
   const product=await get('/products/'+p.product),price=await get('/prices/'+p.price);
   const ok=product?.id===p.product&&product?.status==='active'&&price?.product_id===p.product&&price?.status==='active'&&price?.unit_price?.amount===p.amount&&price?.unit_price?.currency_code==='USD'&&price?.billing_cycle?.interval==='month'&&price?.billing_cycle?.frequency===1;
   console.log(p.name+' active USD monthly catalog match: '+ok);
   if(!ok)blocked=true;
 }
 for(const path of ['/products','/prices','/discounts','/client-tokens','/notification-settings','/settings/checkout-payment-methods','/settings/tax','/settings/balance-currency','/settings/checkout-url','/checkout-domains']){
   const data=await get(path);
   if(data!==null)console.log(name+' '+path+': readable'+(Array.isArray(data)?'; first-page entries: '+data.length:''));
 }
}
await audit('live','https://api.paddle.com',process.env.PADDLE_LIVE_API_KEY||'',process.env.PADDLE_LIVE_CLIENT_TOKEN||'');
await audit('sandbox','https://sandbox-api.paddle.com',process.env.PADDLE_SANDBOX_API_KEY||'',process.env.PADDLE_SANDBOX_CLIENT_TOKEN||'');
console.log('Read-only preflight, not migration. No payments, verification, or account modifications.');
if(blocked){console.log('Preflight incomplete: missing credentials, permissions or catalog mismatch.');process.exitCode=1;}
