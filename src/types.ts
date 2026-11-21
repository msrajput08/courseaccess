export type DocumentFormat = 'pdf'|'docx'|'pptx'|'xlsx'|'odt'|'odp'|'ods'|'epub'|'txt'|'md'|'html'|'csv'|'tsv'|'rtf'|'png'|'jpg'|'jpeg'|'webp';
export type OcrLanguage = 'eng'|'hin'|'spa'|'fra'|'deu';
/** PDF image pixel coordinates normalized to [0,1], from top-left. */
export interface OcrWordBox {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PageOcr {
  status: 'recovered'|'empty'|'failed';
  language: OcrLanguage;
  confidence?: number;
  characters: number;
  words?: OcrWordBox[];
}
export type FindingKind = 'verified' | 'potential' | 'manual';
export type Severity = 'high' | 'medium' | 'low' | 'review';
export type IssueCategory = 'text' | 'structure' | 'visual' | 'reading-order' | 'stem';
export type BlockKind = 'heading' | 'paragraph' | 'list' | 'blockquote' | 'table' | 'equation';
export interface Finding {
  id: string;
  page: number;
  kind: FindingKind;
  severity: Severity;
  category: IssueCategory;
  title: string;
  description: string;
  recommendation: string;
}
export interface EditableBlock {
  id: string;
  page: number;
  kind: BlockKind;
  text: string;
  /** Only heading blocks use this hierarchy setting. */
  headingLevel?: 2 | 3 | 4;
  /** Table caption, or spoken explanation for a math formula. */
  description?: string;
}
export interface PageInspection {
  number: number;
  /** Page, slide, worksheet or section label originating in the input. */
  label?: string;
  width: number;
  height: number;
  text: string;
  textItemCount: number;
  imagePaintCount: number;
  linkAnnotationCount?: number;
  ocr?: PageOcr;
  hasStructureTree: boolean | null;
  blocks: EditableBlock[];
}
export interface Inspection {
  /** Distinguishes paginated PDFs from logically divided office documents. */
  sourceFormat?: DocumentFormat;
  id: string;
  name: string;
  size: number;
  createdAt: string;
  pageCount: number;
  pages: PageInspection[];
  findings: Finding[];
  limitations: string[];
}
export interface RecentRecord {
  id: string;
  name: string;
  createdAt: string;
  pageCount: number;
  findingCount: number;
}
