import JSZip from 'jszip';
import type {EditableBlock,DocumentFormat} from '../types';
import {chunkDelimitedRows,chunkTabularRows} from './tableChunks';

export type SourceBlock=Pick<EditableBlock,'kind'|'text'|'headingLevel'|'description'>;
export interface ImportedSection {label:string;blocks:SourceBlock[];imageCount:number;notes?:string[]}

const MAX_ENTRIES=2500,MAX_XML_BYTES=12_000_000,MAX_UNPACKED=64_000_000,MAX_SECTIONS=80;
const WORD_NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const DRAWING_NS='http://schemas.openxmlformats.org/drawingml/2006/main';

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
    if(e.localName==='t' && e.namespaceURI===WORD_NS){output+=e.textContent||'';return;}
    if(e.localName==='tab' && e.namespaceURI===WORD_NS){output+='\t';return;}
    if(e.localName==='br' && e.namespaceURI===WORD_NS){output+='\n';return;}
    for(const child of Array.from(e.childNodes))walk(child);
  };
  walk(node);
  return output.trim();
}
function wordImageDescriptions(node:Element):string[]{
  return descendants(node,'docPr').map(element=>
    element.getAttribute('descr')||element.getAttribute('title')||'').map(s=>s.trim()).filter(Boolean);
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
/** Resolve an Open Packaging Convention relative target without allowing archive traversal. */
export function archiveTarget(sourcePart:string,target:string):string {
  if(!target || /[\?#\\]/.test(target) || /^[a-z][a-z0-9+.-]*:/i.test(target))
    throw new Error('Unsupported external or unsafe document relationship target.');
  let decoded:string;
  try{decoded=decodeURIComponent(target);}
  catch{throw new Error('Malformed document relationship target.');}
  if(/[\?#\\]/.test(decoded)||/^[a-z][a-z0-9+.-]*:/i.test(decoded))
    throw new Error('Unsafe document relationship target.');
  const parts=(decoded.startsWith('/')?decoded.slice(1):sourcePart.slice(0,sourcePart.lastIndexOf('/')+1)+decoded).split('/');
  const normalized:string[]=[];
  for(const segment of parts){
    if(!segment||segment==='.')continue;
    if(segment==='..'){
      if(!normalized.length)throw new Error('Document relationship escapes the archive root.');
      normalized.pop();continue;
    }
    if(segment.includes('\0'))throw new Error('Unsafe document relationship path.');
    normalized.push(segment);
  }
  if(!normalized.length)throw new Error('Empty document relationship target.');
  return normalized.join('/');
}
function relationships(zip:JSZip,part:string,xml:string):Map<string,string> {
  const location=part.slice(0,part.lastIndexOf('/')+1)+'_rels/'+part.slice(part.lastIndexOf('/')+1)+'.rels';
  const rels=zip.file(location);
  if(!rels)return new Map();
  // Value is loaded by caller so all XML errors use the same safe XML parser.
  const xmlDocument=parseXml(xml);
  const map=new Map<string,string>();
  for(const rel of descendants(xmlDocument,'Relationship')){
    const id=attr(rel,'Id');
    if(!id || map.has(id))throw new Error('Invalid or duplicated document relationship ID.');
    if(attr(rel,'TargetMode').toLowerCase()==='external')continue;
    const target=attr(rel,'Target');
    map.set(id,archiveTarget(part,target));
  }
  return map;
}
async function readRelationships(zip:JSZip,part:string):Promise<Map<string,string>|null>{
  const location=part.slice(0,part.lastIndexOf('/')+1)+'_rels/'+part.slice(part.lastIndexOf('/')+1)+'.rels';
  if(!zip.file(location))return null;
  return relationships(zip,part,await readZip(zip,location));
}

function parseWord(doc:Document):ImportedSection[]{
  const body=first(doc,'body');
  if(!body)throw new Error('The Word document has no body.');
  const blocks:SourceBlock[]=[];
  let imageCount=0;
  const handle=(node:Element)=>{
    if(node.localName==='p'){
      imageCount+=descendants(node,'drawing').length+descendants(node,'pict').length;
      const value=wordText(node);
      if(value){
        const pPr=elementChildren(node,'pPr')[0];
        const style=attr(pPr?first(pPr,'pStyle'):null,'val');
        const level=Number(style.match(/Heading(\d+)/i)?.[1]||0);
        const list=Boolean(pPr&&(first(pPr,'numPr')||/^List/i.test(style)));
        const kind:SourceBlock['kind']=list?'list':level||/^Title$/i.test(style)?'heading':'paragraph';
        push(blocks,paragraph(value,kind,kind==='heading'?{headingLevel:(Math.min(4,Math.max(2,level||2)) as 2|3|4)}:{}));
      }
      for(const description of wordImageDescriptions(node))
        push(blocks,paragraph('Source image alternative text (verify): '+description));
    }else if(node.localName==='tbl'){
      const cells=directCells(node,'tr','tc');
      const merged=cells.some(row=>row.some(cell=>{
        const properties=elementChildren(cell,'tcPr')[0];
        return properties && (first(properties,'gridSpan')||first(properties,'vMerge')||first(properties,'hMerge'));
      }));
      if(merged||descendants(node,'tbl').length)
        throw new Error('Merged or nested Word tables cannot yet be mapped to a safe accessible table. Simplify the table in Word before importing.');
      const rows=cells.map(row=>row.map(cell=>
        descendants(cell,'p').map(p=>wordText(p)).filter(Boolean).join(' ')));
      const width=rows[0]?.length||0;
      if(width>=2 && width<=16 && rows.length>=2 && rows.length<=200 && rows.every(r=>r.length===width))
        push(blocks,paragraph(rows.map(row=>row.join('\t')).join('\n'),'table',{description:'Imported table from Word'}));
      else for(const row of rows)push(blocks,paragraph(row.join(' | ')));
      imageCount+=descendants(node,'drawing').length;
      for(const description of wordImageDescriptions(node))
        push(blocks,paragraph('Source image alternative text (verify): '+description));
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
      const paragraphs=descendants(child,'p').filter(p=>p.namespaceURI===DRAWING_NS);
      for(const p of paragraphs){
        const value=descendants(p,'t').filter(n=>n.namespaceURI===DRAWING_NS).map(textOf).join(' ').trim();
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
      for(const p of descendants(child,'p').filter(n=>n.namespaceURI===DRAWING_NS)){
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
  let slides=filesIn(zip,/^ppt\/slides\/slide\d+\.xml$/);
  if(!slides.length)throw new Error('No presentation slides were found.');
  const present=await readZip(zip,'ppt/presentation.xml',false);
  if(present){
    const doc=parseXml(present);
    const ids=descendants(doc,'sldId');
    if(ids.length){
      const rels=await readRelationships(zip,'ppt/presentation.xml');
      if(!rels)throw new Error('PowerPoint slide order relationships are missing.');
      slides=ids.map(slide=>{
        const id=slide.getAttribute('r:id')||slide.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||'';
        const target=rels.get(id);
        if(!target || !/^ppt\/slides\/[^/]+\.xml$/.test(target) || !zip.file(target))
          throw new Error('PowerPoint slide order contains a missing or invalid slide relationship.');
        return target;
      });
      if(new Set(slides).size!==slides.length)throw new Error('PowerPoint contains duplicate slide relationships.');
    }
  }
  if(slides.length>MAX_SECTIONS)throw new Error('Presentation exceeds 80 supported slides.');
  const sections:ImportedSection[]=[];
  for(let i=0;i<slides.length;i++){
    sections.push(pptShapes(parseXml(await readZip(zip,slides[i])),'Slide '+(i+1)));
  }
  return ensureSections(sections);
}
function excelValue(cell:Element,shared:string[]):string{
  const type=attr(cell,'t');
  const raw=textOf(first(cell,'v')||cell);
  const formula=first(cell,'f');
  if(formula){
    const expression=(formula.textContent||'').trim();
    if(!expression)throw new Error('A worksheet contains a shared or incomplete formula whose expression cannot be reconstructed. Open it in a spreadsheet editor and save with explicit formulas.');
    if(expression.length>2000)throw new Error('Worksheet formula exceeds the supported 2,000-character limit.');
    return '='+expression+(raw?' [cached result: '+raw+']':' [result not recalculated]');
  }
  if(type==='s'){
    const index=Number(raw);
    if(!Number.isSafeInteger(index)||index<0||index>=shared.length)
      throw new Error('A worksheet references a missing or invalid shared string.');
    return shared[index];
  }
  if(type==='inlineStr')return descendants(cell,'t').map(textOf).join(' ');
  if(type==='b')return raw==='1'?'TRUE':'FALSE';
  return raw;
}
async function parseSpreadsheet(zip:JSZip):Promise<ImportedSection[]>{
  const strings=await readZip(zip,'xl/sharedStrings.xml',false);
  const shared=strings?descendants(parseXml(strings),'si').map(si=>descendants(si,'t').map(textOf).join('')):[];
  let sheets=filesIn(zip,/^xl\/worksheets\/sheet\d+\.xml$/);
  if(!sheets.length)throw new Error('No Excel worksheets were found.');
  const workbook=await readZip(zip,'xl/workbook.xml',false);
  const sheetNodes=workbook?descendants(parseXml(workbook),'sheet'):[];
  const names=sheetNodes.map(s=>attr(s,'name'));
  if(sheetNodes.some(s=>s.getAttribute('r:id')||s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'))){
    const rels=await readRelationships(zip,'xl/workbook.xml');
    if(!rels)throw new Error('Excel worksheet order relationships are missing.');
    sheets=sheetNodes.map(s=>{
      const id=s.getAttribute('r:id')||s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||'';
      const target=rels.get(id);
      if(!target || !/^xl\/worksheets\/[^/]+\.xml$/.test(target) || !zip.file(target))
        throw new Error('Workbook contains a missing or invalid worksheet relationship.');
      return target;
    });
    if(new Set(sheets).size!==sheets.length)throw new Error('Workbook repeats a worksheet relationship.');
  }
  if(sheets.length>MAX_SECTIONS)throw new Error('Workbook exceeds 80 supported sheets.');
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
      for(const chunk of (width>=2&&data.length>=2?chunkTabularRows(columnRows):chunkDelimitedRows(columnRows))){
        const windowRows=columnRows.slice(chunk.start,chunk.end);
        const blocks:SourceBlock[]=[];
        if(width>=2&&data.length>=2){
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
      const rows:string[][]=[];
      for(const row of sourceRows){
        const result:string[]=[];
        for(const cell of elementChildren(row).filter(e=>e.localName==='table-cell'||e.localName==='covered-table-cell')){
          const times=Number(attr(cell,'number-columns-repeated')||1);
          if(!Number.isInteger(times)||times<1||times>16||result.length+times>16)
            throw new Error('OpenDocument row exceeds 16 supported columns. Split wide source tables rather than omitting cells.');
          const colspan=Number(attr(cell,'number-columns-spanned')||1);
          const rowspan=Number(attr(cell,'number-rows-spanned')||1);
          if(colspan!==1||rowspan!==1||cell.localName==='covered-table-cell')
            throw new Error('Merged OpenDocument table cells require source editing before accurate accessible export.');
          const content=descendants(cell,'p').map(textOf).filter(Boolean).join(' ');
          for(let i=0;i<times;i++)result.push(content);
        }
        const repeated=Number(attr(row,'number-rows-repeated')||1);
        if(!Number.isSafeInteger(repeated)||repeated<1)
          throw new Error('Invalid repeated OpenDocument row count.');
        // ODF authors frequently compress millions of entirely empty formatting rows.
        // Skip truly blank rows; only material content is represented in reading copies.
        if(!result.some(value=>value.trim()))continue;
        if(repeated>200||rows.length+repeated>200)
          throw new Error('OpenDocument table exceeds 200 content rows after expanding repeated rows.');
        for(let i=0;i<repeated;i++)rows.push([...result]);
      }
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
  const ignored=new Set(['script','style','noscript','iframe','svg','nav','head','template']);
  const visibleText=(node:Node):string=>{
    const visit=(current:Node):string=>{
      if(current.nodeType===3)return current.textContent||'';
      if(current.nodeType!==1)return '';
      const element=current as Element,tag=element.localName.toLowerCase();
      if(ignored.has(tag)||element.hasAttribute('hidden')||element.getAttribute('aria-hidden')==='true'||
        /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(element.getAttribute('style')||''))return '';
      return Array.from(element.childNodes).map(visit).join('');
    };
    return visit(node).replace(/\s+/g,' ').trim();
  };
  const process=(node:Element)=>{
    const name=node.localName.toLowerCase();
    if(ignored.has(name)||node.hasAttribute('hidden')||node.getAttribute('aria-hidden')==='true')return;
    if(/^h[1-6]$/.test(name)){
      push(blocks,paragraph(visibleText(node),'heading',{headingLevel:Math.min(4,Math.max(2,Number(name[1]))) as 2|3|4}));return;
    }
    if(name==='p'||name==='blockquote'){push(blocks,paragraph(visibleText(node),name==='blockquote'?'blockquote':'paragraph'));return;}
    if(name==='li'){push(blocks,paragraph(visibleText(node),'list'));return;}
    if(name==='table'){
      if(descendants(node,'td').concat(descendants(node,'th')).some(cell=>Number(cell.getAttribute('colspan')||1)!==1||Number(cell.getAttribute('rowspan')||1)!==1))
        throw new Error('Merged HTML table cells require source editing before accurate accessible export.');
      const sourceRows=descendants(node,'tr');
      if(sourceRows.length>200)throw new Error('HTML table exceeds 200 supported rows. Split the table instead of omitting rows.');
      const rows=sourceRows.map(row=>
        elementChildren(row).filter(e=>e.localName==='td'||e.localName==='th').map(visibleText));
      if(rows.some(r=>r.length>16))throw new Error('HTML table exceeds 16 supported columns. Split the table instead of omitting cells.');
      if(rows.length>=2&&rows[0].length>=2&&rows.every(r=>r.length===rows[0].length))
        push(blocks,paragraph(rows.map(row=>row.join('\t')).join('\n'),'table',{
          description:visibleText(first(node,'caption')||node).slice(0,150)}));
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
  let chapters=Object.keys(zip.files).filter(p=>/\.(xhtml|html|htm)$/i.test(p)&&
    !/(nav|toc|cover)\.(xhtml|html|htm)$/i.test(p)).sort();
  const container=await readZip(zip,'META-INF/container.xml',false);
  if(container){
    const root=first(parseXml(container),'rootfile');
    const rawPath=attr(root,'full-path');
    const opfPath=rawPath?archiveTarget('','/'+rawPath):'';
    if(!opfPath || !zip.file(opfPath))throw new Error('EPUB package document is missing.');
    const packageDoc=parseXml(await readZip(zip,opfPath));
    const manifest=first(packageDoc,'manifest'),spine=first(packageDoc,'spine');
    if(!manifest||!spine)throw new Error('EPUB manifest or reading spine is missing.');
    const entries=new Map<string,string>();
    for(const item of elementChildren(manifest,'item')){
      const id=attr(item,'id'),href=attr(item,'href');
      const media=attr(item,'media-type');
      if(!id||!href)throw new Error('EPUB manifest includes an incomplete content item.');
      if(media==='application/xhtml+xml'||media==='text/html'){
        const target=archiveTarget(opfPath,href);
        if(!zip.file(target))throw new Error('EPUB spine chapter is missing: '+href);
        entries.set(id,target);
      }
    }
    chapters=elementChildren(spine,'itemref').map(item=>{
      const id=attr(item,'idref');
      if(!id||!entries.has(id))throw new Error('EPUB spine references an unavailable readable chapter.');
      return entries.get(id)!;
    });
    if(new Set(chapters).size!==chapters.length)throw new Error('EPUB spine repeats a chapter unexpectedly.');
  }
  if(!chapters.length)throw new Error('No readable EPUB chapters found. This may be a DRM-protected book.');
  if(chapters.length>MAX_SECTIONS)throw new Error('EPUB exceeds 80 supported spine chapters.');
  const results:ImportedSection[]=[];
  for(let i=0;i<chapters.length;i++){
    const html=await readZip(zip,chapters[i]);
    const blocks=parseHtmlContent(html);
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
