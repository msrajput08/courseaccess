import assert from 'node:assert/strict';import {chromium} from 'playwright';
const origin=(process.env.COURSEACCESS_URL||'').replace(/\/$/,'');
if(origin!=='https://courseaccess.minty-12-shar.workers.dev')throw Error('Wrong production origin');
const b=await chromium.launch();
try{const page=await b.newPage();const r=await page.request.get(origin+'/api/admin/analytics?days=7');assert.equal(r.status(),401);assert.match(r.headers()['cache-control'],/no-store/);const html=await page.goto(origin+'/admin/analytics');assert.equal(html?.status(),200);assert.match(html.headers()['x-robots-tag'],/noindex/);assert.ok(!(html.headers()['content-security-policy']||'').includes('googletagmanager.com'));await page.getByRole('heading',{name:'Sign in required'}).waitFor();await page.getByRole('link',{name:'Sign in with passkey'}).waitFor();console.log('Private dashboard route, anonymous API denial and noindex verified. Owner analytics query requires configured credentials.');}finally{await b.close();}
