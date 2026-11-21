import type { PDFPageProxy } from 'pdfjs-dist';
import type { OcrLanguage, PageOcr } from '../types';

export const OCR_LANGUAGES: { value: OcrLanguage; label: string }[] = [
  {value:'eng',label:'English'},{value:'hin',label:'Hindi'},{value:'spa',label:'Spanish'},
  {value:'fra',label:'French'},{value:'deu',label:'German'},
];

export function shouldOcrPage(textItems:number, imagePaintCount:number, enabled:boolean): boolean {
  // A blank PDF page need not download a language model. Work only on image-backed text gaps.
  return enabled && textItems === 0 && imagePaintCount > 0;
}

export type OcrRecognition={text:string;confidence:number};
export type OcrSession={recognize:(canvas:HTMLCanvasElement)=>Promise<OcrRecognition>;close:()=>Promise<void>};

/** Tesseract.js and its language model load lazily only for image-backed pages.
 * Pixel data stays in this browser; the engine/model assets may be fetched externally.
 */
export async function startOcr(language:OcrLanguage):Promise<OcrSession> {
  const {createWorker}=await import('tesseract.js');
  const worker=await createWorker(language);
  return {
    async recognize(canvas) {
      const result=await worker.recognize(canvas);
      return {text:result.data.text,confidence:result.data.confidence};
    },
    close:()=>worker.terminate(),
  };
}
export function normalizeOcrResult(language:OcrLanguage, text:string, confidence:number): {ocr:PageOcr; lines:string[]} {
  const clean=text.replace(/\u0000/g,'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean).slice(0,400);
  const chars=clean.join(' ').length;
  const conf=Number.isFinite(confidence)?Math.max(0,Math.min(100,confidence)):0;
  const usable=chars>=4 && conf>=20;
  return {ocr:{status:usable?'recovered':'empty',language,confidence:conf,characters:usable?chars:0},lines:usable?clean:[]};
}
export async function ocrPdfPage(page:PDFPageProxy, session:OcrSession, language:OcrLanguage):Promise<{ocr:PageOcr;lines:string[]}> {
  const base=page.getViewport({scale:1});
  const scale=Math.min(2.6,Math.sqrt(3_500_000/Math.max(1,base.width*base.height)));
  const viewport=page.getViewport({scale});
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(viewport.width);canvas.height=Math.round(viewport.height);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw new Error('Canvas is unavailable for OCR.');
  try{
    await page.render({canvas,canvasContext:ctx,viewport}).promise;
    const result=await session.recognize(canvas);
    return normalizeOcrResult(language,result.text,result.confidence);
  }finally{
    canvas.width=0;canvas.height=0;
  }
}
