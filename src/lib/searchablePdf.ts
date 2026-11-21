import type { Inspection, OcrWordBox } from '../types';

export interface SearchablePdfResult {
  pdf: Blob;
  pages: number;
  words: number;
  skippedWords: number;
}

/** Whether source-layout OCR is safe to offer. The source is copied, not edited. */
export function searchablePages(report: Inspection): number[] {
  return report.pages.filter(page =>
    page.ocr?.status === 'recovered' && (page.ocr.words?.length ?? 0) > 0 &&
    page.textItemCount === 0 && page.hasStructureTree !== true,
  ).map(page => page.number);
}
export function textPlacement(
  box: OcrWordBox,
  crop: {x:number;y:number;width:number;height:number},
): {x:number;y:number;width:number;height:number}|null {
  const numbers=[box.x,box.y,box.width,box.height,crop.x,crop.y,crop.width,crop.height];
  if(numbers.some(v=>!Number.isFinite(v)) || crop.width<=0 || crop.height<=0 ||
    box.x<0 || box.y<0 || box.width<=0 || box.height<=0 ||
    box.x+box.width>1.001 || box.y+box.height>1.001)return null;
  return {
    x:crop.x+box.x*crop.width,
    // Coordinates in PDF start bottom-left; Tesseract starts top-left.
    y:crop.y+(1-box.y-box.height)*crop.height,
    width:box.width*crop.width,
    height:box.height*crop.height,
  };
}

/**
 * Create a searchable COPY of the original PDF. Existing page artwork is kept
 * by loading the source document and adding invisible, positioned OCR words
 * to image-only pages. This output is NOT a tagged PDF repair.
 *
 * Signed, tagged, rotated and form PDFs are rejected deliberately to avoid
 * invalidating accessibility structure, signatures or coordinate geometry.
 */
export async function buildSearchableSourcePdf(file: File, report:Inspection): Promise<SearchablePdfResult> {
  if(file.size>20*1024*1024)throw new Error('The input file exceeds the supported limit.');
  const eligible=searchablePages(report);
  if(eligible.length===0)throw new Error('No image-only pages with positioned OCR words are available for this export.');
  if(report.pages.some(p=>p.hasStructureTree===true)) {
    throw new Error('This document already contains a tag tree. Use the tagged reading-copy export to avoid altering its existing structure.');
  }
  const original=new Uint8Array(await file.arrayBuffer());
  const [{PDFDocument},fontkitModule,latinAsset,devanagariAsset]=await Promise.all([
    import('pdf-lib'),
    import('@pdf-lib/fontkit'),
    import('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url'),
    import('@fontsource/noto-sans/files/noto-sans-devanagari-400-normal.woff?url'),
  ]);
  const sourceAscii=new TextDecoder('latin1').decode(original);
  if(/\/ByteRange\s*\[|\/Type\s*\/Sig\b/.test(sourceAscii)) {
    throw new Error('Digitally signed PDFs cannot be rewritten without invalidating signatures.');
  }
  const pdf=await PDFDocument.load(original,{updateMetadata:false});
  if(pdf.getPages().length!==report.pageCount)throw new Error('Original page count changed. Reinspect the source PDF.');
  if(pdf.getForm().getFields().length) {
    throw new Error('PDF forms are not supported by the layout-preserving OCR copy.');
  }
  const fontkit=fontkitModule.default;
  pdf.registerFontkit(fontkit);
  const loadFont=async(url:string)=>{
    const res=await fetch(url);
    if(!res.ok)throw new Error('Unable to load an embedded font required for the searchable PDF.');
    return pdf.embedFont(new Uint8Array(await res.arrayBuffer()),{subset:true});
  };
  const [latin,devanagari]=await Promise.all([loadFont(latinAsset.default),loadFont(devanagariAsset.default)]);
  let pages=0,words=0,skippedWords=0;
  for(const pageNumber of eligible) {
    const originalPage=report.pages[pageNumber-1];
    const page=pdf.getPage(pageNumber-1);
    if(page.getRotation().angle%360!==0) {
      throw new Error('Rotated scanned pages are not yet supported for accurate OCR coordinates (page '+pageNumber+').');
    }
    const crop=page.getCropBox();
    let written=0;
    for(const box of originalPage.ocr?.words??[]) {
      const p=textPlacement(box,crop);
      if(!p || !box.text.trim()) {skippedWords++;continue;}
      const font=/[\u0900-\u097F]/.test(box.text)?devanagari:latin;
      try {
        // Use the recognized bounding box to place transparent, searchable text.
        // text is fully transparent to keep original image and layout visible.
        const targetSize=Math.max(2,Math.min(72,p.height*.8));
        const unitWidth=font.widthOfTextAtSize(box.text,1);
        const size=unitWidth>0 ? Math.max(1,Math.min(targetSize,p.width/unitWidth)) : targetSize;
        if(size<1.5){skippedWords++;continue;}
        page.drawText(box.text+' ',{
          x:p.x,y:p.y+p.height*.15,size,font,opacity:0,
          lineHeight:size,characterSpacing:0,
        });
        written++;
      }catch {
        skippedWords++;
      }
    }
    if(written){pages++;words+=written;}
  }
  if(!words)throw new Error('OCR text positions were unavailable or fonts could not encode the recognized text. Export a tagged reading copy instead.');
  pdf.setTitle(report.name.replace(/\.pdf$/i,'')+' — searchable scanned copy');
  pdf.setSubject('Original visual pages with invisible OCR text layer. Not a PDF/UA tag repair.');
  const bytes=await pdf.save({useObjectStreams:true});
  return {pdf:new Blob([new Uint8Array(bytes).buffer],{type:'application/pdf'}),pages,words,skippedWords};
}
