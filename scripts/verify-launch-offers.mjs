import {writeFileSync} from 'node:fs';
const key=process.env.PADDLE_LIVE_API_KEY;
if(!key||!process.env.RUNNER_TEMP)throw Error('Missing audit credentials');
const specs=[['pro','PROLAUNCH25',25,'pri_01m87cf8a3d6nedgenr8jmhzwc','pro_01m87ccf14cemskhymbze0w9gd',900],['institution','INSTLAUNCH',12.66,'pri_01m87chg5xqcnggt17wvsknvw9','pro_01m87cg6jmsj8ptqynxa1rf10h',6900]];
async function call(path,body){const r=await fetch('https://api.paddle.com'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Paddle-Version':'1'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(path.split('?')[0]+' HTTP '+r.status);return (await r.json()).data;}
const cfg={};
if(Date.now()<Date.parse('2026-12-27T00:00:00Z')){
 for(const [tier,code,percent,price,product,expected] of specs){
  const list=await call('/discounts?code='+encodeURIComponent(code)+'&status=active');
  if(!Array.isArray(list)||list.length!==1)throw Error(tier+' discount missing or ambiguous');
  const d=list[0],expires=Date.parse(d.expires_at);
  if(expires<=Date.now()&&expires>=Date.parse('2026-12-24T00:00:00Z'))continue;
  console.log(tier+' settings: '+JSON.stringify({status:d.status,type:d.type,percentage:d.amount,recur:d.recur,billingPeriods:d.maximum_recurring_intervals,usageLimit:d.usage_limit,checkoutEnabled:d.enabled_for_checkout,restrictedToExpected:Array.isArray(d.restrict_to)&&d.restrict_to.length===1&&[price,product].includes(d.restrict_to[0]),restrictionCount:Array.isArray(d.restrict_to)?d.restrict_to.length:0,expiresAt:d.expires_at,codeMatches:String(d.code).toUpperCase()===code}));
  if(!/^dsc_[a-z0-9]{26}$/.test(d.id)||d.status!=='active'||String(d.code).toUpperCase()!==code||d.type!=='percentage'||Number(d.amount)!==percent||d.recur!==true||d.maximum_recurring_intervals!==12||d.usage_limit!==null||d.enabled_for_checkout!==true||!Array.isArray(d.restrict_to)||d.restrict_to.length!==1||![price,product].includes(d.restrict_to[0])||!Number.isFinite(expires)||expires<Date.parse('2026-12-24T00:00:00Z')||expires>Date.parse('2026-12-27T00:00:00Z'))throw Error(tier+' discount settings mismatch (percentage, recurring periods, restriction, expiry or redemption limit)');
  const preview=await call('/transactions/preview',{items:[{price_id:price,quantity:1}],discount_id:d.id,currency_code:'USD'});
  const totals=preview.details?.totals;
  if(!totals||Number(totals.subtotal)-Number(totals.discount)!==expected)throw Error(tier+' USD pre-tax amount does not match expected offer');
  cfg[tier]={id:d.id,expiresAt:d.expires_at};
  console.log(tier+' PASS: USD '+(expected/100)+'/month, 12 billing periods, expires '+d.expires_at);
 }
}
writeFileSync(process.env.RUNNER_TEMP+'/courseaccess-launch-offers.json',JSON.stringify(cfg),{mode:0o600});
console.log('Read-only provider validation, no transaction or payment created.');
