import {canLoadAnalytics,CONSENT_KEY,GTM_CONTAINER,readConsent,type AnalyticsConsent} from './analyticsPolicy';
type AnalyticsWindow=Window&{dataLayer?:unknown[]};
const w=()=>window as AnalyticsWindow;
export function getAnalyticsConsent():AnalyticsConsent{
 try{return readConsent(localStorage.getItem(CONSENT_KEY));}catch{return null;}
}
export function saveAnalyticsConsent(choice:Exclude<AnalyticsConsent,null>){
 try{localStorage.setItem(CONSENT_KEY,JSON.stringify({choice,at:Date.now()}));return true;}catch{return false;}
}
function consentCommand(action:'default'|'update',analytics:'granted'|'denied'){
 const data=w().dataLayer??(w().dataLayer=[]);
 function gtag(..._args:unknown[]){data.push(arguments);}
 gtag('consent',action,{analytics_storage:analytics,ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
}
export function analyticsLoaded(){return !!document.getElementById('courseaccess-gtm');}
export function startAnalytics(){
 if(!canLoadAnalytics(new URL(location.href))||getAnalyticsConsent()!=='granted'||analyticsLoaded())return;
 consentCommand('default','denied');consentCommand('update','granted');
 w().dataLayer!.push({'gtm.start':Date.now(),event:'gtm.js'});
 const tag=document.createElement('script');tag.id='courseaccess-gtm';tag.async=true;tag.src='https://www.googletagmanager.com/gtm.js?id='+GTM_CONTAINER;tag.referrerPolicy='no-referrer';
 document.head.append(tag);
}
export function stopAnalytics(){
 if(!analyticsLoaded())return;
 consentCommand('update','denied');
 location.reload();
}
export function trackMarketingAction(action:'free_checker_selected'|'plan_selected',tier?:'pro'|'institution'){
 if(!canLoadAnalytics(new URL(location.href))||getAnalyticsConsent()!=='granted'||!analyticsLoaded())return;
 w().dataLayer?.push({event:'courseaccess_'+action,...(action==='plan_selected'&&tier?{plan:tier}:{})});
}
