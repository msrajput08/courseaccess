import {useEffect,useState} from 'react';
import {localizedPrices,previewItems,type LocalizedPrices} from '../lib/paddleLive';
type Config={enabled:boolean;preview:boolean;clientToken:string|null};
type LiveClient={Initialize:(o:{token:string;eventCallback:(e:{name?:string})=>void})=>void;PricePreview:(o:{items:ReturnType<typeof previewItems>})=>Promise<unknown>;Checkout:{open:(o:{transactionId:string;settings:{displayMode:'overlay'}})=>void}};
let sdk:Promise<LiveClient>|undefined;
function initialize(token:string,notify:(e:{name?:string})=>void):Promise<LiveClient>{
  if(location.origin!=='https://courseaccess.minty-12-shar.workers.dev'||!token.startsWith('live_'))return Promise.reject(Error('Live origin required'));
  if(!sdk)sdk=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    const timer=window.setTimeout(()=>{script.remove();reject(Error('Paddle timeout'));},15000);
    script.src='https://cdn.paddle.com/paddle/v2/paddle.js';script.async=true;
    script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('Paddle unavailable'));};
    script.onload=()=>{clearTimeout(timer);try{const p=window.Paddle as unknown as LiveClient;if(!p)throw Error();p.Initialize({token,eventCallback:notify});resolve(p);}catch(e){reject(e);}};
    document.head.append(script);
  });
  return sdk;
}
export default function LiveCheckoutPage(){
  const [config,setConfig]=useState<Config|null>(null);
  const [status,setStatus]=useState('');
  const [prices,setPrices]=useState<LocalizedPrices>({});
  const [busy,setBusy]=useState(false);
  const [organizations,setOrganizations]=useState<{id:string;display_name:string;role:string}[]>([]);
  const [organizationId,setOrganizationId]=useState('');
  useEffect(()=>{
    let active=true;
    fetch('/api/billing/checkout-config',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json() as Promise<Config>;}).then(async cfg=>{
      if(!active)return;setConfig(cfg);
      if(!cfg.preview||!cfg.clientToken)return;
      // Paddle.js auto-opens _ptxn links. Do not initialize on these URLs
      // while collection is disabled.
      if(new URLSearchParams(location.search).has('_ptxn')&&!cfg.enabled)return;
      const client=await initialize(cfg.clientToken,e=>{if(e.name==='checkout.completed')setStatus('Payment submitted. Check billing for verified access.');});
      const result=await client.PricePreview({items:previewItems()});
      if(active)setPrices(localizedPrices(result));
    }).catch(()=>{if(active)setStatus('Localized pricing unavailable.');});
    return ()=>{active=false;};
  },[]);
  useEffect(()=>{fetch('/api/auth/me',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(x=>{if(Array.isArray(x?.organizations))setOrganizations(x.organizations.filter((o:{role:string})=>o.role==='owner'));}).catch(()=>undefined);},[]);
  async function open(tier:'pro'|'institution'){
    if(!config?.enabled||!config.clientToken||busy)return;
    setBusy(true);
    try{
      const r=await fetch('/api/billing/checkout-intent',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({tier,...(tier==='institution'?{organizationId}:{})})});
      if(r.status===401){setStatus('Please sign in to your CourseAccess account first.');return;}
      if(!r.ok){const problem=await r.json().catch(()=>null);setStatus(typeof problem?.error==='string'?problem.error:'Checkout unavailable.');return;}
      const data=await r.json() as {transactionId?:string};
      if(!data.transactionId||!/^txn_[a-z0-9]{26}$/.test(data.transactionId))throw Error();
      const client=await initialize(config.clientToken,()=>undefined);
      client.Checkout.open({transactionId:data.transactionId,settings:{displayMode:'overlay'}});
    }catch{setStatus('Checkout unavailable. Visit billing before retrying.');}finally{setBusy(false);}
  }
  return <main className="shell pricing"><div className="page-hero center"><div className="eyebrow"><i/> SECURE BILLING</div><h1>CourseAccess <em>checkout.</em></h1><p>{config?.enabled?'Choose your subscription.':'Paid subscriptions are not available for purchase yet.'}</p></div>
    <div className="price-grid">{(['pro','institution'] as const).map(tier=><article className="price-card" key={tier}><h2>{tier==='pro'?'Professor Pro':'Institution'}</h2><p className="price-amount"><strong>{prices[tier]||(tier==='pro'?'$12':'$79')}</strong><small>/month</small></p>{config?.enabled?<>{tier==='institution'&&<><label htmlFor="billing-org">Institution you own</label><select id="billing-org" value={organizationId} onChange={e=>setOrganizationId(e.target.value)}><option value="">Choose institution</option>{organizations.map(o=><option key={o.id} value={o.id}>{o.display_name}</option>)}</select></>}<button className="button button-primary" disabled={busy||(tier==='institution'&&!organizationId)} onClick={()=>void open(tier)}>Continue to checkout</button></>:<p>Not available yet</p>}</article>)}</div>
    <p role="status" aria-live="polite">{status}</p><p className="pricing-disclaimer">Final localized price and applicable taxes are shown by Paddle at checkout. <a href="/account">Account</a> · <a href="/billing">Billing</a> · <a href="/checker">Free checker</a></p><p><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/refunds">Refunds</a></p></main>;
}
