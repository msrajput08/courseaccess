import {chromium} from 'playwright';
const base=(process.env.COURSEACCESS_URL||'').replace(/\/$/,'');
if(base!=='https://courseaccess.minty-12-shar.workers.dev')throw Error('Unexpected production domain');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 const response=await page.goto(base+'/checkout',{waitUntil:'domcontentloaded',timeout:45000});
 if(response?.status()!==200)throw Error('Checkout landing page unavailable');
 await page.locator('#payment-status[data-sdk="initialized"]').waitFor({timeout:25000});
 if(!await page.evaluate(()=>typeof window.Paddle?.Initialize==='function'))throw Error('Paddle.js did not initialize');
 console.log('Verified production default payment URL: '+base+'/checkout');
 console.log('Live Paddle.js initialized in Chromium. No checkout transaction was created and no payment was attempted.');
}finally{await browser.close();}
