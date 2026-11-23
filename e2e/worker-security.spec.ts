import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {makePdf,makeScannedJpegPdf} from './fixtures';

test('actual Cloudflare Worker applies CSP and serves a complete local PDF workflow',async({page,request})=>{
  const response=await request.get('/checker');
  expect(response.status()).toBe(200);
  const csp=response.headers()['content-security-policy']||'';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("'wasm-unsafe-eval'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).not.toContain("'unsafe-eval'");
  expect(response.headers()['x-frame-options']).toBe('DENY');
  for(const path of ['/ocr/worker.min.js','/ocr/lang/eng.traineddata.gz']){
    const asset=await request.head(path);
    expect(asset.status(),path).toBe(200);
    expect(asset.headers()['content-type'],path).not.toMatch(/text\/html/);
  }
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{
    if(message.type()==='error'&&/Content Security Policy|Refused to/i.test(message.text()))errors.push(message.text());
  });
  await page.goto('/checker');
  await page.getByLabel('Automatically recognize scanned pages (OCR)').uncheck();
  await page.locator('input[type=file]').setInputFiles({
    name:'worker-handout.pdf',mimeType:'application/pdf',
    buffer:makePdf(['CourseAccess security smoke-test content']),
  });
  await expect(page.getByRole('heading',{name:'worker-handout.pdf'})).toBeVisible({timeout:30000});
  const event=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export HTML'}).click();
  const content=await readFile(await (await event).path(),'utf8');
  expect(content).toContain('CourseAccess security smoke-test content');
  expect(errors).toEqual([]);
});

test('actual Cloudflare Worker CSP allows offline-origin OCR on scanned PDF',async({page})=>{
  test.setTimeout(180_000);
  const errors:string[]=[];
  const foreign:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{
    if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))errors.push(m.text());
  });
  page.on('request',r=>{
    if(/cdn\.jsdelivr\.net|tessdata\.projectnaptha\.com|unpkg\.com/i.test(r.url()))foreign.push(r.url());
  });
  await page.setContent('<html><body style="margin:0;background:white"><div id="testscan" style="width:900px;height:240px;background:white;color:black;font:bold 57px Arial;padding:30px">ACCESSIBLE SCIENCE</div></body></html>');
  const jpeg=await page.locator('#testscan').screenshot({type:'jpeg',quality:94});
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({
    name:'worker-scan.pdf',mimeType:'application/pdf',
    buffer:makeScannedJpegPdf(jpeg,900,240),
  });
  await expect(page.getByRole('heading',{name:'worker-scan.pdf'})).toBeVisible({timeout:160000});
  await expect(page.getByText('OCR text recovered').first()).toBeVisible();
  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});
