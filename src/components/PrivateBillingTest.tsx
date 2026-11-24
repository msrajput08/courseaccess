import {useEffect,useState} from 'react';
export default function PrivateBillingTest(){
 const normalized=(value:string)=>value.replace(/[\s\u200B-\u200D\uFEFF]/g,'').toUpperCase();
 const [code,setCode]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[test,setTest]=useState<{state:string;status:string|null}|null>(null);
 async function refresh(){const r=await fetch('/api/billing/private-test',{cache:'no-store'});if(r.ok)setTest((await r.json()).test);}
 useEffect(()=>{void refresh().catch(()=>{});},[]);
 async function run(action:'start'|'cancel'){
  if(action==='cancel'&&!window.confirm('Cancel your private test subscription immediately?'))return;
  setMessage('');
  if(action==='start'&&!/^CAQA[A-F0-9]{24}$/.test(normalized(code))){setMessage('Copy the actual checkout code from Paddle Discounts. It starts with CAQA and contains 28 characters, not the discount name or dsc_ ID.');return;}
  setBusy(true);
  try{const r=await fetch('/api/billing/private-test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,code:normalized(code)})});const x=await r.json();if(!r.ok)throw Error(x.error||'Test failed.');if(action==='cancel'){setMessage('Cancellation confirmed by Paddle. Refresh after webhook synchronization.');await refresh();return;}const url=new URL(x.url);if(url.origin!==location.origin||url.pathname!=='/checkout'||x.total!==0)throw Error('Unsafe checkout link.');window.location.assign(url.href);}catch(e){setMessage(e instanceof Error?e.message:'Test failed.');}finally{setBusy(false);}
 }
 return <details><summary>Private owner billing verification</summary><p>Only for the seller's authorized single-use test. The checkout must show zero due today and zero recurring amount. Do not confirm any nonzero payment. Cancel the test afterward.</p>{test&&<p>Test: {test.state} · {test.status||'Waiting for webhook'} <button type="button" onClick={()=>void refresh().catch(()=>{})}>Refresh</button></p>}{!test&&<><label htmlFor="private-test-code">Private test discount code</label><input id="private-test-code" type="password" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="CAQA…" aria-describedby="private-test-code-help" value={code} onChange={e=>setCode(e.target.value)} maxLength={128}/><p id="private-test-code-help">Paste the checkout code (CAQA + 24 characters), not the discount name or ID. {normalized(code).length}/28 characters.</p><button type="button" className="button button-secondary" disabled={busy||!code.trim()} onClick={()=>void run('start')}>Open zero-cost test checkout</button></>}{test?.status&&['active','trialing','past_due'].includes(test.status)&&<button type="button" disabled={busy} className="button button-secondary" onClick={()=>void run('cancel')}>Finish test and cancel subscription</button>}{message&&<p role="status">{message}</p>}</details>;
}
