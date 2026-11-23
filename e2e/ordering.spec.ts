import {test,expect} from '@playwright/test';
import JSZip from 'jszip';
import {readFile} from 'node:fs/promises';

const relNs='http://schemas.openxmlformats.org/package/2006/relationships';
const officeRelNs='http://schemas.openxmlformats.org/officeDocument/2006/relationships';

async function importedHtml(page:import('@playwright/test').Page,name:string,data:Buffer):Promise<string>{
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({name,buffer:data,mimeType:'application/octet-stream'});
  await expect(page.getByRole('heading',{name})).toBeVisible({timeout:30000});
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export HTML'}).click();
  return readFile(await (await pending).path(),'utf8');
}
function slide(text:string):string{
  return '<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>'+text+'</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>';
}
function worksheet(value:string):string{
  return '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+
    '<row r="1"><c r="A1" t="inlineStr"><is><t>Topic</t></is></c><c r="B1" t="inlineStr"><is><t>Result</t></is></c></row>'+
    '<row r="2"><c r="A2" t="inlineStr"><is><t>'+value+'</t></is></c><c r="B2" t="inlineStr"><is><t>Verified</t></is></c></row>'+
    '</sheetData></worksheet>';
}
test('PPTX reading order follows presentation slide IDs rather than slide filenames',async({page})=>{
  const zip=new JSZip();
  zip.file('ppt/presentation.xml','<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="'+officeRelNs+'"><p:sldIdLst><p:sldId id="256" r:id="rId9"/><p:sldId id="257" r:id="rId3"/></p:sldIdLst></p:presentation>');
  zip.file('ppt/_rels/presentation.xml.rels','<Relationships xmlns="'+relNs+'"><Relationship Id="rId3" Target="slides/slide1.xml"/><Relationship Id="rId9" Target="slides/slide2.xml"/></Relationships>');
  zip.file('ppt/slides/slide1.xml',slide('Introduction slide'));
  zip.file('ppt/slides/slide2.xml',slide('Final summary first'));
  const html=await importedHtml(page,'reordered.pptx',await zip.generateAsync({type:'nodebuffer'}));
  expect(html.indexOf('Final summary first')).toBeLessThan(html.indexOf('Introduction slide'));
  expect(html).toContain('Page 2');
});
test('XLSX worksheet names and text follow workbook relationships',async({page})=>{
  const zip=new JSZip();
  zip.file('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="'+officeRelNs+'"><sheets><sheet name="Summary" sheetId="2" r:id="rId9"/><sheet name="Introduction" sheetId="1" r:id="rId3"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels','<Relationships xmlns="'+relNs+'"><Relationship Id="rId3" Target="worksheets/sheet1.xml"/><Relationship Id="rId9" Target="worksheets/sheet2.xml"/></Relationships>');
  zip.file('xl/worksheets/sheet1.xml',worksheet('Chapter one'));
  zip.file('xl/worksheets/sheet2.xml',worksheet('End of course'));
  const data=await zip.generateAsync({type:'nodebuffer'});
  const html=await importedHtml(page,'reordered.xlsx',data);
  expect(html.indexOf('End of course')).toBeLessThan(html.indexOf('Chapter one'));
  // No silent association of a worksheet's rows with the wrong sheet.
  await expect(page.getByRole('region',{name:/Imported source content/})).toContainText('Summary');
  await page.getByRole('button',{name:/Introduction/i}).click();
  await expect(page.getByRole('region',{name:/Imported source content/})).toContainText('Introduction');
});
test('EPUB reading chapters follow OPF spine rather than alphabetical archive paths',async({page})=>{
  const zip=new JSZip();
  zip.file('META-INF/container.xml','<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OPS/package.opf','<package xmlns="http://www.idpf.org/2007/opf"><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="z" href="z.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="z"/><itemref idref="a"/></spine></package>');
  zip.file('OPS/a.xhtml','<html><body><main><p>Original chapter comes second</p></main></body></html>');
  zip.file('OPS/z.xhtml','<html><body><main><p>Original chapter comes first</p></main></body></html>');
  const html=await importedHtml(page,'reordered.epub',await zip.generateAsync({type:'nodebuffer'}));
  expect(html.indexOf('Original chapter comes first')).toBeLessThan(html.indexOf('Original chapter comes second'));
});
test('broken PPTX relationship reports error instead of reading the wrong slides',async({page})=>{
  const zip=new JSZip();
  zip.file('ppt/presentation.xml','<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="'+officeRelNs+'"><p:sldIdLst><p:sldId id="256" r:id="rId42"/></p:sldIdLst></p:presentation>');
  zip.file('ppt/_rels/presentation.xml.rels','<Relationships xmlns="'+relNs+'"><Relationship Id="rId4" Target="slides/slide1.xml"/></Relationships>');
  zip.file('ppt/slides/slide1.xml',slide('Must not return silently'));
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({
    name:'broken-order.pptx',buffer:await zip.generateAsync({type:'nodebuffer'}),mimeType:'application/octet-stream'
  });
  await expect(page.getByRole('alert')).toContainText(/missing or invalid slide relationship/i);
  await expect(page.getByRole('heading',{name:'broken-order.pptx'})).toHaveCount(0);
});
