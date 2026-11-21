import { PRODUCT } from '../config';
import type { PageEvidence } from './inspection';
import { buildInspection } from './inspection';
import type { Inspection, OcrLanguage } from '../types';
import { shouldOcrPage, startOcr, ocrPdfPage, type OcrSession } from './ocr';

export async function validatePdf(file: File): Promise<void> {
  if (file.size === 0) throw new Error('The selected file is empty. Choose a PDF containing pages.');
  if (file.size > PRODUCT.maxPdfBytes) throw new Error('This PDF exceeds the 20 MB browser processing limit.');
  if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('Choose a file with a .pdf extension.');
  const header = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const signature = new TextDecoder('ascii').decode(header);
  if (!signature.includes('%PDF-')) throw new Error('This file does not appear to be a valid PDF.');
}
export interface InspectionOptions { automaticOcr?:boolean; ocrLanguage?:OcrLanguage; onStage?:(message:string)=>void; }
export async function inspectPdf(file: File, progress: (value: number) => void, options:InspectionOptions = {}): Promise<Inspection> {
  await validatePdf(file);
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true, stopAtErrors: true });
  let pdf: Awaited<typeof task.promise> | undefined;
  let ocrSession: OcrSession | undefined;
  let ocrStartupFailed=false;
  try {
    pdf = await task.promise;
    if (!pdf.numPages || pdf.numPages > PRODUCT.maxPages) throw new Error('This document exceeds the 80-page inspection limit.');
    const pages: PageEvidence[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const rows: { y: number; x: number; value: string; size: number }[] = [];
      const sizes: number[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const y = item.transform[5];
        const x = item.transform[4];
        const size = Math.hypot(item.transform[2], item.transform[3]);
        rows.push({ y, x, value: item.str, size });
        if (size > 0) sizes.push(size);
      }
      // Preserve PDF.js extraction order rather than inferring a definitive logical reading order.
      const lines: string[] = [];
      const lineSizes: number[] = [];
      let current = '', currentSize = 0, prevY: number | undefined;
      for (const row of rows) {
        if (prevY !== undefined && Math.abs(prevY - row.y) > 3 && current.trim()) {
          lines.push(current.trim()); lineSizes.push(currentSize); current = ''; currentSize = 0;
        }
        current += (current ? ' ' : '') + row.value;
        currentSize = Math.max(currentSize, row.size);
        prevY = row.y;
      }
      if (current.trim()) { lines.push(current.trim()); lineSizes.push(currentSize); }
      const ops = await page.getOperatorList();
      const imageCodes = new Set<number>([
        pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject,
        pdfjs.OPS.paintImageXObjectRepeat, pdfjs.OPS.paintInlineImageXObjectGroup,
        pdfjs.OPS.paintImageMaskXObject, pdfjs.OPS.paintImageMaskXObjectRepeat,
      ]);
      const imagePaintCount = ops.fnArray.filter((op) => imageCodes.has(op)).length;
      let linkAnnotationCount: number | undefined;
      try { linkAnnotationCount = (await page.getAnnotations({intent:'display'})).filter((annotation) => annotation.subtype === 'Link').length; } catch { linkAnnotationCount = undefined; }
      let ocr: PageEvidence['ocr'];
      if (shouldOcrPage(rows.length,imagePaintCount,options.automaticOcr===true)) {
        options.onStage?.('Recognizing scanned page '+p+' of '+pdf.numPages+' locally…');
        try {
          if (ocrStartupFailed) throw new Error('OCR model unavailable');
          if (!ocrSession) ocrSession=await startOcr(options.ocrLanguage||'eng');
          const result=await ocrPdfPage(page,ocrSession,options.ocrLanguage||'eng');
          ocr=result.ocr;
          if(result.lines.length)lines.push(...result.lines);
        }catch {
          ocr={status:'failed',language:options.ocrLanguage||'eng',characters:0};
          if(!ocrSession)ocrStartupFailed=true;
        }
      }
      let structureTree: boolean | null = null;
      try { structureTree = !!(await page.getStructTree()); } catch { structureTree = null; }
      pages.push({ number: p, width: viewport.width, height: viewport.height,
        lines, sizes, lineSizes, textItems: rows.length, imagePaintCount, linkAnnotationCount, ocr, structureTree });
      page.cleanup();
      progress(Math.round((p / pdf.numPages) * 100));
    }
    return buildInspection(file.name, file.size, pages);
  } catch (error) {
    if (error instanceof Error && /password/i.test(error.message)) throw new Error('Password-protected PDFs cannot be inspected. Remove the password with permission and try again.');
    if (error instanceof Error && (/limit|exceeds/i).test(error.message)) throw error;
    throw new Error('This PDF could not be analyzed. It may be corrupt, encrypted or use unsupported features.');
  } finally { await ocrSession?.close().catch(()=>undefined); await task.destroy(); }
}
