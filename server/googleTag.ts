import {GA4_MEASUREMENT_ID,CONSENT_KEY} from '../src/lib/analyticsPolicy';
// Direct, server-rendered Google installation. Default consent runs before the async tag.
export function googleTagHead(nonce:string){
 return `<script nonce="${nonce}">
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
try {
  var preference = JSON.parse(localStorage.getItem('${CONSENT_KEY}') || 'null');
  if(preference && preference.choice === 'granted' && Number.isSafeInteger(preference.at) && preference.at <= Date.now() && Date.now()-preference.at < 180*86400000) {
    gtag('consent','update',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
  }
} catch (_) {}
</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}" id="courseaccess-ga4"></script>
<script nonce="${nonce}">
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${GA4_MEASUREMENT_ID}', {allow_google_signals:false,allow_ad_personalization_signals:false,page_location:location.origin+location.pathname+location.search,page_referrer:document.referrer ? new URL(document.referrer).origin : ''});
</script>`;
}
