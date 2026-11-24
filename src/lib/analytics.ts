import {canLoadAnalytics,CONSENT_KEY,readConsent,type AnalyticsConsent} from './analyticsPolicy';
type AnalyticsWindow=Window&{dataLayer?:unknown[]};
const w=()=>window as AnalyticsWindow;
export function getAnalyticsConsent():AnalyticsConsent{
 try{return readConsent(localStorage.getItem(CONSENT_KEY));}catch{return null;}
}
export function saveAnalyticsConsent(choice:Exclude<AnalyticsConsent,null>){
 try{localStorage.setItem(CONSENT_KEY,JSON.stringify({choice,at:Date.now()}));return true;}catch{return false;}
}
export function analyticsLoaded(){return !!document.getElementById('courseaccess-gtm');}
let lastChoice:AnalyticsConsent=null;
function updateConsent(analytics:'granted'|'denied'){
 if(!analyticsLoaded()||!canLoadAnalytics(new URL(location.href))||lastChoice===analytics)return;
 const data=w().dataLayer??(w().dataLayer=[]);
 function gtag(..._args:unknown[]){data.push(arguments);}
 gtag('consent','update',{analytics_storage:analytics,ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
 lastChoice=analytics;
}
export function startAnalytics(){if(getAnalyticsConsent()==='granted')updateConsent('granted');}
export function stopAnalytics(){updateConsent('denied');}
export function trackMarketingAction(action:'free_checker_selected'|'plan_selected',tier?:'pro'|'institution'){
 if(!canLoadAnalytics(new URL(location.href))||getAnalyticsConsent()!=='granted'||!analyticsLoaded())return;
 w().dataLayer?.push({event:'courseaccess_'+action,...(action==='plan_selected'&&tier?{plan:tier}:{})});
}
