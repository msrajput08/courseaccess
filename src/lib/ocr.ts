import type { PDFPageProxy } from 'pdfjs-dist';
import type { OcrLanguage, PageOcr, OcrWordBox } from '../types';

export const OCR_LANGUAGES: { value: OcrLanguage; label: string }[] = [
  {value:'eng',label:'English'},{value:'hin',label:'Hindi'},{value:'spa',label:'Spanish'},
  {value:'fra',label:'French'},{value:'deu',label:'German'},
];

export function shouldOcrPage(textItems:number, imagePaintCount:number, enabled:boolean): boolean {
  // A blank PDF page need not download a language model. Work only on image-backed text gaps.
  return enabled && textItems === 0 && imagePaintCount > 0;
}

export type OcrRecognition={text:string;confidence:number;words?:OcrWordBox[]};
export type OcrSession={recognize:(canvas:HTMLCanvasElement)=>Promise<OcrRecognition>;close:()=>Promise<void>};

/** Tesseract.js and its language model load lazily only for image-backed pages.
 * Pixel data stays in this browser; the engine/model assets may be fetched externally.
 */
export async function startOcr(language:OcrLanguage):Promise<OcrSession> {
  const {createWorker}=await import('tesseract.js');
  // Load executable worker, WASM variants and language packs from this
  // application's static assets; no runtime third-party OCR CDN dependency.
  const origin=new URL('/',window.location.href);
  const worker=await createWorker(language,1,{
    workerPath:new URL('ocr/worker.min.js',origin).href,
    corePath:new URL('ocr/core',origin).href,
    langPath:new URL('ocr/lang',origin).href,
    workerBlobURL:false,
  });
  return {
    async recognize(canvas) {
      const result=await worker.recognize(canvas,{}, {blocks:true});
      const blocks=(result.data as unknown as {blocks?: unknown}).blocks;
      return {text:result.data.text,confidence:result.data.confidence,
        words:normalizeOcrBoxes(blocks,canvas.width,canvas.height)};
    },
    close:async()=>{await worker.terminate();},
  };
}
/**
 * OCR word positions are used only for a visually unchanged searchable
 * copy. Ignore malformed/out-of-bounds geometry rather than placing
 * invisible text incorrectly or inventing coordinates.
 */
export function normalizeOcrBoxes(raw:unknown, imageWidth:number, imageHeight:number): OcrWordBox[] {
  if (!Array.isArray(raw) || !(imageWidth>0 && imageHeight>0)) return [];
  const boxes:OcrWordBox[]=[];
  type BBox={x0?:number;y0?:number;x1?:number;y1?:number};
  type Word={text?:unknown;confidence?:unknown;bbox?:BBox};
  type Line={words?:Word[]};
  type Paragraph={lines?:Line[]};
  type Block={paragraphs?:Paragraph[]};
  for(const block of raw as Block[]) {
    if(!Array.isArray(block?.paragraphs))continue;
    for(const paragraph of block.paragraphs) {
      if(!Array.isArray(paragraph?.lines))continue;
      for(const line of paragraph.lines) {
        if(!Array.isArray(line?.words))continue;
        for(const word of line.words) {
          if(boxes.length>=3500)return []; // Too many positioned words: disable unsafe partial searchable export.
          const val=typeof word?.text==='string'?word.text.trim():'';
          const bb=word?.bbox;
          if(!val || val.length>120 || !bb)continue;
          const {x0,y0,x1,y1}=bb;
          if([x0,y0,x1,y1].some(n=>typeof n!=='number'||!Number.isFinite(n)))continue;
          const left=x0 as number,top=y0 as number,right=x1 as number,bottom=y1 as number;
          if(left<0 || top<0 || right>imageWidth || bottom>imageHeight || left>=right || top>=bottom)continue;
          const confidence=typeof word.confidence==='number'&&Number.isFinite(word.confidence)
            ?Math.max(0,Math.min(100,word.confidence)):0;
          if(confidence<20)continue;
          boxes.push({text:val,confidence,
            x:left/imageWidth,y:top/imageHeight,
            width:(right-left)/imageWidth,height:(bottom-top)/imageHeight});
        }
      }
    }
  }
  return boxes;
}
export function normalizeOcrResult(language:OcrLanguage, text:string, confidence:number, words:OcrWordBox[]=[]): {ocr:PageOcr; lines:string[]} {
  const clean=text.replace(/\u0000/g,'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  if(clean.length>400)return {ocr:{status:'failed',language,characters:0},lines:[]};
  const chars=clean.join(' ').length;
  const conf=Number.isFinite(confidence)?Math.max(0,Math.min(100,confidence)):0;
  const usable=chars>=4 && conf>=20;
  return {ocr:{status:usable?'recovered':'empty',language,confidence:conf,characters:usable?chars:0,words:usable?words:[]},lines:usable?clean:[]};
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
    return normalizeOcrResult(language,result.text,result.confidence,result.words);
  }finally{
    canvas.width=0;canvas.height=0;
  }
}
