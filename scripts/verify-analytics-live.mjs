import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const origin=(process.env.COURSEACCESS_URL||'').replace(/\/$/,'');
if(origin!=='https://courseaccess.minty-12-shar.workers.dev')throw Error('Unexpected production origin');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();let loaded=0;
 await page.route('https://www.googletagmanager.com/**',route=>{loaded++;assert.match(route.request().url(),/gtm\.js\?id=GTM-TDLVR6PD$/);return route.fulfill({contentType:'application/javascript',body:'window.__gtmTestLoaded=true;'});});
 const raw=await page.request.get(origin+'/');const html=await raw.text();
 assert.match(html,/<head>\s*<script nonce=/);assert.match(html,/<script async src="https:\/\/www\.googletagmanager\.com\/gtm\.js\?id=GTM-TDLVR6PD"/);
 assert.equal((html.match(/gtm\.js\?id=GTM-TDLVR6PD/g)||[]).length,1);
 await page.goto(origin+'/');await page.waitForFunction(()=>window.__gtmTestLoaded===true);
 assert.equal(loaded,1);assert.equal(await page.locator('#courseaccess-gtm').count(),1);
 const getConsent=()=>page.evaluate(()=>window.dataLayer.filter(x=>x[0]==='consent').map(x=>Array.from(x)));
 let consent=await getConsent();assert.equal(consent[0][2].analytics_storage,'denied');assert.equal(consent[0][2].ad_storage,'denied');
 await page.getByRole('button',{name:'Analytics preferences',exact:true}).click();
 await page.getByRole('button',{name:'Allow optional analytics',exact:true}).click();
 consent=await getConsent();assert.equal(consent.at(-1)[2].analytics_storage,'granted');assert.equal(loaded,1);
 await page.goto(origin+'/pricing');await page.waitForFunction(()=>window.__gtmTestLoaded===true);
 assert.equal(loaded,2);
 await page.getByRole('link',{name:'Choose Professor Pro'}).click();await page.waitForURL('**/account?plan=pro');
 await page.getByRole('heading',{name:'Create your account'}).waitFor();
 assert.equal(await page.locator('#courseaccess-gtm').count(),0);assert.equal(await page.evaluate(()=>!!window.dataLayer),false);assert.equal(loaded,2);
 for(const path of ['/checker','/workspace','/privacy','/pricing?token=private-fixture']){
  await page.goto(origin+path);assert.equal(await page.locator('#courseaccess-gtm').count(),0);
  const res=await page.request.get(origin+path);assert.ok(!(res.headers()['content-security-policy']||'').includes('googletagmanager.com'));
 }
 await page.goto(origin+'/pricing');await page.waitForFunction(()=>window.__gtmTestLoaded===true);
 await page.getByRole('button',{name:/Analytics preferences/}).click();await page.getByRole('button',{name:'Reject optional analytics',exact:true}).click();await page.getByRole('button',{name:'Analytics preferences (cookies off)',exact:true}).waitFor();
 consent=await getConsent();assert.equal(consent.at(-1)[2].analytics_storage,'denied');assert.equal(await page.locator('#courseaccess-gtm').count(),1);
 console.log('Direct GTM HTML snippet, one request, CSP, consent defaults/updates and private route isolation verified. Google response mocked; GA4 receipt not tested.');
}finally{await browser.close();}
