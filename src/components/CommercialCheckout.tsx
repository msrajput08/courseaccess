import {useEffect,useState} from 'react';
import {ArrowRight,ShieldCheck} from 'lucide-react';
type Tier='pro'|'institution';
export default function CommercialCheckout({organizations}:{organizations:{id:string;display_name:string}[]}){
 const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[org,setOrg]=useState(''),[tier,setTier]=useState<Tier>(()=>new URLSearchParams(location.search).get('plan')==='institution'?'institution':'pro');
 useEffect(()=>{const c=new AbortController();fetch('/api/billing/checkout-config',{cache:'no-store',signal:c.signal}).then(r=>r.ok?r.json():null).then(x=>{if(!c.signal.aborted)setEnabled(x?.enabled===true);}).catch(()=>{});return()=>c.abort();},[]);
 async function start(){
  if(busy||!enabled)return;
  if(tier==='institution'&&!org){setError('Select an institution you own or create one below.');return;}
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/billing/checkout-intent',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({tier,...(tier==='institution'?{organizationId:org}:{})})});
   const x=await r.json();
   if(!r.ok)throw Error(x.error||'Checkout unavailable.');
   if(typeof x.transactionId!=='string'||!/^txn_[a-z0-9]{26}$/.test(x.transactionId))throw Error('Invalid secure checkout reference.');
   location.assign('/checkout?_ptxn='+encodeURIComponent(x.transactionId));
  }catch(e){setError(e instanceof Error?e.message:'Checkout unavailable.');}finally{setBusy(false);}
 }
 if(!enabled)return <p className="account-note">New checkout is currently unavailable.</p>;
 return <section className="commercial-checkout"><h3>Upgrade your workflow</h3><p>Secure recurring checkout. Final currency, taxes and renewal amount appear in Paddle before confirmation.</p><fieldset><legend>Choose a plan</legend><label><input type="radio" name="commercial-tier" checked={tier==='pro'} onChange={()=>setTier('pro')}/> Professor Pro · $12/month USD</label><label><input type="radio" name="commercial-tier" checked={tier==='institution'} onChange={()=>setTier('institution')}/> Institution · $79/month USD</label></fieldset>{tier==='institution'&&<><label htmlFor="checkout-org">Institution owner account</label><select id="checkout-org" value={org} onChange={e=>setOrg(e.target.value)}><option value="">Choose your organization</option>{organizations.map(o=><option key={o.id} value={o.id}>{o.display_name}</option>)}</select>{organizations.length===0&&<p>Create an institution in your account before purchasing.</p>}</>}<p><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/refunds">Cancellation and refunds</a></p><button type="button" className="button button-primary" disabled={busy||(tier==='institution'&&!org)} onClick={()=>void start()}>{busy?'Opening checkout…':'Continue to secure checkout'} <ArrowRight size={16}/></button><p className="account-note"><ShieldCheck size={16}/> Paddle handles payment details. Your subscription activates after the signed payment event is verified.</p>{error&&<p role="alert">{error}</p>}</section>;
}
