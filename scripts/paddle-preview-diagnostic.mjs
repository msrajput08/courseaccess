const key=process.env.PADDLE_LIVE_API_KEY;
if(!key)throw Error('API key missing');
async function call(path,body){
 const r=await fetch('https://api.paddle.com'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,Accept:'application/json','Content-Type':'application/json','Paddle-Version':'1'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 const x=await r.json();
 console.log(path.split('?')[0]+' HTTP '+r.status+' error code: '+(typeof x.error?.code==='string'&&/^[a-z0-9_]+$/.test(x.error.code)?x.error.code:'none'));
 if(Array.isArray(x.error?.errors))console.log('Validation fields: '+x.error.errors.map(e=>typeof e.field==='string'&&/^[a-z0-9_.\[\]]+$/.test(e.field)?e.field:'unknown').join(', '));
 return x.data;
}
const all=await call('/discounts?per_page=200');
const d=all?.find(x=>x.description==='CourseAccess private live verification — zero cost'&&x.status==='active'&&x.times_used===0);
if(!d)throw Error('No unused private discount');
console.log('Discount: percentage='+String(d.type==='percentage'&&Number(d.amount)===100)+' recurring='+String(d.recur===true&&d.maximum_recurring_intervals===null)+' restricted='+String(d.restrict_to?.length===1&&d.restrict_to[0]==='pri_01m87cf8a3d6nedgenr8jmhzwc')+' single use='+String(d.usage_limit===1));
const input={items:[{price_id:'pri_01m87cf8a3d6nedgenr8jmhzwc',quantity:1}],discount_id:d.id};
for(const [name,body] of [['original',{...input,collection_mode:'automatic'}],['currency only',{...input,currency_code:'USD'}],['country and currency',{...input,currency_code:'USD',address:{country_code:'IN'}}]]){
 const result=await call('/transactions/preview',body);
 console.log(name+': '+(result?.details?.totals?.total==='0'?'ZERO VERIFIED':result?'nonzero or missing total':'preview failed'));
}
console.log('No payment or transaction created.');
