import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const root=join(process.cwd(),'quality','generated');
const samples=[
 {file:'molecular-biology.docx',need:['Molecular Biology Workbook','Cell structure','Mitochondria','Energy conversion','Protein synthesis','Summary','Diagram showing a labeled schematic cell outline']},
 {file:'science-lecture.pptx',need:['Accessible Science Lecture','Learning outcomes','Cell Metabolism Case Study','cellular ATP']},
 {file:'assessment.xlsx',need:['Assessment Results','Lab Attendance','Amara','Noah','Mean score','=AVERAGE(B2:B3) [cached result: 90]','Microscopy','Titration']},
 {file:'biology-reader.epub',need:['Accessible Book Introduction','Cellular Pathways Chapter','Glycolysis','Energy release']},
 {file:'practical-log.ods',need:['Practical Log','Activity','Completed','Microscope Setup']},
 {file:'academic-handout.pdf',need:['Research Methods Seminar','Right column','Academic Handout Appendix','Second page supports']},
] as const;

for(const sample of samples){
  test('authoring-library/source-package corpus preserves meaning: '+sample.file,async({page})=>{
    test.setTimeout(90_000);
    const input=await readFile(join(root,sample.file));
    const originalHash=createHash('sha256').update(input).digest('hex');
    await page.goto('/checker');
    await page.getByLabel('Automatically recognize scanned pages (OCR)').uncheck();
    await page.locator('input[type=file]').setInputFiles({
      name:sample.file,mimeType:'application/octet-stream',buffer:input,
    });
    await expect(page.getByRole('heading',{name:sample.file})).toBeVisible({timeout:40_000});
    if(sample.file==='academic-handout.pdf'){
      const evidence=page.waitForEvent('download');
      await page.getByRole('button',{name:'Report JSON'}).click();
      const report=JSON.parse(await readFile(await (await evidence).path(),'utf8')) as {
        findings:Array<{title:string;category:string}>;
        pages:Array<{vectorPaintCount?:number}>;
      };
      expect(report.pages.some(p=>(p.vectorPaintCount||0)>0)).toBe(true);
      expect(report.findings.some(f=>f.title==='Review vector artwork and diagrams'&&f.category==='visual')).toBe(true);
    }
    const started=page.waitForEvent('download');
    await page.getByRole('button',{name:'Export HTML'}).click();
    const download=await started;
    const html=await readFile(await download.path(),'utf8');
    for(const phrase of sample.need)expect(html,sample.file+' lost text: '+phrase).toContain(phrase);
    const parsed=await page.evaluate(markup=>{
      const doc=new DOMParser().parseFromString(markup,'text/html');
      const rows=Array.from(doc.querySelectorAll('table')).map(t=>({
        headings:t.querySelectorAll('th[scope="col"]').length,
        rows:t.querySelectorAll('tbody tr').length,
      }));
      return {title:doc.title,language:doc.documentElement.lang,h1:doc.querySelectorAll('h1').length,rows};
    },html);
    expect(parsed.h1).toBeGreaterThanOrEqual(1);
    expect(parsed.language).toMatch(/^en/);
    if(['molecular-biology.docx','assessment.xlsx','biology-reader.epub','practical-log.ods'].includes(sample.file))
      expect(parsed.rows.some(t=>t.headings>=2&&t.rows>=1),sample.file).toBe(true);
    // The imported source is never edited or converted in place.
    expect(createHash('sha256').update(await readFile(join(root,sample.file))).digest('hex')).toBe(originalHash);
  });
}

test('independently authored DOCX full reading export contains true PDF structure and reopens as a PDF',async({page})=>{
  const input=await readFile(join(root,'molecular-biology.docx'));
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({
    name:'molecular-biology.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer:input
  });
  await expect(page.getByRole('heading',{name:'molecular-biology.docx'})).toBeVisible({timeout:40_000});
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:/Download tagged PDF/}).click();
  const output=await readFile(await (await pending).path());
  expect(output.subarray(0,5).toString('latin1')).toBe('%PDF-');
  expect(output.toString('latin1')).toContain('/StructTreeRoot');
  await page.goto('/checker');
  await page.getByLabel('Automatically recognize scanned pages (OCR)').uncheck();
  await page.locator('input[type=file]').setInputFiles({
    name:'reading-roundtrip.pdf',mimeType:'application/pdf',buffer:output
  });
  await expect(page.getByRole('heading',{name:'reading-roundtrip.pdf'})).toBeVisible({timeout:40_000});
  await page.getByRole('tab',{name:'Edit text'}).click();
  await expect.poll(async()=>page.getByLabel('Extracted text').evaluateAll(elements=>
    elements.map(el=>(el as HTMLTextAreaElement).value).join(' '))).toMatch(/Molecular Biology/i);
});

test('authored EPUB OPF spine order survives through the semantic reading export',async({page})=>{
  const input=await readFile(join(root,'biology-reader.epub'));
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({name:'biology-reader.epub',mimeType:'application/epub+zip',buffer:input});
  await expect(page.getByRole('heading',{name:'biology-reader.epub'})).toBeVisible();
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export HTML'}).click();
  const html=await readFile(await (await pending).path(),'utf8');
  expect(html.indexOf('Accessible Book Introduction')).toBeLessThan(html.indexOf('Cellular Pathways Chapter'));
});

test('authored ODS repeated data rows are faithfully represented in exported HTML',async({page})=>{
  const input=await readFile(join(root,'practical-log.ods'));
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({name:'practical-log.ods',mimeType:'application/octet-stream',buffer:input});
  await expect(page.getByRole('heading',{name:'practical-log.ods'})).toBeVisible();
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export HTML'}).click();
  const html=await readFile(await (await pending).path(),'utf8');
  expect((html.match(/<td>Microscope Setup<\/td>/g)||[]).length).toBe(2);
});
