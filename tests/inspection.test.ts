import { describe, it, expect } from 'vitest';
import { buildInspection, detectFindings, type PageEvidence } from '../src/lib/inspection';
import { escapeHtml, safeStem, semanticHtml } from '../src/lib/export';
import { validatePdf } from '../src/lib/pdf';
import { PRODUCT } from '../src/config';
function page(patch: Partial<PageEvidence> = {}): PageEvidence {
  return { number: 1, width: 612, height: 792, lines: ['Accessible lecture notes contain real text for every student.'], sizes: Array(12).fill(12), textItems: 12, imagePaintCount: 0, structureTree: true, ...patch };
}
describe('evidence-based inspection', () => {
  it('does not invent issues for a text page with no identified cues', () => {
    expect(detectFindings(page())).toEqual([]);
  });
  it('confirms only absence of extractable text, not a scan', () => {
    const findings = detectFindings(page({lines:[],textItems:0,structureTree:null}));
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe('No extractable page text');
    expect(findings[0].kind).toBe('verified');
    expect(findings[0].description).toContain('does not prove');
  });
  it('flags possible image-only pages separately from the verified text gap', () => {
    const findings = detectFindings(page({lines:[],textItems:0,imagePaintCount:2}));
    expect(findings.some(f=>f.title==='Possible image-only page'&&f.kind==='potential')).toBe(true);
    expect(findings.some(f=>f.category==='visual'&&f.kind==='manual')).toBe(true);
  });
  it('marks math and figures for manual rather than claimed automatic repair', () => {
    const findings = detectFindings(page({lines:['Equation 3 and Figure 2 illustrate the result.']}));
    expect(findings.some(f=>f.category==='stem'&&f.kind==='manual')).toBe(true);
    expect(findings.some(f=>f.category==='structure'&&f.kind==='manual')).toBe(true);
  });
  it('treats missing exposed structure tree as potential, not proof', () => {
    const findings = detectFindings(page({structureTree:false}));
    expect(findings.find(f=>f.category==='structure')?.kind).toBe('potential');
  });
  it('constructs ordered pages and editable draft blocks', () => {
    const report = buildInspection('example.pdf',123,[page(),page({number:2,lines:[],textItems:0})]);
    expect(report.pageCount).toBe(2);
    expect(report.pages[0].blocks[0].text).toContain('lecture notes');
    expect(report.findings[0].page).toBe(2);
    expect(report.limitations.join(' ')).toContain('not a PDF/UA');
  });
});
describe('safe reviewed export', () => {
  it('escapes all HTML-sensitive characters', () => {
    expect(escapeHtml("<script>'\"&</script>")).toBe('&lt;script&gt;&#39;&quot;&amp;&lt;/script&gt;');
  });
  it('escapes both page text and human-approved notes', () => {
    const report = buildInspection('unsafe <title>.pdf',12,[page({lines:['<img src=x onerror=alert(1)>']})]);
    const html = semanticHtml(report,report.pages[0].blocks,{1:'<script>bad()</script>'});
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('image not included');
  });
  it('normalizes downloaded filenames', () => {
    expect(safeStem('Biology / lecture.pdf')).toBe('Biology-lecture');
  });
});
describe('file validation', () => {
  it('rejects empty and non-PDF content', async () => {
    await expect(validatePdf(new File([], 'empty.pdf'))).rejects.toThrow('empty');
    await expect(validatePdf(new File(['not a pdf'], 'invalid.pdf'))).rejects.toThrow('valid PDF');
  });
  it('rejects non-PDF extensions and oversized inputs', async () => {
    await expect(validatePdf(new File(['%PDF-1.4'], 'fake.txt'))).rejects.toThrow('.pdf');
    const oversized = new File([new Uint8Array(PRODUCT.maxPdfBytes+1)],'large.pdf');
    await expect(validatePdf(oversized)).rejects.toThrow('20 MB');
  });
  it('accepts a PDF header for further parsing (without claiming it is valid)', async () => {
    await expect(validatePdf(new File(['%PDF-1.4\n'], 'lecture.pdf'))).resolves.toBeUndefined();
  });
});
