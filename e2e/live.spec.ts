import { test, expect } from '@playwright/test';
import { makePdf } from './fixtures';

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
  await expect(page.getByText(/1 page\(s\) need added text/)).toBeVisible();
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
