import type { EditableBlock, Inspection } from '../types';

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);
}
export function semanticHtml(report: Inspection, blocks: EditableBlock[], approvedNotes: Record<number, string> = {}): string {
  const byPage = report.pages.map((page) => {
    const lines = blocks.filter((b) => b.page === page.number && b.text.trim()).map((block) => {
      const safe = escapeHtml(block.text).replace(/\n/g, '<br>');
      if (block.kind === 'heading') return '<h3>' + safe + '</h3>';
      if (block.kind === 'blockquote') return '<blockquote>' + safe + '</blockquote>';
      if (block.kind === 'list') return '<ul><li>' + safe + '</li></ul>';
      return '<p>' + safe + '</p>';
    });
    const reviewedNote = approvedNotes[page.number] ? '<aside aria-label="Reviewed figure description note"><h3>Reviewed figure description note (image not included)</h3><p>' + escapeHtml(approvedNotes[page.number]) + '</p></aside>' : '';
    return '<section aria-labelledby="page-' + page.number + '">\n<h2 id="page-' + page.number + '">Page ' + page.number + '</h2>\n' + lines.join('\n') + reviewedNote + '\n</section>';
  });
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + escapeHtml(report.name) + ' — reviewed text</title><style>body{max-width:70ch;margin:3rem auto;padding:0 1rem;font:1.125rem/1.7 system-ui;color:#1b2623}h1,h2,h3{line-height:1.25}section{padding-block:2rem;border-top:1px solid #cbd5d1}blockquote{border-left:3px solid #386c60;padding-left:1rem}</style></head><body><main><h1>' + escapeHtml(report.name) + '</h1><p><strong>Review required:</strong> This conversion is based on extracted text and human edits. Compare against the original PDF before publishing. Figures, mathematics and complex layouts may be omitted.</p>' + byPage.join('\n') + '</main></body></html>';
}
export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export function safeStem(filename: string): string {
  return (filename.replace(/\.pdf$/i, '').replace(/[^a-z0-9_-]/gi, '-').replace(/-+/g, '-').slice(0, 70) || 'courseaccess-report');
}
export function downloadReport(report: Inspection): void {
  downloadText(safeStem(report.name) + '-inspection.json', JSON.stringify({
    product: 'CourseAccess', advisoryOnly: true, exportedAt: new Date().toISOString(), ...report,
  }, null, 2), 'application/json;charset=utf-8');
}
