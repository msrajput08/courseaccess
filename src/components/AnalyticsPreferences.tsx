import {useEffect,useState} from 'react';
import {ANALYTICS_ORIGIN,CONSENT_KEY,type AnalyticsConsent} from '../lib/analyticsPolicy';
import {getAnalyticsConsent,saveAnalyticsConsent,startAnalytics,stopAnalytics,analyticsLoaded} from '../lib/analytics';
export default function AnalyticsPreferences(){
 const production=location.origin===ANALYTICS_ORIGIN;
 const [choice,setChoice]=useState<AnalyticsConsent>(getAnalyticsConsent),[expanded,setExpanded]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  if(!production)return;
  function sync(){const current=getAnalyticsConsent();setChoice(current);if(current==='granted')startAnalytics();else if(analyticsLoaded())stopAnalytics();}
  const onStorage=(event:StorageEvent)=>{if(event.key===CONSENT_KEY||event.key===null)sync();};
  sync();addEventListener('storage',onStorage);addEventListener('pageshow',sync);
  return()=>{removeEventListener('storage',onStorage);removeEventListener('pageshow',sync);};
 },[production]);
 if(!production)return null;
 function choose(next:'granted'|'denied'){
  if(!saveAnalyticsConsent(next)){setError('Your browser could not save this preference.');if(next==='denied'&&analyticsLoaded()){try{localStorage.removeItem(CONSENT_KEY);}catch{}stopAnalytics();}return;}
  setChoice(next);setExpanded(false);setError('');
  if(next==='granted')startAnalytics();else stopAnalytics();
 }
 return <section className="analytics-preferences" aria-label="Analytics preferences"><div className="shell analytics-preferences-inner">
 {expanded?<><div><h2>Optional website analytics</h2><p>Google Tag Manager loads on public pages. Google consent mode defaults to denied for analytics cookies and advertising; Google may receive limited cookieless signals. Allow optional analytics to enable analytics cookies. Basic anonymous traffic counts are collected separately without analytics cookies. No analytics tags are loaded on document tools, account or checkout pages. You can change your choice anytime. <a href="/privacy">Privacy policy</a>.</p></div><div className="analytics-actions"><button type="button" className="button button-secondary" onClick={()=>choose('denied')}>Reject optional analytics</button><button type="button" className="button button-secondary" onClick={()=>choose('granted')}>Allow optional analytics</button>{expanded&&<button type="button" className="button button-quiet" onClick={()=>setExpanded(false)}>Close preferences</button>}</div></>:<button type="button" className="analytics-settings" onClick={()=>setExpanded(true)}>Analytics preferences {choice?'('+ (choice==='granted'?'allowed':'cookies off') +')':''}</button>}
 {error&&<p role="alert">{error}</p>}
 </div></section>;
}
