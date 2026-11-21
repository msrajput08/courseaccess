import { test, expect } from '@playwright/test';
import { makePdf, makeScannedJpegPdf } from './fixtures';

test('live routes, API and SEO respond from the published Worker', async ({page,request},testInfo) => {
  const errors: string[] = [];
  page.on('pageerror',e=>errors.push(e.message));
  const health=await request.get('/api/health');
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({status:'ok',product:'CourseAccess'});
  const xml=await request.get('/sitemap.xml');
  expect(xml.ok()).toBe(true);
  expect(await xml.text()).toContain('/checker');
  const robots=await request.get('/robots.txt');
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain('/sitemap.xml');

  await page.goto('/');
  await expect(page.getByRole('heading',{name:/Better learning begins with access/i})).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',new URL('/',testInfo.project.use.baseURL as string).toString());
  await page.screenshot({path:'test-results/live/home-'+testInfo.project.name+'.png',fullPage:true});
  await page.goto('/pricing');
  await expect(page.getByRole('heading',{name:/Make room for more learners/i})).toBeVisible();
  await expect(page.getByText('Why use CourseAccess instead of checking every page myself?')).toBeVisible();
  await page.screenshot({path:'test-results/live/pricing-'+testInfo.project.name+'.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('real deployed checker processes PDF, prepares reading draft and exports', async ({page},testInfo) => {
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({
    name:'live-proof.pdf',mimeType:'application/pdf',
    buffer:makePdf(['University lecture notes with actual selectable text.','']),
  });
  await expect(page.getByRole('heading',{name:'live-proof.pdf'})).toBeVisible({timeout:30000});
  await expect(page.getByRole('heading',{name:'Reading draft prepared.'})).toBeVisible();
  await expect(page.getByText(/1 page\(s\) still need text/)).toBeVisible();
  await page.getByRole('button',{name:/Page 02/i}).click();
  await page.getByRole('tab',{name:'Edit text'}).click();
  await expect(page.getByLabel('Add recovered page text')).toBeVisible();
  await page.getByLabel('Add recovered page text').fill('Recovered accessible text for this page.');
  await page.getByRole('button',{name:/Add text to HTML draft/}).click();
  await expect(page.getByLabel('Extracted text').first()).toHaveValue('Recovered accessible text for this page.');
  const dl=page.waitForEvent('download');
  await page.getByRole('button',{name:/Export HTML/}).click();
  expect((await dl).suggestedFilename()).toBe('live-proof-reviewed.html');
  await page.screenshot({path:'test-results/live/checker-'+testInfo.project.name+'.png',fullPage:true});
  expect(errors).toEqual([]);
});


test('live website has no axe critical/serious accessibility violations on key public pages', async ({page}) => {
  const {default:AxeBuilder}=await import('@axe-core/playwright');
  for(const route of ['/','/checker','/pricing']){
    await page.goto(route);
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
    const serious=result.violations.filter(v=>v.impact==='critical'||v.impact==='serious');
    expect(serious.map(v=>({route,id:v.id,impact:v.impact,nodes:v.nodes.slice(0,5).map(n=>n.target)}))).toEqual([]);
  }
});


test('production OCR converts actual image-only PDF into a tagged, searchable reading copy',async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<html><body style="background:#fff;margin:0"><div id="scan" style="width:900px;height:260px;background:white;padding:25px;box-sizing:border-box;font-family:Arial;color:black"><div style="font-size:58px;font-weight:bold;line-height:1.4">ACCESSIBLE SCIENCE</div><div style="font-size:35px">Cell Biology Lecture Notes</div></div></body></html>');
  const jpeg=await page.locator('#scan').screenshot({type:'jpeg',quality:96});
  await page.goto('/checker');
  await expect(page.getByLabel('Automatically recognize scanned pages (OCR)')).toBeChecked();
  await page.locator('input[type=file]').setInputFiles({
    name:'scanned-lesson.pdf',mimeType:'application/pdf',buffer:makeScannedJpegPdf(jpeg),
  });
  await expect(page.getByRole('heading',{name:'scanned-lesson.pdf'})).toBeVisible({timeout:150000});
  await expect(page.getByText('OCR text recovered').first()).toBeVisible();
  const searchablePending=page.waitForEvent('download');
  await page.getByRole('button',{name:/Keep layout \+ searchable OCR/}).click();
  const sourceCopy=await searchablePending;
  expect(sourceCopy.suggestedFilename()).toBe('scanned-lesson-searchable-original-layout.pdf');
  const searchableBytes=await (await import('node:fs/promises')).readFile(await sourceCopy.path());
  expect(searchableBytes.subarray(0,5).toString('latin1')).toBe('%PDF-');
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:/Download tagged PDF/}).click();
  const file=await pending;
  expect(file.suggestedFilename()).toBe('scanned-lesson-tagged-reading.pdf');
  const {readFile}=await import('node:fs/promises');
  const bytes=await readFile(await file.path());
  expect(bytes.toString('latin1')).toContain('/StructTreeRoot');
  await page.goto('/checker');
  await page.getByLabel('Automatically recognize scanned pages (OCR)').uncheck();
  await page.locator('input[type=file]').setInputFiles({
    name:'reading-copy.pdf',mimeType:'application/pdf',buffer:bytes,
  });
  await expect(page.getByRole('heading',{name:'reading-copy.pdf'})).toBeVisible({timeout:30000});
  await page.getByRole('tab',{name:'Edit text'}).click();
  await expect.poll(async()=>await page.getByLabel('Extracted text').evaluateAll(elements=>elements.map(el=>(el as HTMLTextAreaElement).value).join(' '))).toMatch(/SCIENCE/i);
  await page.goto('/checker');
  await page.getByLabel('Automatically recognize scanned pages (OCR)').uncheck();
  await page.locator('input[type=file]').setInputFiles({name:'layout-ocr.pdf',mimeType:'application/pdf',buffer:searchableBytes});
  await expect(page.getByRole('heading',{name:'layout-ocr.pdf'})).toBeVisible({timeout:30000});
  await page.getByRole('tab',{name:'Edit text'}).click();
  await expect.poll(async()=>await page.getByLabel('Extracted text').evaluateAll(elements=>elements.map(el=>(el as HTMLTextAreaElement).value).join(' '))).toMatch(/SCIENCE/i);
  expect(errors).toEqual([]);
});
