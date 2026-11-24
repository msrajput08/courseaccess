const bytes=(v:Uint8Array)=>Array.from(v,x=>x.toString(16).padStart(2,'0')).join('');
const encoder=new TextEncoder();
async function hmac(secret:string){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
function message(context:string,expiry:number,code:string){return encoder.encode(JSON.stringify(['courseaccess-portal-proof-v1',context,expiry,code]));}
export async function createPortalProof(secret:string,context:string,now=Date.now()){
 if(secret.length<32)throw Error('Portal proof secret missing');
 const code=bytes(crypto.getRandomValues(new Uint8Array(10))),expiry=now+300000;
 const signature=await crypto.subtle.sign('HMAC',await hmac(secret),message(context,expiry,code));
 return {code,challenge:String(expiry)+'.'+bytes(new Uint8Array(signature))};
}
export async function verifyPortalProof(secret:string,context:string,challenge:unknown,code:unknown,now=Date.now()){
 if(secret.length<32||typeof challenge!=='string'||typeof code!=='string'||!/^[0-9a-f]{20}$/.test(code)||!/^\d{13}\.[0-9a-f]{64}$/.test(challenge))return false;
 const [stamp,signature]=challenge.split('.'),expiry=Number(stamp);
 if(expiry<now||expiry>now+300000)return false;
 return crypto.subtle.verify('HMAC',await hmac(secret),new Uint8Array(signature.match(/../g)!.map(x=>parseInt(x,16))),message(context,expiry,code));
}
const obj=(v:unknown):Record<string,unknown>|null=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
export function verifiedPortalURL(data:Record<string,unknown>,customer:string,subscription:string):string|null{
 if(data.customer_id!==customer)return null;
 const urls=obj(data.urls),subscriptions=urls?.subscriptions;
 if(!Array.isArray(subscriptions))return null;
 const entry=subscriptions.map(obj).find(x=>x?.id===subscription);
 if(!entry)return null;
 for(const key of ['view_subscription','update_subscription_payment_method','cancel_subscription']){
  const value=entry[key];
  if(typeof value!=='string')continue;
  try{const url=new URL(value);if(url.origin==='https://customer-portal.paddle.com'&&!url.username&&!url.password&&/^\/cpl_[a-z0-9]{26}\/?$/.test(url.pathname)&&url.searchParams.get('action')===key&&url.searchParams.get('subscription_id')===subscription&&/^pga_[A-Za-z0-9._-]+$/.test(url.searchParams.get('token')||''))return url.href;}catch{}
 }
 return null;
}
