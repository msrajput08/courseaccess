import {useEffect,useState} from 'react';
type Status={authenticated:boolean;billingEnabled:boolean;subscription:{tier:string;status:string;periodEnd:number|null}|null;institutions?:{organizationId:string;name:string;status:string;periodEnd:number|null}[]};
export default function BillingPage(){
  const [state,setState]=useState<Status|null>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{
    const ctrl=new AbortController();
    fetch('/api/billing/status',{credentials:'same-origin',cache:'no-store',signal:ctrl.signal})
      .then(r=>{if(!r.ok)throw Error();return r.json() as Promise<Status>;})
      .then(setState).catch(()=>{if(!ctrl.signal.aborted)setError(true);});
    return ()=>ctrl.abort();
  },[]);
  return <main className="shell pricing"><div className="page-hero center">
    <div className="eyebrow"><i/> YOUR ACCOUNT</div>
    <h1>Billing &amp; <em>subscriptions.</em></h1>
    <p>Review the subscription associated with your CourseAccess account.</p>
  </div><section className="price-card featured" aria-label="Subscription details">
    {error?<p role="alert">Billing information is unavailable. Please reload the page.</p>:!state?<p role="status">Loading billing information…</p>:!state.authenticated?<><h2>Sign in to view billing</h2><p>Use your CourseAccess passkey to view your account.</p><a className="button button-primary" href="/account">Open account</a></>:<>
      <h2>{state.subscription?.tier==='pro'?'Professor Pro':state.subscription?.tier==='institution'?'Institution':'Free plan'}</h2>
      <p>{state.subscription?'Recorded subscription status: '+state.subscription.status:'No verified paid subscription is linked to this account.'}</p>
      {state.subscription?.periodEnd!=null&&<p>Recorded billing period ends {new Intl.DateTimeFormat(undefined,{dateStyle:'long'}).format(state.subscription.periodEnd)}.</p>}
      {(state.institutions||[]).map((org,i)=><div key={org.organizationId+':'+i}><h3>{org.name}</h3><p>{org.status}</p></div>)}
      <p>For invoices, payment updates or cancellation, open the billing link in your Paddle receipt. <a href="https://paddle.net/" target="_blank" rel="noopener noreferrer">Paddle buyer support</a> can help locate a receipt.</p>
    </>}
    <p><a href="/pricing">View pricing</a> · <a href="/checker">Free document checker</a></p>
  </section><p className="lead"><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/refunds">Refund and cancellation policy</a></p></main>;
}
