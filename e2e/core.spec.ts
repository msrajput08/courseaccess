import {test,expect} from '@playwright/test';
import {makePdf} from './fixtures';
test('marketing, navigation and pricing clearly distinguish planned features',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:/Better learning begins with access/i})).toBeVisible();
  await page.getByRole('button',{name:/Explore reviewed example/i}).click();
  await expect(page.getByText('AFTER HUMAN REVIEW')).toBeVisible();
  await page.getByRole('link',{name:/Pricing/i}).first().click();
  await expect(page.getByText('Not available yet · No checkout').first()).toBeVisible();
  await page.screenshot({path:'test-results/pricing-desktop.png',fullPage:true});
});
test('real two-page PDF can be inspected, edited and exported',async({page})=>{
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({name:'lecture.pdf',mimeType:'application/pdf',buffer:makePdf(['Biology lecture notes: an introduction to cellular structures.',''])});
  await expect(page.getByRole('heading',{name:'lecture.pdf'})).toBeVisible({timeout:30000});
  await expect(page.getByText('2', {exact:true}).first()).toBeVisible();
  await page.getByRole('button',{name:/Page 02/i}).click();
  await expect(page.getByText('No extractable page text')).toBeVisible();
  await page.getByRole('button',{name:'Edit text'}).click();
  await expect(page.getByText('No text extracted')).toBeVisible();
  await page.getByRole('button',{name:/Page 01/i}).click();
  await expect(page.getByLabel('Extracted text').first()).toContainText('Biology lecture notes');
  const downloading=page.waitForEvent('download');
  await page.getByRole('button',{name:/Export HTML/}).click();
  const download=await downloading;
  expect(download.suggestedFilename()).toBe('lecture-reviewed.html');
  await page.screenshot({path:'test-results/workspace-desktop.png',fullPage:true});
});
test('corrupt input is rejected with a user-recoverable error',async({page})=>{
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({name:'corrupt.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a pdf')});
  await expect(page.getByRole('alert')).toContainText('not appear to be a valid PDF');
});
test('private workspace is empty until metadata is explicitly saved',async({page})=>{
  await page.goto('/workspace');
  await expect(page.getByText("There's no saved document history yet.")).toBeVisible();
});
