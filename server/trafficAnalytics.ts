// Counts navigation requests, not people. No user/session identifiers or raw URLs.
export interface TrafficDataset {writeDataPoint(point:{indexes:string[];blobs:string[];doubles:number[]}):void}
const pages=new Set(['/','/pricing','/checker','/workspace','/account','/checkout','/guides','/guides/pdf-accessibility-checker','/guides/accessible-lecture-notes','/guides/fix-inaccessible-pdfs','/guides/math-accessibility','/guides/academic-documents','/privacy','/terms','/refunds']);
function source(req:Request,url:URL){
 const s=url.searchParams.get('utm_source')?.toLowerCase();
 if(s&&['email','newsletter','outreach'].includes(s))return 'email';
 if(s&&['google','bing','duckduckgo'].includes(s))return 'search';
 if(s&&['linkedin','facebook','instagram','reddit','x','twitter','youtube'].includes(s))return 'social';
 const ref=req.headers.get('referer');
 if(!ref)return 'direct-or-unknown';
 try{const r=new URL(ref);if(r.origin===url.origin)return 'internal';
 if(/^(www\.)?(google\.[a-z.]+|bing\.com|duckduckgo\.com)$/.test(r.hostname))return 'search';
 if(/(^|\.)(linkedin\.com|facebook\.com|instagram\.com|reddit\.com|x\.com|twitter\.com|youtube\.com)$/.test(r.hostname))return 'social';
 return 'other-referral';}catch{return 'direct-or-unknown';}
}
export function recordNavigation(req:Request,dataset?:TrafficDataset,status=200){
 if(!dataset||req.method!=='GET'||status!==200)return;
 const url=new URL(req.url);
 if(url.origin!=='https://courseaccess.minty-12-shar.workers.dev'||!pages.has(url.pathname))return;
 if(req.headers.get('sec-fetch-dest')!=='document'&&!req.headers.get('accept')?.includes('text/html'))return;
 if(/prefetch|prerender/i.test((req.headers.get('purpose')||'')+' '+(req.headers.get('sec-purpose')||'')))return;
 const country=(req as Request&{cf?:{country?:string}}).cf?.country;
 const region=typeof country==='string'&&/^[A-Z]{2}$/.test(country)?country:'ZZ';
 // No raw referrer, query strings, IP, account IDs, document metadata, cookies or user agents.
 try{dataset.writeDataPoint({indexes:[url.pathname],blobs:[url.pathname,region,source(req,url)],doubles:[1]});}catch{/* Analytics must never interrupt the product. */}
}
