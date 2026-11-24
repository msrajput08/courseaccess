import type {Inspection,OcrLanguage} from '../types';
import {PRODUCT} from '../config';
import {inspectDocument} from './importDocument';
import {semanticHtml,safeStem} from './export';
import {auditReadingCopy,inferDocumentLanguage} from './semantics';
export interface BatchResult {name:string;status:'ready'|'failed';pageCount:number;findingCount:number;message:string}
export interface BatchOptions {limit:number;ocr:boolean;language:OcrLanguage;taggedPdf:boolean;isCanceled:()=>boolean;onProgress:(message:string,rows:BatchResult[])=>void}
export const BATCH_MAX_BYTES=150*1024*1024;
export function validateBatch(files:File[],limit:number){
 if(!Number.isSafeInteger(limit)||limit<1||limit>30||files.length<1||files.length>limit)throw Error('Choose between 1 and '+limit+' documents.');
 if(files.some(f=>f.size<1||f.size>PRODUCT.maxDocumentBytes))throw Error('Every document must be nonempty and no larger than 20 MB.');
 if(files.reduce((n,f)=>n+f.size,0)>BATCH_MAX_BYTES)throw Error('The complete batch must be 150 MB or smaller.');
}
export function csvCell(value:string|number){let s=String(value);if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
export function batchCsv(rows:BatchResult[]){return [['Document','Result','Pages or sections','Findings','Note'],...rows.map(r=>[r.name,r.status,r.pageCount,r.findingCount,r.message])].map(row=>row.map(csvCell).join(',')).join('\r\n');}
export async function buildBatch(files:File[],options:BatchOptions){
 validateBatch(files,options.limit);
 const JSZip=(await import('jszip')).default,zip=new JSZip(),rows:BatchResult[]=[];
 const reportFolder=(f:File,n:number)=>String(n+1).padStart(2,'0')+'-'+safeStem(f.name);
 for(const [n,f] of files.entries()){
  if(options.isCanceled())break;
  let report:Inspection|undefined;
  try{
   options.onProgress('Inspecting '+(n+1)+' of '+files.length,rows.slice());
   report=await inspectDocument(f,percent=>options.onProgress('Document '+(n+1)+' of '+files.length+' · '+Math.round(percent)+'%',rows.slice()),{automaticOcr:options.ocr,ocrLanguage:options.language});
   const folder=reportFolder(f,n),blocks=report.pages.flatMap(page=>page.blocks);
   // An unattended batch is a draft, not a reviewed/certified reading copy.
   const language=inferDocumentLanguage(report);
   zip.file(folder+'/reading-draft.html',semanticHtml(report,blocks,{},language));
   zip.file(folder+'/inspection.json',JSON.stringify({document:report.name,sourceFormat:report.sourceFormat,pageCount:report.pageCount,findings:report.findings,limitations:report.limitations,reviewRequired:true},null,2));
   let note='Draft and findings exported; review before publication.';
   if(options.taggedPdf&&!options.isCanceled()){
    try{const {buildTaggedReadingPdf}=await import('./taggedPdf');const blob=await buildTaggedReadingPdf(report,blocks,{},language);zip.file(folder+'/tagged-reading-draft.pdf',await blob.arrayBuffer());}catch{note='HTML and findings ready; tagged PDF export failed for this document.';}
   }
   rows.push({name:f.name,status:'ready',pageCount:report.pageCount,findingCount:report.findings.length,message:note});
  }catch(e){rows.push({name:f.name,status:'failed',pageCount:report?.pageCount||0,findingCount:report?.findings.length||0,message:e instanceof Error?e.message:'Document could not be processed.'});}
  options.onProgress('Processed '+rows.length+' of '+files.length,rows.slice());
 }
 zip.file('review-summary.csv',batchCsv(rows));
 zip.file('README.txt','CourseAccess batch review package\nGenerated reading drafts are not accessibility certifications. Inspect OCR, missing visual descriptions, tables, math and reading order before publishing. Originals are unchanged. Files remain on your device.\n');
 const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3}});
 return {blob,rows,canceled:options.isCanceled()};
}
