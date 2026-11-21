import type { EditableBlock, Finding, Inspection, PageInspection, PageOcr } from '../types';

export interface PageEvidence {
  number: number;
  width: number;
  height: number;
  lines: string[];
  sizes: number[];
  lineSizes?: number[];
  textItems: number;
  imagePaintCount: number;
  linkAnnotationCount?: number;
  ocr?: PageOcr;
  structureTree: boolean | null;
}
export const INITIAL_LIMITATIONS = [
  'This is an inspection aid, not a PDF/UA or WCAG certification.',
  'PDF.js text extraction does not reliably establish logical reading order, alt-text completeness, table semantics or full tagging conformance.',
  'Math, figures, charts and complex layouts need a human comparison with the source PDF.',
  'Generated HTML and tagged PDF are separate reading copies, not in-place tagging repair of the original PDF. Complex visual semantics may be missing.',
];
export function detectFindings(page: PageEvidence): Finding[] {
  const result: Finding[] = [];
  const text = page.lines.join(' ').trim();
  const add = (kind: Finding['kind'], severity: Finding['severity'], category: Finding['category'], title: string, description: string, recommendation: string) => {
    result.push({ id: 'p' + page.number + '-' + result.length, page: page.number, kind, severity, category, title, description, recommendation });
  };
  if (page.textItems === 0) {
    add('verified', page.ocr?.status === 'recovered' ? 'low' : 'high', 'text', 'No extractable page text', 'The original PDF page had no readable text layer. ' + (page.ocr?.status === 'recovered' ? 'Local OCR produced a draft transcription.' : 'This alone does not prove the page is a scan.'), page.ocr?.status === 'recovered' ? 'The recognized text is already editable in the reading draft. Verify technical terms and names.' : 'Automatic OCR will be attempted on image-backed pages when enabled.');
    if (page.ocr?.status === 'recovered') {
      add('verified', 'low', 'text', 'OCR text recovered', 'Recognized ' + page.ocr.characters + ' characters locally (OCR confidence ' + Math.round(page.ocr.confidence || 0) + '%). This is a machine transcription, not original selectable PDF text.', 'Correct OCR errors in the editor before distributing the generated reading copy.');
    } else if (page.imagePaintCount > 0) {
      add('potential', 'high', 'visual', 'Possible image-only page', 'Image-paint operations were observed, while no usable text was extracted. The images may contain page content.', 'Try OCR if it was not run or add a transcription to the reading draft.');
    }
    if (page.ocr?.status === 'failed') add('potential','high','text','OCR unavailable for this page','The in-browser OCR engine could not recognize this page. The original file remains unchanged.','Check your network for the language-model download or paste a transcription in the editor.');
  } else if (!text) {
    add('verified','high','text','No extractable page text','Text extraction returned no usable words.','Add an accurate transcription to the reading draft.');
  } else if (text.length < 45) {
    add('potential', 'medium', 'text', 'Very little extractable text', 'Only ' + text.length + ' characters of selectable text were detected on this page.', 'Review the page to determine whether important information is missing from the text layer.');
  }
  const validSizes = page.sizes.filter((n) => Number.isFinite(n) && n > 0 && n < 250);
  if (validSizes.length >= 8) {
    const ordered = [...validSizes].sort((a,b) => a-b);
    const median = ordered[Math.floor(ordered.length/2)];
    if (median < 9) add('potential', 'medium', 'text', 'Small apparent text size', 'Median extracted text-item height is approximately ' + median.toFixed(1) + ' PDF points. Transformations can make this estimate imprecise.', 'Inspect the page at typical zoom and consider a larger, consistently legible font in the source.');
  }
  if (page.structureTree === false && text.length > 0) {
    add('potential', 'medium', 'structure', 'Structure tree not exposed', 'PDF.js did not expose a structure tree for this page. This alone does not establish that the PDF is untagged.', 'Use a dedicated PDF accessibility validator to inspect document tags, headings, lists and reading order.');
  }
  if (page.linkAnnotationCount === 0 && /(?:https?:\/\/|www\.)[^\s]+/i.test(text)) {
    add('potential','medium','structure','Visible website address may not be clickable','A visible web address was found in the extracted text, but PDF.js exposed no clickable link annotations on this page.','Use the generated HTML, which turns recognized web addresses into hyperlinks, or add an actual hyperlink in the PDF source.');
  }
  if (page.imagePaintCount > 0) {
    add('manual', 'review', 'visual', 'Review figure descriptions', page.imagePaintCount + ' image drawing operation(s) were detected. The presence or quality of alternative text cannot be determined here.', 'Check every meaningful figure for an accurate description and mark decorative images appropriately.');
  }
  if (/\b(?:table\s*\d+|figure\s*\d+|fig\.\s*\d+)\b/i.test(text)) {
    add('manual', 'review', 'structure', 'Review referenced tables or figures', 'The text refers to a table or figure. Text extraction cannot establish usable table headers or a meaningful image description.', 'Check table header associations, caption context, and figure descriptions in the original.');
  }
  if (/[∑∫√≠≤≥∞≈±∂∆∈∉∪∩]/.test(text) || /\b(?:equation|theorem|formula)\s*\d*\b/i.test(text)) {
    add('manual', 'review', 'stem', 'Review mathematical notation', 'Mathematical markers appear in extracted text; layout and meaning may not survive extraction.', 'Compare every expression to the PDF and provide correct MathML, accessible notation or a reviewed explanation.');
  }
  return result;
}
/**
 * Propose semantic blocks from actual PDF text and visual text sizing.
 * A larger font only suggests a heading when the evidence is strong; users
 * can change every role before export. We never claim to recover PDF tags.
 */
export function createBlocks(page: PageEvidence): EditableBlock[] {
  const validSizes = page.sizes.filter((n) => Number.isFinite(n) && n > 0 && n < 250).sort((a, b) => a - b);
  const baseline = validSizes.length ? validSizes[Math.floor(validSizes.length / 2)] : 0;
  const lines = page.lines.map((line, i) => ({ text: line.trim(), size: page.lineSizes?.[i] || 0 })).filter((line) => line.text);
  return lines.slice(0, 400).map(({ text, size }, i) => {
    const bullet = /^(?:[•●◦▪‣]|[-*])\s+/.test(text);
    const heading = !bullet && baseline >= 7 && size >= Math.max(14, baseline * 1.4) &&
      text.length <= 100 && !/[.!?;:,]$/.test(text);
    return {
      id: 'p' + page.number + '-b' + i,
      page: page.number,
      kind: bullet ? 'list' : heading ? 'heading' : 'paragraph',
      text: bullet ? text.replace(/^(?:[•●◦▪‣]|[-*])\s+/, '') : text,
    };
  });
}

export function summarizeAutomation(report: Inspection) {
  const proposedHeadings = report.pages.flatMap((p) => p.blocks).filter((b) => b.kind === 'heading').length;
  const proposedLists = report.pages.flatMap((p) => p.blocks).filter((b) => b.kind === 'list').length;
  const textPages = report.pages.filter((p) => p.text.trim().length > 0).length;
  const ocrRecoveredPages = report.pages.filter((p) => p.ocr?.status === 'recovered').length;
  const ocrFailedPages = report.pages.filter((p) => p.ocr?.status === 'failed').length;
  const missingTextPages = report.pages.filter((p) => !p.text.trim()).map((p) => p.number);
  const focusedPages = [...new Set(report.findings.filter((f) => f.severity === 'high' || f.kind === 'manual').map((f) => f.page))];
  return { proposedHeadings, proposedLists, textPages, missingTextPages, focusedPages, ocrRecoveredPages, ocrFailedPages };
}
export function buildInspection(name: string, size: number, pages: PageEvidence[]): Inspection {
  const inspectedPages: PageInspection[] = pages.map((p) => ({
    number: p.number,
    width: p.width,
    height: p.height,
    text: p.lines.join('\n'),
    textItemCount: p.textItems,
    imagePaintCount: p.imagePaintCount,
    linkAnnotationCount: p.linkAnnotationCount,
    ocr: p.ocr,
    hasStructureTree: p.structureTree,
    blocks: createBlocks(p),
  }));
  return {
    id: crypto.randomUUID(),
    name,
    size,
    createdAt: new Date().toISOString(),
    pageCount: pages.length,
    pages: inspectedPages,
    findings: pages.flatMap(detectFindings),
    limitations: [...INITIAL_LIMITATIONS],
  };
}
