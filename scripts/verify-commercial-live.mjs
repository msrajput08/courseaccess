import {chromium} from 'playwright';
const origin=(process.env.COURSEACCESS_URL||'').replace(/\/$/,'');
if(origin!=='https://courseaccess.minty-12-shar.workers.dev')throw Error('Wrong live domain');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();const request=page.request;
 const plans=await (await request.get(origin+'/api/plans',{maxRetries:2})).json();
 if(plans.billingEnabled!==true||!plans.plans.some(p=>p.tier==='pro'&&p.monthlyUsd===12&&p.available)||!plans.plans.some(p=>p.tier==='institution'&&p.monthlyUsd===79&&p.available))throw Error('Commercial catalog not active');
 const cfg=await (await request.get(origin+'/api/billing/checkout-config',{maxRetries:2})).json();
 if(cfg.enabled!==true||typeof cfg.clientToken!=='string'||!cfg.clientToken.startsWith('live_'))throw Error('Live checkout config not active');
 const rejected=await request.post(origin+'/api/billing/checkout-intent',{headers:{origin},data:{tier:'pro'}});
 if(rejected.status()!==401)throw Error('Unauthenticated checkout was not rejected: '+rejected.status());
 const ent=await (await request.get(origin+'/api/entitlements',{maxRetries:2})).json();
 if(ent.paidFeaturesEnabled!==false||ent.batchLimit!==0)throw Error('Anonymous account received paid access');
 await page.goto(origin+'/pricing',{waitUntil:'domcontentloaded'});
 await page.getByRole('link',{name:'Choose Professor Pro'}).waitFor({timeout:30000});
 await page.getByRole('link',{name:'Choose Institution'}).waitFor({timeout:30000});
 await page.getByRole('link',{name:'Choose Professor Pro'}).click();
 await page.getByRole('heading',{name:'Create your account'}).waitFor({timeout:30000});
 console.log('LIVE commercial plans, live checkout configuration, anonymous purchase denial and account onboarding passed. No transaction or payment created.');
}finally{await browser.close();}
