import type { EditableBlock, Inspection } from '../types';

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);
}
/** Safely linkify explicit web addresses in the reading draft. Never infer a link from unrelated text. */
export function linkifyText(text: string): string {
  const rx = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
  let output = '', offset = 0;
  for (const match of text.matchAll(rx)) {
    const start = match.index;
    const original = match[0];
    const display = original.replace(/[.,;:!?]+$/, '');
    output += escapeHtml(text.slice(offset, start));
    try {
      const url = new URL(display.startsWith('www.') ? 'https://' + display : display);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid link protocol');
      output += '<a href="' + escapeHtml(url.href) + '" rel="noopener noreferrer">' + escapeHtml(display) + '</a>';
    } catch {
      output += escapeHtml(display);
    }
    output += escapeHtml(original.slice(display.length));
    offset = start + original.length;
  }
  return output + escapeHtml(text.slice(offset));
}

export function semanticHtml(report: Inspection, blocks: EditableBlock[], approvedNotes: Record<number, string> = {}): string {
  const byPage = report.pages.map((page) => {
    const lines: string[] = [];
    let inList = false;
    for (const block of blocks.filter((b) => b.page === page.number && b.text.trim())) {
      const safe = linkifyText(block.text).replace(/\n/g, '<br>');
      if (block.kind === 'list') {
        if (!inList) { lines.push('<ul>'); inList = true; }
        lines.push('<li>' + safe + '</li>');
        continue;
      }
      if (inList) { lines.push('</ul>'); inList = false; }
      if (block.kind === 'heading') lines.push('<h3>' + safe + '</h3>');
      else if (block.kind === 'blockquote') lines.push('<blockquote>' + safe + '</blockquote>');
      else lines.push('<p>' + safe + '</p>');
    }
    if (inList) lines.push('</ul>');
    const reviewedNote = approvedNotes[page.number] ?
      '<aside aria-label="Reviewed figure description note"><h3>Reviewed figure description (image not reproduced)</h3><p>' +
      escapeHtml(approvedNotes[page.number]) + '</p></aside>' : '';
    return '<section aria-labelledby="page-' + page.number + '">\n<h2 id="page-' + page.number + '">Page ' +
      page.number + '</h2>\n' + lines.join('\n') + reviewedNote + '\n</section>';
  });
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' +
    escapeHtml(report.name) +
    ' — structured reading draft</title><style>body{max-width:70ch;margin:3rem auto;padding:0 1rem;font:1.125rem/1.7 system-ui;color:#1b2623}h1,h2,h3{line-height:1.25}section{padding-block:2rem;border-top:1px solid #cbd5d1}blockquote{border-left:3px solid #386c60;padding-left:1rem}</style></head><body><main><h1>' +
    escapeHtml(report.name) + '</h1><p><small>Structured draft generated from the PDF text layer. If the document contains images, equations, complex tables or columns, check those sections against the original. This is not a repaired tagged PDF.</small></p>' +
    byPage.join('\n') + '</main></body></html>';
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
export function downloadReport(report: Inspection, editedBlocks?: EditableBlock[], reviewedNotes?: Record<number, string>): void {
  downloadText(safeStem(report.name) + '-inspection.json', JSON.stringify({
    product: 'CourseAccess', advisoryOnly: true, exportedAt: new Date().toISOString(), ...report,
    ...(editedBlocks ? { reviewedBlocks: editedBlocks } : {}),
    ...(reviewedNotes ? { approvedFigureNotes: reviewedNotes } : {}),
  }, null, 2), 'application/json;charset=utf-8');
}

export function downloadBlob(filename:string,blob:Blob):void {
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=filename;
  document.body.append(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),3000);
}
