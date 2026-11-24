// Never use a live client token, live price, or production host for this test flow.
import {LIVE_PRICES} from './paddleLive';
export type SandboxTier='pro'|'institution';
export type SandboxConfig={token:string;prices:Record<SandboxTier,string>};
type Item={priceId:string;quantity:number};
type SandboxClient={
  Environment:{set:(environment:'sandbox')=>void};
  Initialize:(options:{token:string;eventCallback:(event:{name?:string})=>void})=>void;
  PricePreview:(options:{items:Item[]})=>Promise<unknown>;
  Checkout:{open:(options:{items:Item[];settings:{displayMode:'overlay'}})=>void};
};
export function sandboxConfig(dev:boolean,host:string,token:unknown,pro:unknown,institution:unknown):SandboxConfig|null{
  if(!dev||!['localhost','127.0.0.1','[::1]'].includes(host)||typeof token!=='string'||!/^test_[a-zA-Z0-9_]+$/.test(token))return null;
  const price=(x:unknown):x is string=>typeof x==='string'&&/^pri_[a-z0-9]{26}$/.test(x)&&!Object.values(LIVE_PRICES).some(id=>id===x);
  if(!price(pro)||!price(institution)||pro===institution)return null;
  return {token,prices:{pro,institution}};
}
let clientPromise:Promise<SandboxClient>|undefined;
let clientToken:string|undefined;
export function loadSandbox(config:SandboxConfig,onEvent:(event:{name?:string})=>void):Promise<SandboxClient>{
  // Recheck all restrictions at the point of SDK initialization.
  if(!sandboxConfig(import.meta.env.DEV,location.hostname,config.token,config.prices.pro,config.prices.institution))
    return Promise.reject(new Error('Sandbox checkout is disabled.'));
  if(clientPromise)return clientToken===config.token?clientPromise:Promise.reject(new Error('Reload before changing sandbox configuration.'));
  if(window.Paddle||new URLSearchParams(location.search).has('_ptxn'))return Promise.reject(new Error('Open the clean checkout URL in a fresh tab.'));
  clientToken=config.token;
  clientPromise=new Promise<SandboxClient>((resolve,reject)=>{
    const script=document.createElement('script');
    const timer=window.setTimeout(()=>{script.remove();reject(new Error('Paddle.js timed out. Reload before retrying.'));},15000);
    script.src='https://cdn.paddle.com/paddle/v2/paddle.js';
    script.async=true;
    script.onload=()=>{
      clearTimeout(timer);
      try{
        const client=window.Paddle as unknown as SandboxClient|undefined;
        if(!client)throw new Error('Paddle.js unavailable.');
        client.Environment.set('sandbox');
        client.Initialize({token:config.token,eventCallback:onEvent});
        resolve(client);
      }catch(error){reject(error);}
    };
    script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('Paddle.js unavailable. Reload to retry.'));};
    document.head.appendChild(script);
  });
  return clientPromise;
}
export function sandboxItems(config:SandboxConfig):Item[]{
  return Object.values(config.prices).map(priceId=>({priceId,quantity:1}));
}
export function sandboxLocalizedPrices(response:unknown,config:SandboxConfig):Partial<Record<SandboxTier,string>>{
  const obj=(v:unknown):Record<string,unknown>|undefined=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:undefined;
  const items=obj(obj(obj(response)?.data)?.details)?.lineItems;
  const prices:Partial<Record<SandboxTier,string>>={};
  if(Array.isArray(items))for(const item of items){
    const id=obj(obj(item)?.price)?.id;
    const subtotal=obj(obj(item)?.formattedTotals)?.subtotal;
    if(typeof subtotal!=='string'||!subtotal.trim())continue;
    for(const tier of ['pro','institution'] as const)if(config.prices[tier]===id)prices[tier]=subtotal;
  }
  return prices;
}
