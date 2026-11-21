import type {DocumentFormat,EditableBlock,Finding,Inspection,OcrLanguage,PageInspection,PageOcr} from '../types';
import {PRODUCT} from '../config';
import {detectDocumentFormat,ZIP_FORMATS,IMAGE_FORMATS} from './formats';
import type {ImportedSection,SourceBlock} from './officeImport';

export interface DocumentImportOptions {
  automaticOcr?:boolean;
  ocrLanguage?:OcrLanguage;
  onStage?:(message:string)=>void;
}
const semantic=(kind:SourceBlock['kind'],text:string,extra:Partial<SourceBlock>={}):SourceBlock=>({
  kind,text:text.trim().slice(0,12000),...extra
});
function partition(blocks:SourceBlock[],label='Document'):ImportedSection[]{
  if(blocks.length>16000)throw new Error('Too many content elements to inspect completely.');
  const result:ImportedSection[]=[];
  for(let i=0;i<Math.max(1,blocks.length);i+=240){
    result.push({label:blocks.length>240?label+' · section '+(result.length+1):label,
      imageCount:0,blocks:blocks.slice(i,i+240)});
  }
  if(result.length>80)throw new Error('Document exceeds 80 logical sections. Split the source before importing.');
  return result;
}
/** RFC 4180 quoted CSV and TSV, preserving escaped double quotes and new lines. */
export function parseDelimited(input:string,delimiter:','|'\t'):string[][]{
  const rows:string[][]=[];
  let row:string[]=[],value='',quoted=false;
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(quoted){
      if(c==='"'&&input[i+1]==='"'){value+='"';i++;}
      else if(c==='"')quoted=false;
      else value+=c;
    }else if(c==='"'&&value==='')quoted=true;
    else if(c===delimiter){row.push(value);value='';}
    else if(c==='\n'){row.push(value.replace(/\r$/,''));rows.push(row);row=[];value='';}
    else value+=c;
  }
  if(quoted)throw new Error('The CSV file has an unclosed quoted field.');
  if(value.length||row.length){row.push(value.replace(/\r$/,''));rows.push(row);}
  return rows.filter(r=>r.some(v=>v.trim()));
}
function textSections(text:string,format:DocumentFormat):ImportedSection[]{
  const input=text.replace(/\u0000/g,'');
  if(input.length>2_000_000)throw new Error('Text content exceeds the 2 MB character limit.');
  const blocks:SourceBlock[]=[];
  if(format==='csv'||format==='tsv'){
    const rows=parseDelimited(input,format==='tsv'?'\t':',');
    if(rows.length>16000)throw new Error('Spreadsheet exceeds the supported row count.');
    const cols=Math.max(1,...rows.map(r=>r.length));
    const sections:ImportedSection[]=[];
    for(let col=0;col<cols;col+=16)for(let start=0;start<rows.length;start+=190){
      const slice=rows.slice(start,start+190).map(row=>
        Array.from({length:Math.min(16,cols-col)},(_,c)=>(row[col+c]||'').slice(0,750)));
      const content=slice.map(row=>row.join('\t')).join('\n');
      sections.push({label:'Data rows '+(start+1)+'–'+(start+slice.length),imageCount:0,
        blocks:[semantic(slice.length>=2&&slice[0].length>=2?'table':'paragraph',content,{
          description:'Imported '+format.toUpperCase()+' data'})]});
    }
    if(sections.length>80)throw new Error('Spreadsheet exceeds 80 sections. Split it for full inspection.');
    return sections.length?sections:partition([],format.toUpperCase()+' data');
  }
  let raw=input;
  if(format==='rtf')raw=raw
    .replace(/\\u(-?\d+)\??/g,(_,n)=>String.fromCharCode(Number(n)<0?Number(n)+65536:Number(n)))
    .replace(/\\'([0-9a-f]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)))
    .replace(/\\par[d]?\b/g,'\n').replace(/\\tab\b/g,'\t')
    .replace(/\\[a-zA-Z]+-?\d* ?/g,'').replace(/[{}]/g,'').replace(/\\\\/g,'\\');
  let codeFence=false;
  for(const line of raw.split(/\r?\n/)){
    const value=line.trim();
    if(!value)continue;
    if(format==='md'){
      if(value.startsWith(String.fromCharCode(96).repeat(3))){codeFence=!codeFence;continue;}
      if(!codeFence&&/^#{1,6}\s/.test(value)){
        const n=(value.match(/^#+/)||['##'])[0].length;
        blocks.push(semantic('heading',value.replace(/^#{1,6}\s+/,''),{
          headingLevel:Math.min(4,Math.max(2,n)) as 2|3|4}));
        continue;
      }
      if(!codeFence&&/^(?:[-*+]\s+|\d+[.)]\s+)/.test(value)){
        blocks.push(semantic('list',value.replace(/^(?:[-*+]\s+|\d+[.)]\s+)/,'')));
        continue;
      }
    }
    blocks.push(semantic('paragraph',value));
  }
  return partition(blocks);
}
function builtInspection(file:File,format:DocumentFormat,sections:ImportedSection[],ocr?:PageOcr):Inspection {
  if(!sections.length||sections.length>80)throw new Error('Source exceeds the 80-section inspection limit.');
  const findings:Finding[]=[];
  const pages:PageInspection[]=sections.map((section,index)=>{
    const number=index+1;
    const blocks:EditableBlock[]=section.blocks.map((block,i)=>({
      id:'source-'+number+'-'+i,page:number,kind:block.kind,text:block.text,
      headingLevel:block.headingLevel,description:block.description
    }));
    const text=blocks.map(b=>b.text).join('\n');
    const add=(kind:Finding['kind'],severity:Finding['severity'],category:Finding['category'],title:string,description:string,recommendation:string)=>{
      findings.push({id:'s'+number+'-i'+findings.length,page:number,kind,severity,category,title,description,recommendation});
    };
    if(!text.trim())add('verified','high','text','No readable source text',
      'No text was extracted from this source section.','Use OCR where available or add an accurate transcription.');
    if(section.imageCount>0)add('manual','review','visual','Check visuals and image descriptions',
      section.imageCount+' visual object(s) found, without a verified description.',
      'Add descriptions for meaningful figures and charts.');
    if(blocks.some(b=>b.kind==='table'))add('manual','review','structure','Review imported table structure',
      'Tables were reconstructed from source cells. Complex merged headers may need correction.',
      'Confirm headers and merged cells in the table editor.');
    return {number,label:section.label,width:800,height:1000,text,textItemCount:blocks.length,
      imagePaintCount:section.imageCount,hasStructureTree:null,ocr:number===1?ocr:undefined,blocks};
  });
  return {id:crypto.randomUUID(),name:file.name,size:file.size,createdAt:new Date().toISOString(),
    pageCount:pages.length,sourceFormat:format,pages,findings,limitations:[
      'Non-PDF source content is parsed locally. The original editable design, visual spacing and pagination are not reproduced in reading exports.',
      'Workspace sections represent slides, worksheets, chapters or logical groups, not necessarily printed pages.',
      'Check complex visuals, charts, formulas, merged tables and reading order against your source document.',
      'Document QA is a preparation audit, not independent validation of every arbitrary output.'
    ]};
}
async function imageInspection(file:File,format:DocumentFormat,options:DocumentImportOptions):Promise<Inspection>{
  let image:ImageBitmap;
  try{image=await createImageBitmap(file);}
  catch{throw new Error('The image could not be decoded.');}
  const area=image.width*image.height;
  if(area<=0||area>80_000_000){image.close();throw new Error('Image dimensions exceed safe browser limits.');}
  const scale=Math.min(1,Math.sqrt(3_500_000/area));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.width*scale));
  canvas.height=Math.max(1,Math.round(image.height*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx){image.close();throw new Error('Browser canvas is unavailable.');}
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  image.close();
  let ocr:PageOcr|undefined;
  let lines:string[]=[];
  if(options.automaticOcr!==false){
    options.onStage?.('Recognizing text inside the scanned image locally…');
    const {startOcr,normalizeOcrResult}=await import('./ocr');
    let worker:Awaited<ReturnType<typeof startOcr>>;
    try{
      worker=await startOcr(options.ocrLanguage||'eng');
      const found=await worker.recognize(canvas);
      const normalized=normalizeOcrResult(options.ocrLanguage||'eng',found.text,found.confidence,found.words);
      ocr=normalized.ocr;lines=normalized.lines;
    }catch{ocr={status:'failed',language:options.ocrLanguage||'eng',characters:0};}
    finally{if(worker!)await worker.close().catch(()=>undefined);}
  }
  canvas.width=0;canvas.height=0;
  return builtInspection(file,format,[{label:'Scanned image',imageCount:1,
    blocks:lines.map(t=>semantic('paragraph',t))}],ocr);
}
export async function inspectDocument(
  file:File,progress:(value:number)=>void,options:DocumentImportOptions={}
):Promise<Inspection>{
  const format=detectDocumentFormat(file.name);
  if(!format)throw new Error('Unsupported file type. Choose a supported office, PDF, eBook, text or image file.');
  if(!file.size)throw new Error('This file is empty.');
  if(file.size>PRODUCT.maxDocumentBytes)throw new Error('The file exceeds the 20 MB browser import limit.');
  if(format==='pdf'){
    const {inspectPdf}=await import('./pdf');
    const report=await inspectPdf(file,progress,options);
    report.sourceFormat='pdf';
    return report;
  }
  options.onStage?.('Extracting '+format.toUpperCase()+' structure locally…');
  let sections:ImportedSection[];
  if(ZIP_FORMATS.has(format)){
    const {importOfficeDocument}=await import('./officeImport');
    sections=await importOfficeDocument(file,format);
  }else if(IMAGE_FORMATS.has(format)){
    const report=await imageInspection(file,format,options);
    progress(100);return report;
  }else if(format==='html'){
    const {parseHtmlContent}=await import('./officeImport');
    sections=partition(parseHtmlContent(await file.text()),'Web document');
  }else sections=textSections(await file.text(),format);
  progress(100);
  return builtInspection(file,format,sections);
}
