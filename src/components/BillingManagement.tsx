import {useEffect,useState} from 'react';
import {CreditCard,ExternalLink} from 'lucide-react';
import PrivateBillingTest from './PrivateBillingTest';
type Plan={status:string;periodEnd:number|null;scheduledAction?:string|null;scheduledAt?:number|null;scopeReview?:number|null};
type Billing={authenticated:boolean;portalVerificationAvailable?:boolean;subscription:(Plan&{tier:string})|null;institutions:(Plan&{organizationId:string;name:string})[]};
const date=(v:number)=>new Intl.DateTimeFormat(undefined,{dateStyle:'medium'}).format(v);
export default function BillingManagement({organizations}:{organizations:{id:string;display_name:string}[]}){
 const [state,setState]=useState<Billing|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[destination,setDestination]=useState(''),[verification,setVerification]=useState<{organizationId?:string}|null>(null),[code,setCode]=useState('');
 useEffect(()=>{const c=new AbortController();fetch('/api/billing/status',{cache:'no-store',signal:c.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(setState).catch(()=>{if(!c.signal.aborted)setError('Billing information is unavailable.');});return()=>c.abort();},[]);
 async function manage(organizationId?:string,action?:'verify'|'open'){
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/billing/portal',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...organizationId?{organizationId}:{},...action?{action}:{},...action==='open'?{code:code.trim()}:{}})});
   const data=await r.json();if(!r.ok)throw Error(data.error||'Billing portal unavailable.');
   if(data.verificationRequired===true){setVerification({organizationId});setCode('');return;}
   const url=new URL(data.url);if(url.origin!=='https://customer-portal.paddle.com'||url.username||url.password||(url.searchParams.has('token')&&!(action==='open'&&data.authenticatedPortal===true)))throw Error('Invalid portal link.');
   window.location.assign(url.href);
  }catch(e){setError(e instanceof Error?e.message:'Billing portal unavailable.');}finally{setBusy(false);}
 }
 async function assign(sourceOrganizationId?:string){
  if(!sourceOrganizationId&&!destination){setError('Choose an institution you own.');return;}
  if(!window.confirm(sourceOrganizationId?'Apply this verified Professor Pro plan to your own account?':'Apply this verified Institution plan to the selected organization? This changes access, not billing.'))return;
  setBusy(true);setError('');
  try{const r=await fetch('/api/billing/scope',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(sourceOrganizationId?{sourceOrganizationId}:{targetOrganizationId:destination})});const data=await r.json();if(!r.ok)throw Error(data.error||'Plan assignment failed.');window.location.reload();}catch(e){setError(e instanceof Error?e.message:'Plan assignment failed.');}finally{setBusy(false);}
 }
 const details=(plan:Plan)=><><p>Status: {plan.status.replaceAll('_',' ')}{plan.periodEnd!=null?' · Current period ends '+date(plan.periodEnd):''}</p>{plan.scheduledAction&&plan.scheduledAt!=null&&<p>Scheduled {plan.scheduledAction} on {date(plan.scheduledAt)}.</p>}{plan.scopeReview===1&&<p>Plan ownership change requires review.</p>}</>;
 return <section className="account-panel" aria-label="Billing and subscription management"><CreditCard size={28}/><h2>Billing &amp; subscriptions</h2>
 {!state&&!error&&<p role="status">Checking billing…</p>}
 {state?.authenticated&&<><h3>{state.subscription?.tier==='pro'?'Professor Pro':'Free plan'}</h3>{state.subscription?<>{details(state.subscription)}<button className="button button-primary" disabled={busy} onClick={()=>void manage(undefined,state.portalVerificationAvailable?'verify':undefined)}>Manage subscription <ExternalLink size={16}/></button>{state.subscription.scopeReview===1&&<><label htmlFor="billing-scope-destination">Assign the verified institution plan</label><select id="billing-scope-destination" value={destination} onChange={e=>setDestination(e.target.value)}><option value="">Choose an institution you own</option>{organizations.map(o=><option key={o.id} value={o.id}>{o.display_name}</option>)}</select><button className="button button-primary" disabled={busy||!destination} onClick={()=>void assign()}>Confirm institution access</button></>}</>:<p>No verified paid subscription is linked to this account.</p>}
 {(state.institutions||[]).map((org,i)=><div key={org.organizationId+':'+i}><h3>{org.name}</h3>{details(org)}<button className="button button-primary" disabled={busy} onClick={()=>void manage(org.organizationId,state.portalVerificationAvailable?'verify':undefined)}>Manage institution billing <ExternalLink size={16}/></button>{org.scopeReview===1&&<button className="button button-primary" disabled={busy} onClick={()=>void assign(org.organizationId)}>Apply Professor Pro to my account</button>}</div>)}</>}
 {verification&&<div><p>Enter the one-time code sent to your Paddle billing email. It expires in five minutes.</p><label htmlFor="billing-proof">Verification code</label><input id="billing-proof" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)} maxLength={20}/><button className="button button-primary" disabled={busy||code.trim().length!==20} onClick={()=>void manage(verification.organizationId,'open')}>Open verified billing portal</button><button className="button button-quiet" disabled={busy} onClick={()=>void manage(verification.organizationId)}>Use Paddle email login instead</button></div>}
 {error&&<p role="alert">{error}</p>}
 <PrivateBillingTest/>
 <p>Manage invoices, payment methods and cancellation in Paddle. You will verify your billing email there. You can also use the link in your Paddle receipt.</p>
 <p><a href="https://paddle.net/" target="_blank" rel="noopener noreferrer">Paddle buyer support</a> · <a href="/refunds">Refund policy</a></p></section>;
}
