import {useEffect,useState} from 'react';
import {BarChart3,Globe2,LockKeyhole,RefreshCw,ShoppingBag,Eye,CalendarDays} from 'lucide-react';
type Item={label:string;count:number};
type Report={days:number;from:string;to:string;generatedAt:string;total:number;today:number;pricing:number;checkout:number;daily:Item[];byPage:Item[];byCountry:Item[];bySource:Item[]};
const nf=new Intl.NumberFormat();
const sourceNames:Record<string,string>={'direct-or-unknown':'Direct / unknown','email':'Email','search':'Search','social':'Social','internal':'Internal','other-referral':'Other referral'};
function countryName(code:string){if(code==='ZZ')return 'Unknown';try{return new Intl.DisplayNames(['en'],{type:'region'}).of(code)||code;}catch{return code;}}
function Breakdown({title,rows,format=(s:string)=>s}:{title:string;rows:Item[];format?:(s:string)=>string}){
 const max=Math.max(1,...rows.map(r=>r.count));
 return <section className="admin-panel"><h2>{title}</h2>{rows.length===0?<p className="admin-muted">No recorded requests for this period.</p>:<div className="admin-table-wrap"><table><thead><tr><th scope="col">Category</th><th scope="col">Page requests</th></tr></thead><tbody>{rows.map(r=><tr key={r.label}><td><span>{format(r.label)}</span><div className="admin-track" aria-hidden="true"><i style={{width:(100*r.count/max)+'%'}}/></div></td><td>{nf.format(r.count)}</td></tr>)}</tbody></table></div>}</section>;
}
export default function AdminAnalytics(){
 const [days,setDays]=useState<1|7|30>(7),[revision,setRevision]=useState(0),[report,setReport]=useState<Report|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[status,setStatus]=useState(0);
 useEffect(()=>{const ctrl=new AbortController();setLoading(true);setReport(null);setError('');setStatus(0);
 (async()=>{try{
 const r=await fetch('/api/admin/analytics?days='+days,{credentials:'same-origin',cache:'no-store',signal:ctrl.signal});
 const data=await r.json();if(ctrl.signal.aborted)return;
 if(!r.ok){setStatus(r.status);setError(data.error||'Unable to load analytics.');return;}setReport(data as Report);
 }catch{if(!ctrl.signal.aborted)setError('Could not reach analytics. Try refreshing.');}finally{if(!ctrl.signal.aborted)setLoading(false);}})();
 return()=>ctrl.abort();},[days,revision]);
 const cards=report?[{label:'Page requests',value:report.total,Icon:Eye},{label:'Today · UTC',value:report.today,Icon:CalendarDays},{label:'Pricing visits',value:report.pricing,Icon:BarChart3},{label:'Checkout visits',value:report.checkout,Icon:ShoppingBag}]:[];
 const max=Math.max(1,...(report?.daily||[]).map(r=>r.count));
 return <main className="shell admin-analytics"><div className="admin-heading"><div><span className="admin-kicker"><LockKeyhole size={14}/> OWNER ONLY · TRAFFIC INTELLIGENCE</span><h1>Analytics overview</h1><p>Anonymous page-request counts from Cloudflare, independent of Google analytics cookie preferences.</p></div><div className="admin-controls"><label htmlFor="analytics-range">Date range (UTC)</label><select id="analytics-range" value={days} onChange={e=>setDays(Number(e.target.value) as 1|7|30)}><option value={1}>Today</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option></select><button className="button button-secondary" disabled={loading} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={15}/> Refresh</button></div></div>
 {loading&&<p role="status" className="admin-panel">Loading traffic data…</p>}
 {error&&<section className="admin-panel"><h2>{status===401?'Sign in required':status===403?'Private dashboard':'Analytics unavailable'}</h2><p role="alert">{error}</p>{status===401&&<a className="button button-primary" href="/account">Sign in with passkey</a>}</section>}
 {report&&<><div className="admin-range"><span>{report.from} – {report.to} (UTC)</span><span>Updated {new Date(report.generatedAt).toLocaleString()}</span></div><div className="admin-kpis">{cards.map(({label,value,Icon})=><section key={label} className="admin-panel admin-kpi"><Icon size={20}/><span>{label}</span><strong>{nf.format(value)}</strong></section>)}</div>
 <section className="admin-panel"><h2>Daily traffic</h2><p className="admin-muted">Successful page requests · UTC calendar days</p><div className="admin-chart-scroll"><div className="admin-chart" style={{gridTemplateColumns:'repeat('+report.daily.length+', minmax(32px,1fr))'}}>{report.daily.map(r=><div className="admin-chart-column" key={r.label}><span>{nf.format(r.count)}</span><div className="admin-chart-slot"><i aria-hidden="true" style={{height:(100*r.count/max)+'%'}}/></div><time dateTime={r.label}>{r.label.slice(5)}</time></div>)}</div></div></section>
 <div className="admin-breakdowns"><Breakdown title="Most visited pages" rows={report.byPage}/><Breakdown title="Countries" rows={report.byCountry} format={countryName}/><Breakdown title="Traffic sources" rows={report.bySource} format={s=>sourceNames[s]||s}/></div><p className="admin-note"><Globe2 size={16}/> Counts may include repeat visits, bots and sampled estimates. Checkout visits are not purchases; this is not a unique-visitor or revenue report. Historical coverage starts when the dataset began collecting traffic.</p></>}
 </main>;
}
