import {randomBytes} from 'node:crypto';
const key=process.env.PADDLE_LIVE_API_KEY||'';
if(!key.startsWith('pdl_live_apikey_'))throw Error('Live API key missing');
const headers={Authorization:'Bearer '+key,Accept:'application/json','Content-Type':'application/json','Paddle-Version':'1'};
const description='CourseAccess private live verification — zero cost',price='pri_01m87cf8a3d6nedgenr8jmhzwc';
async function api(path,body){const r=await fetch('https://api.paddle.com'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Paddle '+path.split('?')[0]+' HTTP '+r.status);return (await r.json()).data;}
const all=await api('/discounts?per_page=200');
if(!Array.isArray(all)||all.length===200)throw Error('Discount catalog incomplete; refusing duplicate creation');
const existing=all.filter(d=>d.description===description&&d.status==='active'&&d.times_used===0&&Date.parse(d.expires_at)>Date.now());
if(existing.length){if(existing.length!==1)throw Error('Multiple private discounts exist');console.log('Existing private verification discount retained. Code visible only in Paddle dashboard.');}
else{
 const code='CAQA'+randomBytes(12).toString('hex').toUpperCase();
 const d=await api('/discounts',{description,type:'percentage',amount:'100',code,enabled_for_checkout:true,recur:true,maximum_recurring_intervals:null,usage_limit:1,restrict_to:[price],expires_at:new Date(Date.now()+48*3600000).toISOString()});
 if(d.code!==code||Number(d.amount)!==100||d.recur!==true||d.maximum_recurring_intervals!==null||d.usage_limit!==1||d.restrict_to?.length!==1||d.restrict_to[0]!==price)throw Error('Provider discount response did not meet zero-cost test policy');
 console.log('Created one restricted 100% recurring discount, redemption expires in 48 hours. Read code in authenticated Paddle dashboard. No payment or transaction created.');
}
