import {test,expect} from '@playwright/test';
import JSZip from 'jszip';
import {readFile} from 'node:fs/promises';

const wordXml='<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+
  '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Cell Biology Lecture</w:t></w:r></w:p>'+
  '<w:p><w:r><w:t>Students will explore cellular processes.</w:t></w:r></w:p>'+
  '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Organelle</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Function</w:t></w:r></w:p></w:tc></w:tr>'+
  '<w:tr><w:tc><w:p><w:r><w:t>Mitochondria</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Energy production</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>';
const pptXml='<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Biology Seminar Slides</a:t></a:r></a:p><a:p><a:r><a:t>Cell structure introduction</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>';
const xlsxXml='<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+
  '<row r="1"><c r="A1" t="inlineStr"><is><t>Student</t></is></c><c r="B1" t="inlineStr"><is><t>Score</t></is></c></row>'+
  '<row r="2"><c r="A2" t="inlineStr"><is><t>Hana</t></is></c><c r="B2"><v>99</v></c></row></sheetData></worksheet>';
const workbookXml='<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Assessment results" sheetId="1"/></sheets></workbook>';
export async function fixture(format:'docx'|'pptx'|'xlsx'|'odt'|'odp'|'ods'|'epub'):Promise<Buffer>{
  const zip=new JSZip();
  if(format==='docx')zip.file('word/document.xml',wordXml);
  if(format==='pptx')zip.file('ppt/slides/slide1.xml',pptXml);
  if(format==='xlsx'){
    zip.file('xl/workbook.xml',workbookXml);
    zip.file('xl/worksheets/sheet1.xml',xlsxXml);
  }
  const prefix='<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"><office:body>';
  if(format==='odt')zip.file('content.xml',prefix+'<office:text><text:h>Accessible university notes</text:h><text:p>Inclusive classroom activities</text:p></office:text></office:body></office:document-content>');
  if(format==='odp')zip.file('content.xml',prefix+'<office:presentation><draw:page><text:h>OpenDocument presentation</text:h><text:p>Lesson overview</text:p></draw:page></office:presentation></office:body></office:document-content>');
  if(format==='ods')zip.file('content.xml',prefix+'<office:spreadsheet><table:table table:name="Class Results"><table:table-row><table:table-cell><text:p>Item</text:p></table:table-cell><table:table-cell><text:p>Points</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell><text:p>Quiz</text:p></table:table-cell><table:table-cell><text:p>20</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>');
  if(format==='epub')zip.file('OEBPS/chapter1.xhtml','<!DOCTYPE html><html><body><main><h2>Digital textbook chapter</h2><p>Learning about scientific evidence.</p></main></body></html>');
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
const samples=[
  {format:'docx',content:'Cell Biology Lecture',label:'Word document'},
  {format:'pptx',content:'Biology Seminar Slides',label:'Slide 1'},
  {format:'xlsx',content:'Hana',label:'Assessment results'},
  {format:'odt',content:'Accessible university notes',label:'OpenDocument text'},
  {format:'odp',content:'OpenDocument presentation',label:'Slide 1'},
  {format:'ods',content:'Quiz',label:'Class Results'},
  {format:'epub',content:'Digital textbook chapter',label:'Chapter 1'},
] as const;
for(const source of samples){
  test('real '+source.format+' upload parses source content into the accessible workspace',async({page})=>{
    await page.goto('/checker');
    await page.locator('input[type=file]').setInputFiles({
      name:'university.'+source.format,buffer:await fixture(source.format),
      mimeType:'application/octet-stream',
    });
    await expect(page.getByRole('heading',{name:'university.'+source.format})).toBeVisible({timeout:30000});
    await expect(page.getByRole('region',{name:/Imported source content/})).toContainText(source.content);
    await expect(page.getByRole('region',{name:/Imported source content/})).toContainText(source.label);
    await expect(page.getByRole('heading',{name:'Reading draft prepared.'})).toBeVisible();
    await expect(page.locator('.pdf-canvas')).toHaveCount(0);
    await page.getByRole('tab',{name:'Edit text'}).click();
    await expect(page.locator('.edit-block textarea').first()).not.toHaveValue('');
  });
}
test('DOCX heading and table reach genuine HTML and independently tagged PDF reading exports',async({page})=>{
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({
    name:'course-notes.docx',buffer:await fixture('docx'),mimeType:'application/octet-stream',
  });
  await expect(page.getByRole('heading',{name:'course-notes.docx'})).toBeVisible();
  const htmlPending=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export HTML'}).click();
  const html=await readFile(await (await htmlPending).path(),'utf8');
  expect(html).toContain('<th scope="col">Organelle</th>');
  expect(html).toContain('<h2>Cell Biology Lecture</h2>');
  const pdfPending=page.waitForEvent('download');
  await page.getByRole('button',{name:/Download tagged PDF/}).click();
  const download=await pdfPending;
  expect(download.suggestedFilename()).toBe('course-notes-tagged-reading.pdf');
  const blob=await readFile(await download.path());
  expect(blob.subarray(0,5).toString('latin1')).toBe('%PDF-');
  expect(blob.toString('latin1')).toContain('/StructTreeRoot');
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({
    name:'round-trip.pdf',buffer:blob,mimeType:'application/pdf',
  });
  await expect(page.getByRole('heading',{name:'round-trip.pdf'})).toBeVisible({timeout:30000});
});
test('CSV quoted rows and Markdown headings are independently imported',async({page})=>{
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({
    name:'course.csv',buffer:Buffer.from('Name,Score\n"Sam, Lee",98\nTaylor,94'),mimeType:'text/csv'
  });
  await expect(page.getByRole('heading',{name:'course.csv'})).toBeVisible();
  await expect(page.getByRole('region',{name:/Imported source content/})).toContainText('Sam, Lee');
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({
    name:'study.md',buffer:Buffer.from('## Accessible Notes\n- Read the introduction\nTextbook guidance.'),mimeType:'text/markdown'
  });
  await expect(page.getByRole('heading',{name:'study.md'})).toBeVisible();
  await expect(page.getByRole('region',{name:/Imported source content/})).toContainText('Accessible Notes');
});
test('invalid office archive is rejected without entering workspace',async({page})=>{
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({
    name:'corrupt.docx',buffer:Buffer.from('not-a-zip'),mimeType:'application/octet-stream'
  });
  await expect(page.getByRole('alert')).toContainText(/not a valid ZIP|archive could not be opened/i);
  await expect(page.getByRole('heading',{name:'corrupt.docx'})).toHaveCount(0);
});


test('standalone scanned PNG enters OCR-capable image preview and can be transcribed',async({page})=>{
  await page.setContent('<div style="width:700px;height:160px;background:white;color:black;font:50px Arial">Lecture IMAGE</div>');
  const png=await page.locator('div').screenshot({type:'png'});
  await page.goto('/checker');
  await page.getByLabel('Automatically recognize scanned pages (OCR)').uncheck();
  await page.locator('input[type=file]').setInputFiles({name:'scan.png',mimeType:'image/png',buffer:png});
  await expect(page.getByRole('heading',{name:'scan.png'})).toBeVisible();
  await expect(page.getByRole('img',{name:'Original scanned image supplied for text recognition'})).toBeVisible();
  await page.getByRole('tab',{name:'Edit text'}).click();
  await page.getByLabel('Add recovered page text').fill('Accurately transcribed lecture image');
  await page.getByRole('button',{name:/Add text to reading copy/}).click();
  await expect(page.getByLabel('Extracted text').first()).toHaveValue('Accurately transcribed lecture image');
});
test('HTML import ignores executable markup and exports escaped semantic reading content',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({
    name:'course.html',mimeType:'text/html',
    buffer:Buffer.from('<html><body><main><h2>Course accessibility</h2><p>Read carefully and learn.</p><script>throw Error("INJECTED")</script></main></body></html>'),
  });
  await expect(page.getByRole('heading',{name:'course.html'})).toBeVisible();
  await expect(page.getByRole('region',{name:/Imported source content/})).toContainText('Course accessibility');
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export HTML'}).click();
  const content=await readFile(await (await pending).path(),'utf8');
  expect(content).toContain('<h2>Course accessibility</h2>');
  expect(content).not.toContain('INJECTED');
  expect(errors).toEqual([]);
});
test('plain TXT, RTF and TSV are treated as readable documents, not PDFs',async({page})=>{
  for(const entry of [
    {name:'notes.txt',mime:'text/plain',value:'Classroom accessibility guidance'},
    {name:'chapter.rtf',mime:'application/rtf',value:'{\\rtf1\\ansi Inclusive\\par teaching text}'},
    {name:'attendance.tsv',mime:'text/tab-separated-values',value:'Student\tCourse\nMaya\tBiology'},
  ]){
    await page.goto('/checker');
    await page.locator('input[type=file]').setInputFiles({
      name:entry.name,mimeType:entry.mime,buffer:Buffer.from(entry.value),
    });
    await expect(page.getByRole('heading',{name:entry.name})).toBeVisible({timeout:30000});
    await expect(page.getByRole('region',{name:/Imported source content/})).toBeVisible();
  }
});

test('long XLSX table import keeps the final rows in the exported HTML instead of clipping the first block',async({page})=>{
  const archive=new JSZip();
  const rows=Array.from({length:150},(_,i)=>{
    const n=i+1;
    const detail='Course description '+n+' '+('x'.repeat(120));
    return '<row r="'+n+'"><c r="A'+n+'" t="inlineStr"><is><t>Student '+n+'</t></is></c>'+
      '<c r="B'+n+'" t="inlineStr"><is><t>'+detail+'</t></is></c></row>';
  }).join('');
  archive.file('xl/workbook.xml',workbookXml);
  archive.file('xl/worksheets/sheet1.xml','<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+rows+'</sheetData></worksheet>');
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({
    name:'long-course.xlsx',
    buffer:await archive.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),
    mimeType:'application/octet-stream',
  });
  await expect(page.getByRole('heading',{name:'long-course.xlsx'})).toBeVisible({timeout:30000});
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export HTML'}).click();
  const html=await readFile(await (await pending).path(),'utf8');
  expect(html).toContain('Student 1');
  expect(html).toContain('Student 150');
  expect(html).toContain('Course description 150 '+('x'.repeat(120)));
  expect((html.match(/<table>/g)||[]).length).toBeGreaterThan(1);
});
test('malformed CSV fails visibly before creating a truncated workspace',async({page})=>{
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({
    name:'broken.csv',buffer:Buffer.from('Student,Grade\n"Taylor"x,95'),
    mimeType:'text/csv',
  });
  await expect(page.getByRole('alert')).toContainText(/closing quote/i);
  await expect(page.getByRole('heading',{name:'broken.csv'})).toHaveCount(0);
});
test('oversized Word paragraph is rejected explicitly, never silently cut',async({page})=>{
  const zip=new JSZip();
  const word='<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>'+
    'X'.repeat(12_100)+'</w:t></w:r></w:p></w:body></w:document>';
  zip.file('word/document.xml',word);
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({
    name:'oversized-paragraph.docx',
    buffer:await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),
    mimeType:'application/octet-stream',
  });
  await expect(page.getByRole('alert')).toContainText(/12,000 characters/i);
  await expect(page.getByRole('heading',{name:'oversized-paragraph.docx'})).toHaveCount(0);
});


test('OpenDocument repeated nonempty table rows survive in semantic HTML, excluding empty formatting rows',async({page})=>{
  const zip=new JSZip();
  zip.file('content.xml', '<?xml version="1.0"?>'+
    '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '+
    'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '+
    'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0">'+
    '<office:body><office:spreadsheet><table:table table:name="Attendance">'+
    '<table:table-row><table:table-cell><text:p>Student</text:p></table:table-cell>'+
    '<table:table-cell><text:p>Attended</text:p></table:table-cell></table:table-row>'+
    '<table:table-row table:number-rows-repeated="3">'+
    '<table:table-cell><text:p>Class A</text:p></table:table-cell>'+
    '<table:table-cell><text:p>Yes</text:p></table:table-cell></table:table-row>'+
    '<table:table-row table:number-rows-repeated="1000000">'+
    '<table:table-cell/><table:table-cell/></table:table-row>'+
    '</table:table></office:spreadsheet></office:body></office:document-content>');
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({
    name:'attendance.ods',
    buffer:await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),
    mimeType:'application/octet-stream'
  });
  await expect(page.getByRole('heading',{name:'attendance.ods'})).toBeVisible({timeout:30000});
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export HTML'}).click();
  const html=await readFile(await (await download).path(),'utf8');
  expect(html).toContain('<th scope="col">Student</th>');
  expect((html.match(/<td>Class A<\/td>/g)||[]).length).toBe(3);
  expect((html.match(/<td>Yes<\/td>/g)||[]).length).toBe(3);
});
test('OpenDocument repeated content beyond 200 rows fails visibly rather than dropping content',async({page})=>{
  const zip=new JSZip();
  zip.file('content.xml','<?xml version="1.0"?>'+
    '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '+
    'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '+
    'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0">'+
    '<office:body><office:spreadsheet><table:table table:name="Oversized">'+
    '<table:table-row table:number-rows-repeated="201">'+
    '<table:table-cell><text:p>Data</text:p></table:table-cell>'+
    '<table:table-cell><text:p>Retained</text:p></table:table-cell>'+
    '</table:table-row></table:table></office:spreadsheet></office:body></office:document-content>');
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({
    name:'oversized.ods',
    buffer:await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),
    mimeType:'application/octet-stream'
  });
  await expect(page.getByRole('alert')).toContainText(/200 content rows/i);
  await expect(page.getByRole('heading',{name:'oversized.ods'})).toHaveCount(0);
});
test('HTML visible text excludes embedded script, style and intentionally hidden fragments',async({page})=>{
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({
    name:'hidden-content.html',
    mimeType:'text/html',
    buffer:Buffer.from('<html><body><main><h2>Lecture notes</h2>'+
      '<p>Visible <b>important</b> text<script>INJECTED_SCRIPT</script><span hidden>HIDDEN_PAYLOAD</span>'+
      '<span aria-hidden="true">ARIA_HIDDEN</span><span style="display: none">CSS_HIDDEN</span>'+
      '<style>.x{display:none} HIDDEN_CSS</style></p></main></body></html>')
  });
  await expect(page.getByRole('heading',{name:'hidden-content.html'})).toBeVisible();
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export HTML'}).click();
  const html=await readFile(await (await pending).path(),'utf8');
  expect(html).toContain('Visible important text');
  for(const hidden of ['INJECTED_SCRIPT','HIDDEN_PAYLOAD','ARIA_HIDDEN','CSS_HIDDEN','HIDDEN_CSS'])
    expect(html).not.toContain(hidden);
});
test('merged HTML tables reject invalid accessible header relationships',async({page})=>{
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({
    name:'merged-table.html',
    mimeType:'text/html',
    buffer:Buffer.from('<main><table><tr><th colspan="2">Result</th></tr>'+
      '<tr><td>Class</td><td>Score</td></tr></table></main>')
  });
  await expect(page.getByRole('alert')).toContainText(/Merged HTML table cells/i);
  await expect(page.getByRole('heading',{name:'merged-table.html'})).toHaveCount(0);
});
