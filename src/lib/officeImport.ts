import JSZip from 'jszip';
import type {EditableBlock,DocumentFormat} from '../types';
import {chunkDelimitedRows} from './tableChunks';

export type SourceBlock=Pick<EditableBlock,'kind'|'text'|'headingLevel'|'description'>;
export interface ImportedSection {label:string;blocks:SourceBlock[];imageCount:number;notes?:string[]}

const MAX_ENTRIES=2500,MAX_XML_BYTES=12_000_000,MAX_UNPACKED=64_000_000,MAX_SECTIONS=80;
const paragraph=(text:string,kind:SourceBlock['kind']='paragraph',extra:Partial<SourceBlock>={}):SourceBlock=>{
  const content=text.trim();
  if(content.length>12_000)throw new Error('A document content block exceeds 12,000 characters. Split the source instead of silently losing content.');
  return {kind,text:content,...extra};
};
const elementChildren=(node:Node,name?:string):Element[]=>
  Array.from(node.childNodes).filter((n):n is Element=>n.nodeType===1 && (!name||(n as Element).localName===name));
const descendants=(node:Element|Document,name:string):Element[]=>
  Array.from(node.getElementsByTagName('*')).filter(n=>n.localName===name);
const first=(node:Element|Document,name:string):Element|null=>descendants(node,name)[0]||null;
const attr=(node:Element|null,name:string):string=>node?.getAttribute(name)||node?.getAttribute('w:'+name)||
  node?.getAttribute('r:'+name)||node?.getAttribute('text:'+name)||node?.getAttribute('table:'+name)||'';
const textOf=(node:Node):string=>(node.textContent||'').replace(/\s+/g,' ').trim();
function parseXml(xml:string):Document {
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Embedded XML document types and entities are not allowed.');
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw new Error('The document contains malformed XML.');
  return doc;
}
function directCells(node:Element,row:string,cell:string):Element[][] {
  return descendants(node,row).map(r=>elementChildren(r,cell));
}
function wordText(node:Element):string {
  let output='';
  const walk=(n:Node)=>{
    if(n.nodeType!==1)return;
    const e=n as Element;
    if(e.localName==='t' && e.prefix==='w'){output+=e.textContent||'';return;}
    if(e.localName==='tab' && e.prefix==='w'){output+='\t';return;}
    if(e.localName==='br' && e.prefix==='w'){output+='\n';return;}
    for(const child of Array.from(e.childNodes))walk(child);
  };
  walk(node);
  return output.trim();
}
function push(b:SourceBlock[],block:SourceBlock){
  if(!block.text)return;
  if(b.length>=16000)throw new Error('Document exceeds 16,000 content elements. Split the source instead of silently losing content.');
  b.push(block);
}
function ensureSections(sections:ImportedSection[]):ImportedSection[] {
  if(!sections.length)throw new Error('No readable document sections were found.');
  if(sections.length>MAX_SECTIONS)throw new Error('This document has more than 80 sections or slides. Split the source document before importing.');
  return sections;
}
function partition(label:string,all:SourceBlock[],imageCount=0):ImportedSection[] {
  if(!all.length)return [{label,blocks:[],imageCount}];
  if(all.length>16000)throw new Error('The source contains too many text elements to inspect completely.');
  const result:ImportedSection[]=[];
  for(let n=0;n<all.length;n+=240){
    result.push({label:all.length>240?label+' · part '+(result.length+1):label,
      blocks:all.slice(n,n+240),imageCount:n===0?imageCount:0});
  }
  return result;
}
async function loadOfficeZip(file:File):Promise<JSZip> {
  const bytes=new Uint8Array(await file.slice(0,4).arrayBuffer());
  if(bytes[0]!==0x50||bytes[1]!==0x4b)throw new Error('The office document is not a valid ZIP-based file.');
  let zip:JSZip;
  try{zip=await JSZip.loadAsync(await file.arrayBuffer(),{checkCRC32:false});}
  catch{throw new Error('The document archive could not be opened. It may be damaged or encrypted.');}
  const entries=Object.values(zip.files);
  if(entries.length>MAX_ENTRIES)throw new Error('This file has too many embedded archive entries.');
  let unpacked=0;
  for(const entry of entries){
    const meta=(entry as unknown as {_data?:{uncompressedSize?:number}})._data;
    const length=meta?.uncompressedSize;
    if(!entry.dir && (!Number.isFinite(length)||length===undefined||length>MAX_XML_BYTES))
      throw new Error('The document contains an oversized or unsupported archive member.');
    unpacked+=(length||0);
  }
  if(unpacked>MAX_UNPACKED)throw new Error('Uncompressed document content exceeds the 64 MB safety limit.');
  return zip;
}
async function readZip(zip:JSZip,path:string,required=true):Promise<string> {
  if(path.startsWith('/')||path.split('/').includes('..'))throw new Error('Unsafe document archive path.');
  const entry=zip.file(path);
  if(!entry){
    if(required)throw new Error('Missing required document component: '+path);
    return '';
  }
  const value=await entry.async('string');
  if(value.length>MAX_XML_BYTES)throw new Error('Document XML content exceeds the safety limit.');
  return value;
}
const filesIn=(zip:JSZip,regex:RegExp)=>Object.keys(zip.files).filter(p=>regex.test(p)).sort((a,b)=>{
  const num=(v:string)=>Number(v.match(/(\d+)(?:\.\w+)$/)?.[1]||0);
  return num(a)-num(b)||a.localeCompare(b);
});
function parseWord(doc:Document):ImportedSection[]{
  const body=first(doc,'body');
  if(!body)throw new Error('The Word document has no body.');
  const blocks:SourceBlock[]=[];
  let imageCount=0;
  const handle=(node:Element)=>{
    if(node.localName==='p'){
      imageCount+=descendants(node,'drawing').length+descendants(node,'pict').length;
      const value=wordText(node);
      if(!value)return;
      const pPr=elementChildren(node,'pPr')[0];
      const style=attr(pPr?first(pPr,'pStyle'):null,'val');
      const level=Number(style.match(/Heading(\d+)/i)?.[1]||0);
      const list=Boolean(pPr&&(first(pPr,'numPr')||/^List/i.test(style)));
      const kind:SourceBlock['kind']=list?'list':level||/^Title$/i.test(style)?'heading':'paragraph';
      push(blocks,paragraph(value,kind,kind==='heading'?{headingLevel:(Math.min(4,Math.max(2,level||2)) as 2|3|4)}:{}));
    }else if(node.localName==='tbl'){
      const rows=directCells(node,'tr','tc').map(row=>row.map(cell=>
        descendants(cell,'p').map(p=>wordText(p)).filter(Boolean).join(' ')));
      const width=rows[0]?.length||0;
      if(width>=2 && width<=16 && rows.length>=2 && rows.length<=200 && rows.every(r=>r.length===width))
        push(blocks,paragraph(rows.map(row=>row.join('\t')).join('\n'),'table',{description:'Imported table from Word'}));
      else for(const row of rows)push(blocks,paragraph(row.join(' | ')));
      imageCount+=descendants(node,'drawing').length;
    }else if(node.localName==='sdt'){
      const content=first(node,'sdtContent');
      if(content)for(const child of elementChildren(content))handle(child);
    }
  };
  for(const child of elementChildren(body))handle(child);
  return ensureSections(partition('Word document',blocks,imageCount));
}
function pptShapes(doc:Document,label:string):ImportedSection{
  const blocks:SourceBlock[]=[];
  const tree=first(doc,'spTree');
  const container=tree||doc.documentElement;
  let imageCount=descendants(container,'pic').length;
  for(const child of elementChildren(container)){
    if(child.localName==='sp'){
      const placeholder=first(child,'ph');
      const role=attr(placeholder,'type');
      const paragraphs=descendants(child,'p').filter(p=>p.prefix==='a');
      for(const p of paragraphs){
        const value=descendants(p,'t').filter(n=>n.prefix==='a').map(textOf).join(' ').trim();
        if(!value)continue;
        const isTitle=/title/i.test(role);
        const list=Boolean(first(p,'buChar')||first(p,'buAutoNum'));
        push(blocks,paragraph(value,isTitle?'heading':list?'list':'paragraph',
          isTitle?{headingLevel:2}:{}));
      }
    }else if(child.localName==='graphicFrame'){
      const tables=descendants(child,'tbl');
      for(const table of tables){
        const rows=directCells(table,'tr','tc').map(row=>row.map(cell=>
          descendants(cell,'t').map(textOf).filter(Boolean).join(' ')));
        if(rows.length>=2&&rows.length<=200&&rows[0].length>=2&&rows[0].length<=16&&rows.every(r=>r.length===rows[0].length))
          push(blocks,paragraph(rows.map(row=>row.join('\t')).join('\n'),'table',{description:'Table on '+label}));
        else for(const row of rows)push(blocks,paragraph(row.join(' | ')));
      }
    }else if(child.localName==='grpSp'){
      for(const p of descendants(child,'p').filter(n=>n.prefix==='a')){
        const value=descendants(p,'t').map(textOf).join(' ');
        push(blocks,paragraph(value));
      }
    }else if(child.localName==='pic'){
      const desc=attr(first(child,'cNvPr'),'descr');
      if(desc)push(blocks,paragraph('Image description from source: '+desc));
    }
  }
  return {label,blocks,imageCount};
}
async function parsePresentation(zip:JSZip):Promise<ImportedSection[]> {
  const slides=filesIn(zip,/^ppt\/slides\/slide\d+\.xml$/);
  if(!slides.length)throw new Error('No presentation slides were found.');
  const sections:ImportedSection[]=[];
  for(let i=0;i<slides.length;i++){
    sections.push(pptShapes(parseXml(await readZip(zip,slides[i])),'Slide '+(i+1)));
  }
  return ensureSections(sections);
}
function excelValue(cell:Element,shared:string[]):string{
  const type=attr(cell,'t');
  const raw=textOf(first(cell,'v')||cell);
  if(type==='s')return shared[Number(raw)]||'';
  if(type==='inlineStr')return descendants(cell,'t').map(textOf).join(' ');
  if(type==='b')return raw==='1'?'TRUE':'FALSE';
  const formula=first(cell,'f');
  if(formula)return (raw||'='+(formula.textContent||''))+' [formula]';
  return raw;
}
async function parseSpreadsheet(zip:JSZip):Promise<ImportedSection[]>{
  const strings=await readZip(zip,'xl/sharedStrings.xml',false);
  const shared=strings?descendants(parseXml(strings),'si').map(si=>descendants(si,'t').map(textOf).join('')):[];
  const sheets=filesIn(zip,/^xl\/worksheets\/sheet\d+\.xml$/);
  if(!sheets.length)throw new Error('No Excel worksheets were found.');
  const workbook=await readZip(zip,'xl/workbook.xml',false);
  const names=workbook?descendants(parseXml(workbook),'sheet').map(s=>attr(s,'name')):[];
  const result:ImportedSection[]=[];
  for(let i=0;i<sheets.length;i++){
    const doc=parseXml(await readZip(zip,sheets[i]));
    const rows=descendants(doc,'row');
    const data:string[][]=[];
    let maxCol=0;
    for(const row of rows){
      const values:string[]=[];
      for(const cell of elementChildren(row,'c')){
        const ref=attr(cell,'r'),letters=ref.match(/^[A-Z]+/i)?.[0]||'';
        let index=0;for(const letter of letters.toUpperCase())index=index*26+(letter.charCodeAt(0)-64);
        const col=Math.max(0,index-1);
        if(col>=128)throw new Error('Worksheet exceeds 128 supported columns. Split wide worksheets instead of silently omitting cells.');
        values[col]=excelValue(cell,shared);
        maxCol=Math.max(maxCol,col+1);
      }
      if(values.length)data.push(values);
      if(data.length>16000)throw new Error('Worksheet exceeds supported row count; split the workbook.');
    }
    const sheetName=names[i]||'Sheet '+(i+1);
    if(!data.length){result.push({label:sheetName,blocks:[],imageCount:0});continue;}
    for(let start=0;start<Math.max(1,maxCol);start+=16){
      const width=Math.min(16,maxCol-start);
      const columnRows=data.map(row=>Array.from({length:width},(_,k)=>row[start+k]||''));
      for(const chunk of chunkDelimitedRows(columnRows)){
        const windowRows=columnRows.slice(chunk.start,chunk.end);
        const blocks:SourceBlock[]=[];
        if(width>=2&&windowRows.length>=2){
          push(blocks,paragraph(chunk.text,'table',{
            description:sheetName+' · rows '+(chunk.start+1)+'–'+chunk.end}));
        }else for(const row of windowRows)push(blocks,paragraph(row.join(' ')));
        result.push({label:sheetName+(chunk.start||start?' · range '+(chunk.start+1)+' / col '+(start+1):''),blocks,imageCount:0});
      }
    }
  }
  return ensureSections(result);
}
function odfBlocks(container:Element,label:string):ImportedSection{
  const blocks:SourceBlock[]=[];
  let imageCount=descendants(container,'image').length;
  const handle=(element:Element,listed=false)=>{
    const name=element.localName;
    if(name==='h'){
      const text=textOf(element);
      push(blocks,paragraph(text,'heading',{headingLevel:2}));
    }else if(name==='p'){
      const text=textOf(element);
      push(blocks,paragraph(text,listed?'list':'paragraph'));
    }else if(name==='list'){
      for(const listItem of elementChildren(element,'list-item'))
        for(const child of elementChildren(listItem))handle(child,true);
    }else if(name==='table'){
      const sourceRows=elementChildren(element,'table-row');
      if(sourceRows.length>200)throw new Error('OpenDocument table exceeds 200 supported rows. Split the table instead of omitting rows.');
      const rows=sourceRows.map(row=>{
        const result:string[]=[];
        for(const cell of elementChildren(row).filter(e=>e.localName==='table-cell'||e.localName==='covered-table-cell')){
          const times=Math.min(16,Number(attr(cell,'number-columns-repeated')||1)||1);
          const text=descendants(cell,'p').map(textOf).filter(Boolean).join(' ');
          for(let i=0;i<times&&result.length<16;i++)result.push(text);
        }
        return result;
      });
      if(rows.length>=2&&rows[0].length>=2&&rows.every(r=>r.length===rows[0].length))
        push(blocks,paragraph(rows.map(row=>row.join('\t')).join('\n'),'table',{description:'Table in '+label}));
      else for(const row of rows)push(blocks,paragraph(row.join(' | ')));
    }else for(const child of elementChildren(element))handle(child,listed);
  };
  if(container.localName==='table' && container.prefix==='table')handle(container);
  else for(const child of elementChildren(container))handle(child);
  return {label,blocks,imageCount};
}
async function parseOdf(zip:JSZip,format:DocumentFormat):Promise<ImportedSection[]>{
  const xml=await readZip(zip,'content.xml');
  const doc=parseXml(xml);
  const body=first(doc,'body');
  if(!body)throw new Error('OpenDocument body is missing.');
  if(format==='odt'){
    const text=first(body,'text');if(!text)throw new Error('No OpenDocument text body found.');
    const block=odfBlocks(text,'OpenDocument text');
    return ensureSections(partition(block.label,block.blocks,block.imageCount));
  }
  if(format==='odp'){
    const slides=descendants(body,'page').filter(p=>p.prefix==='draw');
    return ensureSections(slides.map((slide,i)=>odfBlocks(slide,'Slide '+(i+1))));
  }
  const sheetNodes=descendants(body,'table').filter(n=>n.prefix==='table');
  return ensureSections(sheetNodes.map((sheet,i)=>odfBlocks(sheet,attr(sheet,'name')||'Sheet '+(i+1))));
}
function htmlBlocks(body:Element):SourceBlock[]{
  const blocks:SourceBlock[]=[];
  const process=(node:Element)=>{
    const name=node.localName.toLowerCase();
    if(['script','style','noscript','iframe','svg','nav','head','template'].includes(name))return;
    if(/^h[1-6]$/.test(name)){
      push(blocks,paragraph(textOf(node),'heading',{headingLevel:Math.min(4,Math.max(2,Number(name[1]))) as 2|3|4}));return;
    }
    if(name==='p'||name==='blockquote'){push(blocks,paragraph(textOf(node),name==='blockquote'?'blockquote':'paragraph'));return;}
    if(name==='li'){push(blocks,paragraph(textOf(node),'list'));return;}
    if(name==='table'){
      const sourceRows=descendants(node,'tr');
      if(sourceRows.length>200)throw new Error('HTML table exceeds 200 supported rows. Split the table instead of omitting rows.');
      const rows=sourceRows.map(row=>
        elementChildren(row).filter(e=>e.localName==='td'||e.localName==='th').map(textOf));
      if(rows.some(r=>r.length>16))throw new Error('HTML table exceeds 16 supported columns. Split the table instead of omitting cells.');
      if(rows.length>=2&&rows[0].length>=2&&rows.every(r=>r.length===rows[0].length))
        push(blocks,paragraph(rows.map(row=>row.join('\t')).join('\n'),'table',{
          description:textOf(first(node,'caption')||node).slice(0,150)}));
      else for(const row of rows)push(blocks,paragraph(row.join(' | ')));
      return;
    }
    for(const child of elementChildren(node))process(child);
  };
  process(body);
  return blocks;
}
export function parseHtmlContent(html:string):SourceBlock[]{
  const doc=new DOMParser().parseFromString(html,'text/html');
  const container=doc.querySelector('main')||doc.body;
  return htmlBlocks(container);
}
async function parseEpub(zip:JSZip):Promise<ImportedSection[]>{
  const chapters=Object.keys(zip.files).filter(p=>/\.(xhtml|html|htm)$/i.test(p)&&
    !/(nav|toc|cover)\.(xhtml|html|htm)$/i.test(p)).sort();
  if(!chapters.length)throw new Error('No readable EPUB chapters found. This may be a DRM-protected book.');
  const results:ImportedSection[]=[];
  for(let i=0;i<chapters.length;i++){
    const blocks=parseHtmlContent(await readZip(zip,chapters[i]));
    results.push(...partition('Chapter '+(i+1),blocks));
  }
  return ensureSections(results);
}
export async function importOfficeDocument(file:File,format:DocumentFormat):Promise<ImportedSection[]>{
  const zip=await loadOfficeZip(file);
  if(format==='docx')return parseWord(parseXml(await readZip(zip,'word/document.xml')));
  if(format==='pptx')return parsePresentation(zip);
  if(format==='xlsx')return parseSpreadsheet(zip);
  if(format==='odt'||format==='odp'||format==='ods')return parseOdf(zip,format);
  if(format==='epub')return parseEpub(zip);
  throw new Error('Unsupported office document format.');
}
