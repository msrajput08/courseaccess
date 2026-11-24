import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const origin=(process.env.COURSEACCESS_URL||'').replace(/\/$/,'');
if(origin!=='https://courseaccess.minty-12-shar.workers.dev')throw Error('Unexpected production origin');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();let loaded=0;
 // Intercept Google so CI never creates real visitor analytics or triggers container tags.
 await page.route('https://www.googletagmanager.com/**',route=>{loaded++;assert.match(route.request().url(),/gtm\.js\?id=GTM-TDLVR6PD$/);return route.fulfill({contentType:'application/javascript',body:'window.__gtmTestLoaded=true;'});});
 await page.goto(origin+'/');await page.getByRole('button',{name:'Analytics preferences',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Allow optional analytics',exact:true}).count(),0);assert.equal(loaded,0);await page.getByRole('button',{name:'Analytics preferences',exact:true}).click();
 await page.getByRole('button',{name:'Reject optional analytics',exact:true}).click();await page.goto(origin+'/pricing');await page.getByRole('button',{name:/Analytics preferences/}).waitFor();assert.equal(loaded,0);
 await page.getByRole('button',{name:/Analytics preferences/}).click();await page.getByRole('button',{name:'Allow optional analytics',exact:true}).click();await page.waitForFunction(()=>window.__gtmTestLoaded===true);
 assert.equal(loaded,1);assert.equal(await page.locator('#courseaccess-gtm').count(),1);
 const consent=await page.evaluate(()=>window.dataLayer.map(x=>Array.from(x)));
 assert.equal(consent[0][2].analytics_storage,'denied');assert.equal(consent[1][2].analytics_storage,'granted');assert.equal(consent[1][2].ad_storage,'denied');
 await page.getByRole('link',{name:'Choose Professor Pro'}).click();await page.waitForURL('**/account?plan=pro');
 await page.getByRole('heading',{name:'Create your account'}).waitFor();
 assert.equal(await page.locator('#courseaccess-gtm').count(),0);assert.equal(await page.evaluate(()=>!!window.dataLayer),false);assert.equal(loaded,1);
 for(const path of ['/checker','/workspace','/privacy','/pricing?token=private-fixture']){
  await page.goto(origin+path);assert.equal(await page.locator('#courseaccess-gtm').count(),0);
  const res=await page.request.get(origin+path);assert.ok(!(res.headers()['content-security-policy']||'').includes('googletagmanager.com'));
 }
 await page.goto(origin+'/pricing');await page.waitForFunction(()=>window.__gtmTestLoaded===true);
 await page.getByRole('button',{name:/Analytics preferences/}).click();await page.getByRole('button',{name:'Reject optional analytics',exact:true}).click();await page.getByRole('button',{name:'Analytics preferences (off)',exact:true}).waitFor();
 assert.equal(await page.locator('#courseaccess-gtm').count(),0);assert.equal(await page.evaluate(()=>!!window.dataLayer),false);
 console.log('GTM consent, refusal, withdrawal, exact container request and private route isolation verified against production. Google script mocked; no analytics data sent by CI.');
}finally{await browser.close();}
