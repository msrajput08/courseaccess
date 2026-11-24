import {useEffect,useState} from 'react';
import type {RecentRecord} from '../types';
type Entry={id:string;page_count:number;finding_count:number;created_at_ms:number};
export default function PaidReviewHistory({history}:{history:RecentRecord[]}){
 const [allowed,setAllowed]=useState(false),[signedIn,setSignedIn]=useState(false),[rows,setRows]=useState<Entry[]>([]);
 const [status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){const r=await fetch('/api/billing/review-history',{cache:'no-store'});if(!r.ok)throw Error();const x=await r.json();setRows(Array.isArray(x.history)?x.history:[]);}
 useEffect(()=>{let active=true;fetch('/api/entitlements',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(async x=>{if(!active||!x)return;setSignedIn(x.authenticated===true);setAllowed(x.features?.['history-cloud']===true);if(x.features?.['history-cloud']===true)await refresh();}).catch(()=>{if(active)setStatus('Cloud summary service unavailable.');});return()=>{active=false;};},[]);
 async function action(method:'POST'|'DELETE',record?:RecentRecord){
  if(busy)return;if(method==='DELETE'&&!window.confirm('Delete your stored cloud summaries?'))return;
  setBusy(true);setStatus('');
  try{
   const r=await fetch('/api/billing/review-history',{method,credentials:'same-origin',headers:{'content-type':'application/json'},body:record?JSON.stringify({pageCount:record.pageCount,findingCount:record.findingCount}):undefined});
   if(!r.ok)throw Error();
   if(method==='DELETE'){setRows([]);setStatus('Cloud summaries deleted.');}else{await refresh();setStatus('Numeric summary saved.');}
  }catch{setStatus('Unable to complete the request.');}finally{setBusy(false);}
 }
 if(!signedIn)return null;
 return <section className="history-panel"><div className="history-title"><h2>Cloud review summaries</h2></div><p>Optional numeric summaries only: page and finding counts. Names, text and document files stay on your device.</p>
 {allowed?<><p>Choose a local summary to save its counts:</p>{history.map(h=><div className="history-item" key={h.id}><span>{h.name}</span><button type="button" disabled={busy} onClick={()=>void action('POST',h)}>Save counts</button></div>)}<h3>Saved cloud summaries</h3>{rows.map(r=><p key={r.id}>{new Date(r.created_at_ms).toLocaleDateString()} · {r.page_count} pages · {r.finding_count} findings</p>)}</>:<p>An active paid subscription is required to save or view cloud summaries.</p>}
 <button type="button" disabled={busy} onClick={()=>void action('DELETE')}>Delete all cloud summaries</button><p role="status">{status}</p></section>;
}
