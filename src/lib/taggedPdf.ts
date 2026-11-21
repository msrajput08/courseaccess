import type { EditableBlock, Inspection } from '../types';
import { parseTable, formulaMathML } from './semantics';

/**
 * Generate a NEW reading-order tagged PDF from inspected text and corrections.
 * The original PDF's graphic content is not modified or retagged.
 * This is not a claim of PDF/UA conformance: complex figures, tables and
 * original reading-order relationships may be unavailable.
 */
export async function buildTaggedReadingPdf(
  inspection: Inspection,
  blocks: EditableBlock[],
  reviewedDescriptions: Record<number,string> = {},
  language = 'en-US',
): Promise<Blob> {
  if (!blocks.some(b=>b.text.trim()) && !Object.values(reviewedDescriptions).some(t=>t.trim())) {
    throw new Error('No readable text is available. Run OCR or add a transcription before exporting a tagged reading PDF.');
  }
  // PDFKit's browser build uses embedded WOFF fonts. Import lazily so the
  // checker stays small until a user explicitly requests a PDF export.
  const [pdfModule, regularAsset, boldAsset, devanagariAsset] = await Promise.all([
    import('pdfkit'),
    import('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url'),
    import('@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff?url'),
    import('@fontsource/noto-sans/files/noto-sans-devanagari-400-normal.woff?url'),
  ]);
  const urls=[regularAsset.default,boldAsset.default,devanagariAsset.default];
  const data=await Promise.all(urls.map(async url=>{
    const response=await fetch(url);
    if(!response.ok)throw new Error('Could not load embedded PDF fonts.');
    return new Uint8Array(await response.arrayBuffer());
  }));
  type Struct={add:(child:Struct)=>void};
  type Doc={
    on:(event:'data'|'end'|'error',fn:(arg?:unknown)=>void)=>void;
    end:()=>void;addPage:()=>void;
    struct:(type:string, options?:unknown, children?:unknown)=>Struct;
    addStructure:(part:Struct)=>void;
    registerFont:(name:string,content:Uint8Array)=>void;
    font:(name:string)=>Doc;
    fontSize:(size:number)=>Doc;
    fillColor:(color:string)=>Doc;
    text:(content:string,options?:Record<string,unknown>)=>Doc;
    list:(items:string[],options?:Record<string,unknown>)=>Doc;
    moveDown:(lines?:number)=>Doc;
  };
  const PDFDocument=(pdfModule as unknown as {PDFDocument?:unknown;default:unknown}).PDFDocument ?? pdfModule.default;
  const PdfCtor=PDFDocument as new (options:Record<string,unknown>)=>Doc;
  const doc=new PdfCtor({
    pdfVersion:'1.7',subset:'PDF/UA',tagged:true,lang:language,displayTitle:true,autoFirstPage:false,font:null,
    margins:{top:55,bottom:55,left:60,right:60},info:{
      Title:inspection.name.replace(/\.pdf$/i,'')+' — structured reading copy',
      Author:'CourseAccess',
      Subject:'Reconstructed tagged reading format from reviewed text and OCR'
    }
  });
  doc.registerFont('Reading',data[0]);
  doc.registerFont('Heading',data[1]);
  doc.registerFont('Devanagari',data[2]);
  const stream=new Promise<Blob>((resolve,reject)=>{
    const chunks:Uint8Array[]=[];
    doc.on('data',v=>chunks.push(new Uint8Array(v as ArrayBufferLike)));
    doc.on('error',err=>reject(err instanceof Error?err:new Error('Tagged PDF export failed.')));
    doc.on('end',()=>resolve(new Blob(chunks.map(v=>new Uint8Array(v).buffer as ArrayBuffer),{type:'application/pdf'})));
  });
  const root=doc.struct('Document');
  doc.addStructure(root);
  const isDevanagari=(value:string)=>/[\u0900-\u097F]/.test(value);
  function emit(section:Struct,type:string,text:string,fontSize:number,bold=false) {
    section.add(doc.struct(type,type==='TH'?{scope:'Column'}:{},()=>{
      doc.font(isDevanagari(text)?'Devanagari':bold?'Heading':'Reading')
        .fontSize(fontSize).fillColor('#20382d').text(text+' ',{paragraphGap:fontSize*.5,lineGap:2});
    }));
  }
  function addItems(section:Struct,items:string[]) {
    const list=doc.struct('L');
    section.add(list);
    doc.font(items.some(isDevanagari)?'Devanagari':'Reading').fontSize(11).fillColor('#20382d');
    doc.list(items.map(v=>v+' '),{structParent:list,bulletRadius:2,paragraphGap:4,indent:18});
    doc.moveDown(.4);
  }
  function emitTable(section:Struct,block:EditableBlock) {
    const parsed=parseTable(block.text);
    if(!parsed) {
      emit(section,'P','Table data could not be reconstructed safely: '+block.text,11);
      return;
    }
    const table=doc.struct('Table');
    section.add(table);
    if(block.description?.trim())emit(table,'Caption',block.description.trim(),11,true);
    for(const [index,row] of parsed.rows.entries()) {
      const tr=doc.struct('TR');table.add(tr);
      for(const cell of row){
        emit(tr,index===0?'TH':'TD',cell,10,index===0);
      }
    }
  }
  function emitEquation(section:Struct,block:EditableBlock) {
    const math=formulaMathML(block.text);
    const explanation=block.description?.trim();
    if(!math) {
      emit(section,'P','Equation requires corrected LaTeX notation: '+block.text,11);
      return;
    }
    const alt=explanation||'Equation '+block.text;
    section.add(doc.struct('Formula',{alt},()=>{
      doc.font('Reading').fontSize(11).fillColor('#20382d')
        .text('Equation: '+block.text+' ',{paragraphGap:6,lineGap:2});
    }));
    if(explanation)emit(section,'P','Meaning: '+explanation,11);
  }
  try {
    doc.addPage();
    emit(root,'H1',inspection.name.replace(/\.pdf$/i,''),19,true);
    emit(root,'P','Structured reading copy generated by CourseAccess. Review mathematical notation, figures and complex tables against the original source.',9);
    for(const page of inspection.pages) {
      if(page.number>1)doc.addPage();
      const section=doc.struct('Sect',{title:'Original page '+page.number});
      root.add(section);
      emit(section,'H2','Page '+page.number,15,true);
      const current=blocks.filter(b=>b.page===page.number && b.text.trim());
      let pending:string[]=[];
      const flush=()=>{if(pending.length){addItems(section,pending);pending=[];}};
      for(const block of current) {
        if(block.kind==='list'){pending.push(block.text.trim());continue;}
        flush();
        if(block.kind==='table'){emitTable(section,block);continue;}
        if(block.kind==='equation'){emitEquation(section,block);continue;}
        const level=block.headingLevel&&[2,3,4].includes(block.headingLevel)?block.headingLevel:3;
        const tag=block.kind==='heading'?'H'+level:block.kind==='blockquote'?'BlockQuote':'P';
        emit(section,tag,block.text,block.kind==='heading'?13:11,block.kind==='heading');
      }
      flush();
      if(reviewedDescriptions[page.number]?.trim()) {
        emit(section,'H3','Reviewed visual description',12,true);
        emit(section,'P',reviewedDescriptions[page.number].trim(),11);
      }
    }
    doc.end();
    const generated=await stream;
    const {removeOptionalCidSets}=await import('./pdfuaFonts');
    return await removeOptionalCidSets(generated);
  }catch(e){
    // Do not return a broken or partly generated document.
    try{doc.end();}catch{ /* PDF stream already ended */ }
    throw e;
  }
}
