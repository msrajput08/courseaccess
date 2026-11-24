// Public IDs from the owner's live catalog, not credentials.
export const LIVE_PRICES = {
  pro:'pri_01m87cf8a3d6nedgenr8jmhzwc',
  institution:'pri_01m87chg5xqcnggt17wvsknvw9',
} as const;
export type PaidTier=keyof typeof LIVE_PRICES;
export type LocalizedPrices=Partial<Record<PaidTier,string>>;
type Item={priceId:string;quantity:number};
export interface PaddleClient {
  Initialize(options:{token:string;pwCustomer?:{id:string}}):void;
  PricePreview(options:{items:Item[]}):Promise<unknown>;
  Checkout:{open(options:{items:Item[];customer?:{email:string};settings:{displayMode:'overlay'}}):void};
}
declare global {interface Window {Paddle?:PaddleClient}}

// Pre-verification preview only: production builds never initialize Paddle.
export function localPreviewAllowed(dev:boolean,hostname:string,token:unknown):token is string{
  return dev&&['localhost','127.0.0.1','[::1]'].includes(hostname)
    &&typeof token==='string'&&/^live_[a-zA-Z0-9_]+$/.test(token);
}
export function previewItems():Item[]{
  return Object.values(LIVE_PRICES).map(priceId=>({priceId,quantity:1}));
}
function record(x:unknown):Record<string,unknown>|null{
  return x!==null&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:null;
}
export function localizedPrices(response:unknown):LocalizedPrices{
  const items=record(record(record(response)?.data)?.details)?.lineItems;
  const result:LocalizedPrices={};
  if(!Array.isArray(items))return result;
  for(const item of items){
    const id=record(record(item)?.price)?.id;
    const subtotal=record(record(item)?.formattedTotals)?.subtotal;
    if(typeof subtotal!=='string'||!subtotal.trim())continue;
    for(const tier of Object.keys(LIVE_PRICES) as PaidTier[]){
      if(id===LIVE_PRICES[tier])result[tier]=subtotal;
    }
  }
  return result;
}
let initialized:Promise<PaddleClient>|undefined;
export function initializeLivePreview(token:string):Promise<PaddleClient>{
  if(!localPreviewAllowed(import.meta.env.DEV,location.hostname,token))
    return Promise.reject(new Error('Paddle preview restricted to local development.'));
  if(!initialized){
    initialized=new Promise<PaddleClient>((resolve,reject)=>{
      let script:HTMLScriptElement|undefined;
      const timeout=window.setTimeout(()=>{
        script?.remove();reject(new Error('Paddle.js timed out.'));
      },15000);
      const finish=()=>{
        window.clearTimeout(timeout);
        try{
          if(!window.Paddle)throw new Error('Paddle.js unavailable.');
          // Live is the default. No sandbox environment override.
          // No pwCustomer: the passkey-only account has no verified Paddle customer mapping.
          window.Paddle.Initialize({token});
          resolve(window.Paddle);
        }catch(error){reject(error);}
      };
      if(window.Paddle){finish();return;}
      script=document.createElement('script');
      script.src='https://cdn.paddle.com/paddle/v2/paddle.js';
      script.async=true;
      script.onload=finish;
      script.onerror=()=>{
        window.clearTimeout(timeout);script?.remove();reject(new Error('Paddle.js unavailable.'));
      };
      document.head.appendChild(script);
    }).catch(error=>{initialized=undefined;throw error;});
  }
  return initialized;
}

// Adapter only, deliberately unconnected to the UI. Do not call in production
// until account verification, domain approval, webhook and entitlement gates pass.
export function openApprovedCheckout(client:PaddleClient,tier:PaidTier,verifiedEmail?:string):void{
  const priceId=LIVE_PRICES[tier];
  if(!priceId)throw new Error('Unknown paid tier.');
  client.Checkout.open({
    items:[{priceId,quantity:1}],
    ...(verifiedEmail?{customer:{email:verifiedEmail}}:{}),
    settings:{displayMode:'overlay'},
  });
}
