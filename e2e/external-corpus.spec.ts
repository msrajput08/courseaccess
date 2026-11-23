import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const corpus=join(process.cwd(),'quality','external');

for(const file of ['sample.docx','sample.pptx','sample.xlsx','sample1_small.pdf']){
  test('independently authored CC0 document has meaningful, exportable source text: '+file,async({page})=>{
    const bytes=await readFile(join(corpus,file));
    await page.goto('/checker');
    await page.getByLabel('Automatically recognize scanned pages (OCR)').uncheck();
    await page.locator('input[type=file]').setInputFiles({
      name:file,mimeType:'application/octet-stream',buffer:bytes
    });
    await expect(page.getByRole('heading',{name:file})).toBeVisible({timeout:30000});
    const pending=page.waitForEvent('download');
    await page.getByRole('button',{name:'Export HTML'}).click();
    const html=await readFile(await (await pending).path(),'utf8');
    const sourceEvidence=await page.evaluate(markup=>{
      const doc=new DOMParser().parseFromString(markup,'text/html');
      const source=Array.from(doc.querySelectorAll('main section p,main section h2,main section h3,main section td,main section th,main section li'))
        .map(el=>el.textContent||'').filter(x=>x.trim().length>0);
      return {length:source.join(' ').trim().length,items:source.length,
        sections:doc.querySelectorAll('main section').length};
    },html);
    expect(sourceEvidence.sections).toBeGreaterThan(0);
    expect(sourceEvidence.items).toBeGreaterThan(0);
    expect(sourceEvidence.length).toBeGreaterThan(4);
  });
}

test('externally authored corrupted and encrypted PDFs reject with safe errors',async({page})=>{
  for(const file of ['sample-corrupted.pdf','sample-password-protected.pdf']){
    await page.goto('/checker');
    await page.getByLabel('Automatically recognize scanned pages (OCR)').uncheck();
    await page.locator('input[type=file]').setInputFiles({
      name:file,mimeType:'application/pdf',buffer:await readFile(join(corpus,file))
    });
    await expect(page.getByRole('alert')).toBeVisible({timeout:30000});
    await expect(page.getByRole('heading',{name:file})).toHaveCount(0);
  }
});
test('externally authored scanned PDF records missing text without fabricating a transcription',async({page})=>{
  const file='sample-scanned.pdf';
  await page.goto('/checker');
  await page.getByLabel('Automatically recognize scanned pages (OCR)').uncheck();
  await page.locator('input[type=file]').setInputFiles({
    name:file,mimeType:'application/pdf',buffer:await readFile(join(corpus,file))
  });
  await expect(page.getByRole('heading',{name:file})).toBeVisible({timeout:30000});
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'Report JSON'}).click();
  const report=JSON.parse(await readFile(await (await pending).path(),'utf8')) as {
    pages:{text?:string;textItemCount:number;imagePaintCount:number}[];
    findings:{title:string}[];
  };
  expect(report.pages.length).toBeGreaterThanOrEqual(1);
  expect(report.pages.some(p=>p.imagePaintCount>0&&p.textItemCount===0)).toBe(true);
  expect(report.findings.some(f=>/No extractable page text|Possible image-only page/i.test(f.title))).toBe(true);
});
