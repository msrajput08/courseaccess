export const ANALYTICS_ORIGIN='https://courseaccess.minty-12-shar.workers.dev';
export const GTM_CONTAINER='GTM-TDLVR6PD';
const publicPaths=new Set(['/','/pricing','/guides','/guides/pdf-accessibility-checker','/guides/accessible-lecture-notes','/guides/fix-inaccessible-pdfs','/guides/math-accessibility','/guides/academic-documents']);
export function isMarketingPath(path:string){return publicPaths.has(path);}
const campaignKeys=new Set(['utm_source','utm_medium','utm_campaign','utm_content','utm_term','utm_id','gtm_debug']);
export function canLoadAnalytics(url:URL){
 if(url.origin!==ANALYTICS_ORIGIN||!isMarketingPath(url.pathname)||!['','#how','#content'].includes(url.hash))return false;
 const seen=new Set<string>();
 for(const [key,value] of url.searchParams){
  if(seen.has(key)||!campaignKeys.has(key)||!/^[a-zA-Z0-9_.-]{1,80}$/.test(value))return false;
  seen.add(key);
 }
 return true;
}
export const CONSENT_KEY='courseaccess.analytics-consent.v1';
export type AnalyticsConsent='granted'|'denied'|null;
export function readConsent(raw:string|null,now=Date.now()):AnalyticsConsent{
 try{const d=JSON.parse(raw||'null');return d&&['granted','denied'].includes(d.choice)&&Number.isSafeInteger(d.at)&&d.at<=now&&now-d.at<180*86400000?d.choice:null;}catch{return null;}
}
