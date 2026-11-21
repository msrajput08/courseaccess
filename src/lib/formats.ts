import type { DocumentFormat } from '../types';

export const ACCEPTED_DOCUMENTS = '.pdf,.docx,.pptx,.xlsx,.odt,.odp,.ods,.epub,.txt,.md,.markdown,.html,.htm,.csv,.tsv,.rtf,.png,.jpg,.jpeg,.webp';
export const FORMATS_HELP = 'PDF · Word DOCX · PowerPoint PPTX · Excel XLSX · OpenDocument · EPUB · TXT · Markdown · HTML · CSV/TSV · RTF · PNG/JPG/WebP';

const extensions:Record<string,DocumentFormat>={
  pdf:'pdf',docx:'docx',pptx:'pptx',xlsx:'xlsx',odt:'odt',odp:'odp',ods:'ods',
  epub:'epub',txt:'txt',md:'md',markdown:'md',html:'html',htm:'html',
  csv:'csv',tsv:'tsv',rtf:'rtf',png:'png',jpg:'jpg',jpeg:'jpeg',webp:'webp',
};
export const ZIP_FORMATS=new Set<DocumentFormat>(['docx','pptx','xlsx','odt','odp','ods','epub']);
export const IMAGE_FORMATS=new Set<DocumentFormat>(['png','jpg','jpeg','webp']);
export function detectDocumentFormat(filename:string):DocumentFormat|null {
  const extension=filename.trim().toLowerCase().split('.').pop()||'';
  return extensions[extension]||null;
}
export function sectionUnit(format?:DocumentFormat):string {
  if(format==='pptx'||format==='odp')return 'slides';
  if(format==='xlsx'||format==='ods')return 'sheets';
  if(format==='pdf')return 'pages';
  return 'sections';
}
export function sectionLabel(format:DocumentFormat|undefined,index:number):string {
  const name=format==='pptx'||format==='odp'?'Slide':format==='xlsx'||format==='ods'?'Sheet':format==='pdf'?'Page':'Section';
  return name+' '+index;
}
