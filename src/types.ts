export type FindingKind = 'verified' | 'potential' | 'manual';
export type Severity = 'high' | 'medium' | 'low' | 'review';
export type IssueCategory = 'text' | 'structure' | 'visual' | 'reading-order' | 'stem';
export type BlockKind = 'heading' | 'paragraph' | 'list' | 'blockquote';
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
}
export interface PageInspection {
  number: number;
  width: number;
  height: number;
  text: string;
  textItemCount: number;
  imagePaintCount: number;
  linkAnnotationCount?: number;
  hasStructureTree: boolean | null;
  blocks: EditableBlock[];
}
export interface Inspection {
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
