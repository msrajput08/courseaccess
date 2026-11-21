import {test,expect} from '@playwright/test';
import {makePdf,makeImageOnlyPdf,makeStyledPdf} from './fixtures';
test('marketing, navigation and pricing clearly distinguish planned features',async({page},testInfo)=>{
  await page.goto('/');
  await page.screenshot({path:'test-results/home-'+testInfo.project.name+'.png',fullPage:true});
  await expect(page.getByRole('heading',{name:/Better learning begins with access/i})).toBeVisible();
  await page.getByRole('button',{name:/Explore reviewed example/i}).click();
  await expect(page.getByText('AFTER HUMAN REVIEW')).toBeVisible();
  await page.getByRole('link',{name:/Pricing/i}).first().click();
  await expect(page.getByText('Not available yet · No checkout').first()).toBeVisible();
  await page.screenshot({path:'test-results/pricing-'+testInfo.project.name+'.png',fullPage:true});
});
test('real two-page PDF can be inspected, edited and exported',async({page},testInfo)=>{
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({name:'lecture.pdf',mimeType:'application/pdf',buffer:makePdf(['Biology lecture notes: an introduction to cellular structures.',''])});
  await expect(page.getByRole('heading',{name:'lecture.pdf'})).toBeVisible({timeout:30000});
  await expect(page.getByText('2', {exact:true}).first()).toBeVisible();
  await page.getByRole('button',{name:/Page 02/i}).click();
  await expect(page.getByText('No extractable page text')).toBeVisible();
  await page.getByRole('tab',{name:'Edit text'}).click();
  await expect(page.getByText('No text extracted')).toBeVisible();
  await page.getByRole('button',{name:/Page 01/i}).click();
  await expect(page.getByLabel('Extracted text').first()).toHaveValue(/Biology lecture notes/);
  const downloading=page.waitForEvent('download');
  await page.getByRole('button',{name:/Export HTML/}).click();
  const download=await downloading;
  expect(download.suggestedFilename()).toBe('lecture-reviewed.html');
  await page.screenshot({path:'test-results/workspace-'+testInfo.project.name+'.png',fullPage:true});
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

test('image-only page produces a potential image-only warning and figure-review prompt',async({page})=>{
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({name:'scanned-example.pdf',mimeType:'application/pdf',buffer:makeImageOnlyPdf()});
  await expect(page.getByRole('heading',{name:'scanned-example.pdf'})).toBeVisible({timeout:30000});
  await expect(page.getByText('No extractable page text')).toBeVisible();
  await expect(page.getByText('Possible image-only page')).toBeVisible();
  await expect(page.getByText('Review figure descriptions')).toBeVisible();
});
test('math-containing PDF produces a human-review prompt, not an invented translation',async({page})=>{
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({name:'algebra.pdf',mimeType:'application/pdf',buffer:makePdf(['Equation 2: 3x + y = 12. Check this exact formula before distributing the lesson.'])});
  await expect(page.getByRole('heading',{name:'algebra.pdf'})).toBeVisible({timeout:30000});
  await expect(page.getByText('Review mathematical notation')).toBeVisible();
});
test('optional saved metadata can be viewed and deleted without storing document text',async({page})=>{
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({name:'private-course.pdf',mimeType:'application/pdf',buffer:makePdf(['Instructor handout with selectable text and practical course information.'])});
  await expect(page.getByRole('heading',{name:'private-course.pdf'})).toBeVisible({timeout:30000});
  await page.getByRole('button',{name:/Save metadata/}).click();
  await page.goto('/workspace');
  await expect(page.getByText('private-course.pdf')).toBeVisible();
  await page.getByRole('button',{name:/Delete all local summaries/}).click();
  await expect(page.getByText("There's no saved document history yet.")).toBeVisible();
});

test('missing selectable text can be recovered inside the generated HTML draft',async({page})=>{
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({name:'two-pages.pdf',mimeType:'application/pdf',buffer:makePdf(['Lecture notes with searchable content.',''])});
  await expect(page.getByRole('heading',{name:'two-pages.pdf'})).toBeVisible({timeout:30000});
  await expect(page.getByRole('heading',{name:'Reading draft prepared.'})).toBeVisible();
  await page.getByRole('button',{name:/Page 02/i}).click();
  await page.getByRole('tab',{name:'Edit text'}).click();
  await page.getByLabel('Add recovered page text').fill('Recovered chapter text for students.');
  await page.getByRole('button',{name:/Add text to HTML draft/i}).click();
  await expect(page.getByLabel('Extracted text').first()).toHaveValue('Recovered chapter text for students.');
  const wait=page.waitForEvent('download');
  await page.getByRole('button',{name:/Export HTML/}).click();
  const file=await wait;
  expect(file.suggestedFilename()).toBe('two-pages-reviewed.html');
});
test('proposes semantic heading and list elements from real PDF formatting',async({page})=>{
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({name:'structured.pdf',mimeType:'application/pdf',buffer:makeStyledPdf()});
  await expect(page.getByRole('heading',{name:'structured.pdf'})).toBeVisible({timeout:30000});
  await expect(page.getByText(/proposed 1 heading/)).toBeVisible();
  await expect(page.getByText(/2 list items/)).toBeVisible();
  await page.getByRole('tab',{name:'Edit text'}).click();
  await expect(page.getByLabel('Semantic role').first()).toHaveValue('heading');
  await expect(page.getByLabel('Semantic role').nth(2)).toHaveValue('list');
});