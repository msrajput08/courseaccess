import {test,expect} from '@playwright/test';
import {makePdf,makeImageOnlyPdf,makeStyledPdf,makeScannedJpegPdf} from './fixtures';
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
  await page.getByLabel('Automatically recognize scanned pages (OCR)').uncheck();
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

test('tagged PDF reading export has real semantic PDF tags and searchable extracted text',async({page})=>{
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({
    name:'structured-source.pdf',mimeType:'application/pdf',buffer:makeStyledPdf(),
  });
  await expect(page.getByRole('heading',{name:'structured-source.pdf'})).toBeVisible({timeout:30000});
  const downloadWait=page.waitForEvent('download');
  await page.getByRole('button',{name:/Download tagged PDF/}).click();
  const file=await downloadWait;
  expect(file.suggestedFilename()).toBe('structured-source-tagged-reading.pdf');
  const {readFile}=await import('node:fs/promises');
  const bytes=await readFile(await file.path());
  expect(bytes.subarray(0,5).toString('latin1')).toBe('%PDF-');
  expect(bytes.toString('latin1')).toContain('/StructTreeRoot');
  expect(bytes.toString('latin1')).toContain('/MarkInfo');
  await page.goto('/checker');
  await page.getByLabel('Automatically recognize scanned pages (OCR)').uncheck();
  await page.locator('input[type=file]').setInputFiles({
    name:'reopened-tagged.pdf',mimeType:'application/pdf',buffer:bytes,
  });
  await expect(page.getByRole('heading',{name:'reopened-tagged.pdf'})).toBeVisible({timeout:30000});
  await page.getByRole('tab',{name:'Edit text'}).click();
  await expect(page.getByLabel('Extracted text').first()).toHaveValue(/structured-source/);
});
test('actual image-only PDF automatically runs OCR and recovers page text',async({page})=>{
  test.setTimeout(180000);
  await page.setContent('<html><body style="background:#fff;margin:0"><div id="scan" style="width:900px;height:260px;background:white;padding:25px;box-sizing:border-box;font-family:Arial;color:black"><div style="font-size:58px;font-weight:bold;line-height:1.4">ACCESSIBLE SCIENCE</div><div style="font-size:35px">Cell Biology Lecture Notes</div></div></body></html>');
  const jpeg=await page.locator('#scan').screenshot({type:'jpeg',quality:96});
  await page.goto('/checker');
  await expect(page.getByLabel('Automatically recognize scanned pages (OCR)')).toBeChecked();
  await page.locator('input[type=file]').setInputFiles({
    name:'image-scan.pdf',mimeType:'application/pdf',buffer:makeScannedJpegPdf(jpeg),
  });
  await expect(page.getByRole('heading',{name:'image-scan.pdf'})).toBeVisible({timeout:150000});
  await expect(page.getByText('OCR text recovered').first()).toBeVisible();
  await expect(page.locator('.preview-status')).toHaveCount(0);
  const samplePagePixels=async()=>page.locator('.pdf-canvas').evaluate((element)=>{
    const canvas=element as HTMLCanvasElement;
    const pixels=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;
    const stride=Math.max(4,Math.floor(pixels.length/16000/4)*4);
    const sample:number[]=[];
    for(let offset=0;offset+2<pixels.length;offset+=stride){
      sample.push(pixels[offset],pixels[offset+1],pixels[offset+2]);
    }
    return sample;
  });
  const sourceVisual=await samplePagePixels();
  await page.getByRole('tab',{name:'Edit text'}).click();
  await expect.poll(async()=>await page.getByLabel('Extracted text').evaluateAll(elements=>elements.map(el=>(el as HTMLTextAreaElement).value).join(' '))).toMatch(/SCIENCE/i);
  // Build an additional original-layout OCR copy (the existing page artwork
  // remains visible, while positioned OCR words are selectable).
  const searchablePending=page.waitForEvent('download');
  await page.getByRole('button',{name:/Keep layout \+ searchable OCR/}).click();
  const searchableFile=await searchablePending;
  expect(searchableFile.suggestedFilename()).toBe('image-scan-searchable-original-layout.pdf');
  const searchableBytes=await (await import('node:fs/promises')).readFile(await searchableFile.path());
  expect(searchableBytes.subarray(0,5).toString('latin1')).toBe('%PDF-');
  const downloadWait=page.waitForEvent('download');
  await page.getByRole('button',{name:/Download tagged PDF/}).click();
  const exported=await downloadWait;
  expect(exported.suggestedFilename()).toBe('image-scan-tagged-reading.pdf');
  const {readFile}=await import('node:fs/promises');
  const bytes=await readFile(await exported.path());
  expect(bytes.toString('latin1')).toContain('/StructTreeRoot');
  expect(bytes.toString('latin1')).toContain('/MarkInfo');
  await page.goto('/checker');
  await page.getByLabel('Automatically recognize scanned pages (OCR)').uncheck();
  await page.locator('input[type=file]').setInputFiles({name:'ocr-output.pdf',mimeType:'application/pdf',buffer:bytes});
  await expect(page.getByRole('heading',{name:'ocr-output.pdf'})).toBeVisible({timeout:30000});
  await page.getByRole('tab',{name:'Edit text'}).click();
  await expect.poll(async()=>await page.getByLabel('Extracted text').evaluateAll(elements=>elements.map(el=>(el as HTMLTextAreaElement).value).join(' '))).toMatch(/SCIENCE/i);
  await page.goto('/checker');
  await page.getByLabel('Automatically recognize scanned pages (OCR)').uncheck();
  await page.locator('input[type=file]').setInputFiles({name:'original-look-searchable.pdf',mimeType:'application/pdf',buffer:searchableBytes});
  await expect(page.getByRole('heading',{name:'original-look-searchable.pdf'})).toBeVisible({timeout:30000});
  await expect(page.locator('.preview-status')).toHaveCount(0);
  const searchableVisual=await samplePagePixels();
  expect(searchableVisual.length).toBe(sourceVisual.length);
  const averageDelta=searchableVisual.reduce((sum,value,index)=>
    sum+Math.abs(value-sourceVisual[index]),0)/(255*sourceVisual.length);
  // Visually indistinguishable within a 0.2% average color tolerance.
  // Browser PNG screenshot encoders can differ despite same canvas pixels.
  expect(averageDelta).toBeLessThan(0.002);
  await page.getByRole('tab',{name:'Edit text'}).click();
  await expect.poll(async()=>await page.getByLabel('Extracted text').evaluateAll(elements=>elements.map(el=>(el as HTMLTextAreaElement).value).join(' '))).toMatch(/SCIENCE/i);
  await expect(page.getByText('No extractable page text')).toHaveCount(0);
});

