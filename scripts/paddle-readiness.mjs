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
   if(data===null)continue;
   console.log(name+' '+path+': readable'+(Array.isArray(data)?'; first-page entries: '+data.length:''));
   if(path==='/client-tokens'&&Array.isArray(data)){
     const match=data.find(t=>t.token===token);
     console.log(name+' exact saved client token present: '+Boolean(match)+'; status: '+(match?.status==='active'?'active':match?.status==='revoked'?'revoked':'unknown'));
     if(!match||match.status!=='active')blocked=true;
   }
   if(path==='/settings/checkout-payment-methods'){
     for(const [method,value] of Object.entries(data.payment_methods||{})){
       if(/^[a-z0-9_]+$/.test(method))console.log(name+' payment method '+method+': enabled='+String(value.enabled===true)+' available='+String(value.available===true));
     }
   }
   if(path==='/settings/tax')console.log(name+' default tax mode: '+(['internal','external','location','account_setting','inclusive','exclusive'].includes(data.default_tax_mode)?data.default_tax_mode:'unknown'));
   if(path==='/settings/balance-currency'){
     const currency=x=>typeof x==='string'&&/^[A-Z]{3}$/.test(x)?x:'unknown';
     console.log(name+' balance currency primary: '+currency(data.primary)+'; preferred: '+currency(data.preferred));
   }
   if(path==='/checkout-domains'&&Array.isArray(data)){
     const match=data.find(d=>d.domain==='courseaccess.minty-12-shar.workers.dev');
     const status=['approved','pending','rejected','action_required','in_review','submitted','unapproved'].includes(match?.status)?match.status:'unknown';
     console.log(name+' expected checkout domain present: '+Boolean(match)+'; approval status: '+status);
   }
   if(path==='/settings/checkout-url'){
     if(!data.default_url){console.log(name+' default payment link: unset');if(live)blocked=true;}
     else {let matches=false;try{matches=new URL(data.default_url).href==='https://courseaccess.minty-12-shar.workers.dev/checkout';}catch{}console.log(name+' default payment link: configured; matches exact checkout URL: '+matches);if(live&&!matches)blocked=true;}
   }
 }
}
await audit('live','https://api.paddle.com',process.env.PADDLE_LIVE_API_KEY||'',process.env.PADDLE_LIVE_CLIENT_TOKEN||'');
// CourseAccess uses a live account. Optional sandbox credentials are not a live preflight blocker.
if(process.env.PADDLE_SANDBOX_API_KEY&&process.env.PADDLE_SANDBOX_CLIENT_TOKEN)await audit('sandbox','https://sandbox-api.paddle.com',process.env.PADDLE_SANDBOX_API_KEY,process.env.PADDLE_SANDBOX_CLIENT_TOKEN);
else console.log('Sandbox account audit skipped (not configured). No transaction was created.');
console.log('Read-only preflight, not migration. No payments, verification, or account modifications.');
if(blocked){console.log('Preflight incomplete: missing credentials, permissions or catalog mismatch.');process.exitCode=1;}
