import {useState} from 'react';
import {sandboxConfig,loadSandbox,sandboxItems,sandboxLocalizedPrices,type SandboxTier} from '../lib/paddleSandbox';
export default function CheckoutPage(){
  const config=sandboxConfig(import.meta.env.DEV,location.hostname,import.meta.env.VITE_PADDLE_SANDBOX_CLIENT_TOKEN,import.meta.env.VITE_PADDLE_SANDBOX_PRO_PRICE_ID,import.meta.env.VITE_PADDLE_SANDBOX_INSTITUTION_PRICE_ID);
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const [prices,setPrices]=useState<Partial<Record<SandboxTier,string>>>({});
  async function run(tier?:SandboxTier){
    if(!config||busy)return;
    setBusy(true);setStatus('Connecting to Paddle test mode…');
    try{
      const client=await loadSandbox(config,event=>{
        if(event.name==='checkout.completed')setStatus('Test checkout completed. No account access was changed.');
        else if(event.name==='checkout.closed')setStatus('Test checkout closed.');
        else if(event.name==='checkout.error')setStatus('Test checkout reported an error.');
      });
      if(tier){
        client.Checkout.open({items:[{priceId:config.prices[tier],quantity:1}],settings:{displayMode:'overlay'}});
        setStatus('Test checkout requested. No real payment will be collected.');
      }else{
        const result=await client.PricePreview({items:sandboxItems(config)});
        setPrices(sandboxLocalizedPrices(result,config));
        setStatus('Test price preview loaded. Final taxes and totals appear in checkout.');
      }
    }catch{setStatus('Test checkout unavailable. Verify sandbox settings and reload this page.');}
    finally{setBusy(false);}
  }
  return <main className="shell pricing"><div className="page-hero center">
    <div className="eyebrow"><i/> SECURE BILLING</div><h1>CourseAccess <em>checkout.</em></h1>
    <p>{config?'Private sandbox test mode. No real charges or paid access.':'Subscriptions are not available for purchase yet. No payment will be taken.'}</p>
  </div>
  {config?<><div className="pricing-disclaimer"><button className="button button-primary" disabled={busy} onClick={()=>void run()}>Preview localized test prices</button></div>
    <div className="price-grid">{(['pro','institution'] as const).map(tier=><article key={tier} className="price-card"><h2>{tier==='pro'?'Professor Pro':'Institution'}</h2><p>{prices[tier]||'See test price at checkout'} / month</p><button className="button button-primary" disabled={busy} onClick={()=>void run(tier)}>Open test checkout</button></article>)}</div>
    <p role="status" aria-live="polite">{status}</p></>:<div className="pricing-disclaimer"><a href="/pricing">View plans</a> · <a href="/billing">Billing and subscription</a> · <a href="/checker">Continue with the free checker</a></div>}
  <p className="lead"><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/refunds">Refunds and cancellation</a></p>
  </main>;
}
