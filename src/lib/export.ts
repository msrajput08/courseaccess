import type { EditableBlock, Inspection } from '../types';
import { formulaMathML, parseTable } from './semantics';

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

/** Escaped and semantically structured, downloadable standalone HTML.
 * MathML is generated from constrained LaTeX by KaTeX, never accepted as
 * arbitrary markup. The first row of a table is a real header row.
 */
export function semanticHtml(report: Inspection, blocks: EditableBlock[], approvedNotes: Record<number, string> = {}, language = 'en-US'): string {
  const byPage = report.pages.map(page => {
    const lines:string[]=[];
    let inList=false;
    const closeList=()=>{if(inList){lines.push('</ul>');inList=false;}};
    for(const block of blocks.filter(b=>b.page===page.number && b.text.trim())) {
      const safe=linkifyText(block.text).replace(/\n/g,'<br>');
      if(block.kind==='list'){
        if(!inList){lines.push('<ul>');inList=true;}
        lines.push('<li>'+safe+'</li>');
        continue;
      }
      closeList();
      if(block.kind==='heading'){
        const level=[2,3,4].includes(block.headingLevel||3)?(block.headingLevel||3):3;
        lines.push('<h'+level+'>'+safe+'</h'+level+'>');
      }else if(block.kind==='blockquote')lines.push('<blockquote>'+safe+'</blockquote>');
      else if(block.kind==='table'){
        const parsed=parseTable(block.text);
        if(!parsed){
          lines.push('<p><strong>Table data needs consistent columns:</strong> '+escapeHtml(block.text)+'</p>');
          continue;
        }
        const caption=block.description?.trim()||'Table from page '+page.number;
        const header='<thead><tr>'+parsed.rows[0].map(cell=>'<th scope="col">'+escapeHtml(cell)+'</th>').join('')+'</tr></thead>';
        const body='<tbody>'+parsed.rows.slice(1).map(row=>'<tr>'+row.map(cell=>'<td>'+escapeHtml(cell)+'</td>').join('')+'</tr>').join('')+'</tbody>';
        lines.push('<table><caption>'+escapeHtml(caption)+'</caption>'+header+body+'</table>');
      }else if(block.kind==='equation'){
        const math=formulaMathML(block.text);
        const spoken=block.description?.trim()||'Equation: '+block.text;
        lines.push('<div class="equation" role="group" aria-label="'+escapeHtml(spoken)+'">'+
          (math||'<p>'+escapeHtml(block.text)+'</p>')+
          (block.description?.trim()?'<p class="math-description">'+escapeHtml(block.description.trim())+'</p>':'')+
          '</div>');
      }else lines.push('<p>'+safe+'</p>');
    }
    closeList();
    const reviewed=approvedNotes[page.number]?.trim()?
      '<aside aria-label="Reviewed figure description note"><h3>Reviewed figure description (image not reproduced)</h3><p>'+
      escapeHtml(approvedNotes[page.number])+'</p></aside>':'';
    return '<section aria-labelledby="page-'+page.number+'"><h2 id="page-'+page.number+'">Page '+
      page.number+'</h2>\n'+lines.join('\n')+reviewed+'</section>';
  });
  return '<!doctype html>\n<html lang="'+escapeHtml(/^[a-z]{2,3}-[A-Z]{2}$/.test(language)?language:'en-US')+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+
    '<title>'+escapeHtml(report.name)+' — structured reading copy</title><style>'+
    'body{max-width:74ch;margin:3rem auto;padding:0 1rem;font:1.125rem/1.7 system-ui;color:#1b2623;background:#fff}'+
    'h1,h2,h3,h4{line-height:1.25}section{padding-block:2rem;border-top:1px solid #cbd5d1}'+
    'blockquote{border-left:3px solid #386c60;padding-left:1rem}'+
    'table{width:100%;border-collapse:collapse;margin:1rem 0}'+
    'th,td{border:1px solid #647970;text-align:left;padding:.5rem;vertical-align:top}'+
    'th{background:#edf5ef}caption{text-align:left;font-weight:700;padding:.25rem 0}'+
    '.equation{margin:1rem 0;overflow-x:auto}.math-description{font-size:.9em;color:#344d43}'+
    '</style></head><body><main><h1>'+escapeHtml(report.name)+'</h1>'+
    '<p><small>Edited reading copy generated from available source text and optional OCR. '+ 
    'Complex figures and spatial layouts need source-specific verification. This is not a claim of PDF/UA conformance.</small></p>'+
    byPage.join('\n')+'</main></body></html>';
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
  return (filename.replace(/\.[^.]+$/i, '').replace(/[^a-z0-9_-]/gi, '-').replace(/-+/g, '-').slice(0, 70) || 'courseaccess-report');
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
