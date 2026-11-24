// Read-only live checks. Public CI logs must not expose account IDs, tokens or traffic totals.
const {COURSEACCESS_ADMIN_ACCOUNT_ID:admin,COURSEACCESS_ANALYTICS_READ_TOKEN:token,COURSEACCESS_CF_ACCOUNT_ID:account}=process.env;
if(!admin&&!token){console.log('Administrator analytics not configured; dataset read check skipped.');process.exit(0);}
if(!admin||!token||!(/^[a-f0-9]{32}$/i.test(account||'')))throw Error('Administrator analytics credentials incomplete.');
let received=false;
for(const days of [1,7,30]){
 const where=" FROM courseaccess_traffic WHERE timestamp >= toStartOfInterval(NOW(), INTERVAL '1' DAY)"+(days===1?"":" - INTERVAL '"+(days-1)+"' DAY")+" AND timestamp <= NOW()";
 const count='SUM(_sample_interval * double1) AS requests';
 const queries=[
 "SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, blob1 AS page, "+count+where+" GROUP BY day,page ORDER BY day ASC LIMIT 500 FORMAT JSON",
 "SELECT blob2 AS country, "+count+where+" GROUP BY country ORDER BY requests DESC LIMIT 300 FORMAT JSON",
 "SELECT blob3 AS source, "+count+where+" GROUP BY source ORDER BY requests DESC LIMIT 20 FORMAT JSON"
 ];
 for(const sql of queries){
  const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/analytics_engine/sql',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'text/plain',Accept:'application/json'},body:sql,redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('Cloudflare Analytics Engine read failed: HTTP '+r.status+' (check token permission or SQL compatibility).');
  const data=await r.json();
  if(!Array.isArray(data.data)||data.data.some(row=>!Number.isFinite(Number(row.requests))||Number(row.requests)<0))throw Error('Unexpected aggregate response.');
  if(data.data.some(row=>Number(row.requests)>0))received=true;
 }
 console.log('PASS: real Cloudflare dataset queries for '+days+' UTC calendar day(s).');
}
console.log(received?'PASS: existing dataset contains recorded traffic.':'Dataset query successful; no recorded traffic returned yet.');
