import {owner,type LiveCheckoutEnv} from './liveCheckout';
import {responseJSON,ApiError,rateLimit} from './accountSecurity';
export type AdminAnalyticsEnv=LiveCheckoutEnv&{COURSEACCESS_ADMIN_ACCOUNT_ID?:string;COURSEACCESS_ANALYTICS_READ_TOKEN?:string;COURSEACCESS_CF_ACCOUNT_ID?:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pages=new Set(['/','/pricing','/checker','/workspace','/account','/checkout','/guides','/guides/pdf-accessibility-checker','/guides/accessible-lecture-notes','/guides/fix-inaccessible-pdfs','/guides/math-accessibility','/guides/academic-documents','/privacy','/terms','/refunds']);
const sources=new Set(['email','search','social','internal','other-referral','direct-or-unknown']);
export function analyticsQueries(days:1|7|30){
 const where=" FROM courseaccess_traffic WHERE timestamp >= toStartOfInterval(NOW(), INTERVAL '1' DAY)"+(days===1?"":" - INTERVAL '"+(days-1)+"' DAY")+" AND timestamp <= NOW()";
 const count='SUM(_sample_interval * double1) AS requests';
 return [
 "SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, blob1 AS page, "+count+where+" GROUP BY day,page ORDER BY day ASC LIMIT 500 FORMAT JSON",
 "SELECT blob2 AS country, "+count+where+" GROUP BY country ORDER BY requests DESC LIMIT 300 FORMAT JSON",
 "SELECT blob3 AS source, "+count+where+" GROUP BY source ORDER BY requests DESC LIMIT 20 FORMAT JSON",
 ];
}
type Row=Record<string,unknown>;
type Item={label:string;count:number};
function count(v:unknown){const n=typeof v==='string'&&/^\d+(?:\.\d+)?$/.test(v)?Number(v):v;if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>Number.MAX_SAFE_INTEGER)throw Error('Invalid analytics count');return Math.round(n);}
function totals(rows:Row[],key:string,valid:(s:string)=>boolean):Item[]{
 const out=new Map<string,number>();
 for(const row of rows){const k=row[key];if(typeof k!=='string'||!valid(k))throw Error('Unexpected analytics dimension');out.set(k,(out.get(k)||0)+count(row.requests));}
 return [...out].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
}
export function summarizeAnalytics(rows:Row[][],days:1|7|30,now=new Date()){
 const end=now.toISOString().slice(0,10),dates=Array.from({length:days},(_,i)=>new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-days+1+i)).toISOString().slice(0,10));
 const daily=new Map(dates.map(d=>[d,0]));
 for(const row of rows[0]){const d=typeof row.day==='string'?row.day.slice(0,10):'';if(!daily.has(d)||typeof row.page!=='string'||!pages.has(row.page))throw Error('Unexpected analytics day or page');daily.set(d,(daily.get(d)||0)+count(row.requests));}
 const byPage=totals(rows[0],'page',s=>pages.has(s));
 const byCountry=totals(rows[1],'country',s=>/^[A-Z]{2}$/.test(s));
 const bySource=totals(rows[2],'source',s=>sources.has(s));
 const total=byPage.reduce((n,p)=>n+p.count,0);
 return {days,from:dates[0],to:end,generatedAt:now.toISOString(),total,today:daily.get(end)||0,pricing:byPage.find(p=>p.label==='/pricing')?.count||0,checkout:byPage.find(p=>p.label==='/checkout')?.count||0,daily:[...daily].map(([label,count])=>({label,count})),byPage,byCountry,bySource};
}
async function query(env:AdminAnalyticsEnv,sql:string):Promise<Row[]>{
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+env.COURSEACCESS_CF_ACCOUNT_ID+'/analytics_engine/sql',{method:'POST',headers:{Authorization:'Bearer '+env.COURSEACCESS_ANALYTICS_READ_TOKEN,'Content-Type':'text/plain',Accept:'application/json'},body:sql,redirect:'manual',signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('Analytics query unavailable');
 const json=await r.json() as {data?:Row[]};
 if(!Array.isArray(json.data)||json.data.length>500||json.data.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw Error('Invalid analytics response');
 return json.data;
}
export async function handleAdminAnalytics(req:Request,env:AdminAnalyticsEnv):Promise<Response>{
 try{
  if(req.method!=='GET')return responseJSON({error:'Method not allowed.'},405);
  if(req.headers.get('sec-fetch-site')==='cross-site')return responseJSON({error:'Forbidden.'},403);
  const account=await owner(req,env);
  if(!account)return responseJSON({error:'Sign in with your passkey.'},401);
  if(!uuid.test(env.COURSEACCESS_ADMIN_ACCOUNT_ID||'')||account!==env.COURSEACCESS_ADMIN_ACCOUNT_ID)return responseJSON({error:'Administrator access required.'},403);
  if(!env.COURSEACCESS_ANALYTICS_READ_TOKEN||!(/^[a-f0-9]{32}$/i.test(env.COURSEACCESS_CF_ACCOUNT_ID||'')))return responseJSON({error:'The administrator analytics connection is not configured.'},503);
  const params=new URL(req.url).searchParams;
  const range=params.get('days')||'7';
  if(!['1','7','30'].includes(range)||params.getAll('days').length>1||[...params.keys()].some(k=>k!=='days'))return responseJSON({error:'Choose 1, 7 or 30 days.'},400);
  await rateLimit(env.DB!,req,'admin-analytics',30);
  const days=Number(range) as 1|7|30;
  const now=new Date();
  const data=await Promise.all(analyticsQueries(days).map(sql=>query(env,sql)));
  return responseJSON(summarizeAnalytics(data,days,now));
 }catch(e){return e instanceof ApiError?responseJSON({error:e.message},e.status):responseJSON({error:'Analytics data unavailable. Check the Cloudflare read token and dataset.'},503);}
}
