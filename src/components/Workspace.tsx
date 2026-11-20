import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowDownToLine, ArrowLeft, ArrowRight, Check, CheckCheck, ClipboardCheck, FileCode2, FileText, Image, Info, LockKeyhole, Save, ShieldCheck, Sparkles } from 'lucide-react';
import { PRODUCT } from '../config';
import { downloadReport, downloadText, safeStem, semanticHtml } from '../lib/export';
import { rememberMetadata } from '../lib/history';
import type { EditableBlock, FindingKind, Inspection } from '../types';

const titles: Record<FindingKind, string> = {verified:'Verified observation',potential:'Potential issue',manual:'Human review'};
const checks = [
  'Compare all extracted text to the PDF, including columns, footnotes and symbols.',
  'Confirm headings, lists and the screen-reader reading order with appropriate tools.',
  'Check the accuracy of image descriptions in the source document.',
  'Validate table headings, relationships and reading navigation.',
  'Check every mathematical expression for exact meaning.',
  'Validate the final published material with assistive technology.',
];
function Preview({file,pageNumber}:{file:File;pageNumber:number}) {
  const ref=useRef<HTMLCanvasElement>(null);
  const [message,setMessage]=useState('Rendering preview…');
  useEffect(()=>{
    let stopped=false;
    let renderTask: {cancel:()=>void;promise:Promise<unknown>}|undefined;
    let task: {destroy:()=>Promise<void>}|undefined;
    async function run() {
      setMessage('Rendering preview…');
      try {
        const pdfjs=await import('pdfjs-dist');
        const worker=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
        const data=new Uint8Array(await file.arrayBuffer());
        if(stopped)return;
        const loader=pdfjs.getDocument({data,isEvalSupported:false});
        task=loader;
        const doc=await loader.promise;
        if(stopped)return;
        const page=await doc.getPage(pageNumber);
        const base=page.getViewport({scale:1});
        const scale=Math.min(1.3,Math.sqrt(PRODUCT.maxCanvasPixels/Math.max(1,base.width*base.height)));
        const viewport=page.getViewport({scale});
        const canvas=ref.current, context=canvas?.getContext('2d');
        if(!canvas||!context||stopped)return;
        canvas.width=Math.round(viewport.width);canvas.height=Math.round(viewport.height);
        renderTask=page.render({canvas,canvasContext:context,viewport});
        await renderTask.promise;
        if(!stopped)setMessage('');
      } catch {if(!stopped)setMessage('Visual preview unavailable. Text and findings remain accessible.');}
    }
    void run();
    return ()=>{stopped=true;renderTask?.cancel();if(task)void task.destroy().catch(()=>undefined);};
  },[file,pageNumber]);
  return <div className="pdf-sheet">{message&&<div className="preview-status" role="status">{message}</div>}<canvas ref={ref} className="pdf-canvas" role="img" aria-label={'PDF preview of page '+pageNumber}/></div>;
}
type Props={inspection:Inspection;file:File;onNew:()=>void;onSaved:()=>void};
export default function Workspace({inspection,file,onNew,onSaved}:Props) {
  const [page,setPage]=useState(1);
  const [tab,setTab]=useState<'findings'|'edit'|'review'>('findings');
  const [filter,setFilter]=useState<'all'|FindingKind>('all');
  const [blocks,setBlocks]=useState<EditableBlock[]>(inspection.pages.flatMap(p=>p.blocks));
  const [notes,setNotes]=useState<Record<number,string>>({});
  const [approved,setApproved]=useState<Record<number,string>>({});
  const [done,setDone]=useState<Record<number,boolean>>({});
  const [toast,setToast]=useState('');
  const findings=inspection.findings.filter(f=>f.page===page&&(filter==='all'||filter===f.kind));
  const current=inspection.pages[page-1];
  const update=(id:string,patch:Partial<EditableBlock>)=>setBlocks(prev=>prev.map(b=>b.id===id?{...b,...patch}:b));
  function save(){try{rememberMetadata(inspection);onSaved();setToast('Saved only document metadata in this browser. No PDF or text was stored.');}catch{setToast('Local storage was unavailable; no data was saved.');}}
  function html(){downloadText(safeStem(inspection.name)+'-reviewed.html',semanticHtml(inspection,blocks,approved),'text/html;charset=utf-8');setToast('Reviewable HTML downloaded. Verify the content before distribution.');}
  return <main className="workspace shell">
    <div className="workspace-top"><button className="text-button" onClick={onNew} type="button"><ArrowLeft size={16}/> New inspection</button><div className="workspace-actions"><button className="button button-quiet" type="button" onClick={save}><Save size={16}/> Save metadata</button><button className="button button-quiet" type="button" onClick={()=>downloadReport(inspection)}><ArrowDownToLine size={16}/> Report JSON</button><button className="button button-primary" type="button" onClick={html}><FileCode2 size={16}/> Export HTML</button></div></div>
    <div className="workspace-intro"><div><span className="eyebrow">INSPECTION / LOCAL DOCUMENT</span><h1>{inspection.name}</h1><p>Evidence you can verify. Improvements you can trust.</p></div><span className="private-tag"><LockKeyhole size={15}/> Document stays on this device</span></div>
    <div className="stats-row"><div><strong>{inspection.pageCount}</strong><span>Pages</span></div><div><strong>{inspection.findings.filter(f=>f.kind==='verified').length}</strong><span>Verified observations</span></div><div><strong>{inspection.findings.filter(f=>f.kind==='potential').length}</strong><span>Potential issues</span></div><div><strong>{inspection.findings.filter(f=>f.kind==='manual').length}</strong><span>Human-review prompts</span></div><div className="stats-caveat"><Info size={17}/> Not a compliance score</div></div>
    <div className="editor-layout">
      <aside className="editor-rail"><span className="rail-label">DOCUMENT PAGES</span>{inspection.pages.map(p=><button key={p.number} type="button" className={'page-link '+(p.number===page?'selected':'')} aria-current={p.number===page?'page':undefined} onClick={()=>setPage(p.number)}><span>Page {String(p.number).padStart(2,'0')}</span><small>{inspection.findings.filter(f=>f.page===p.number).length}</small></button>)}<div className="rail-note"><ShieldCheck size={21}/><strong>Honest by design.</strong><p>We never turn an automated scan into a false compliance certificate.</p></div></aside>
      <section className="preview-column" aria-label="PDF visual preview"><div className="column-heading"><span><FileText size={16}/> Source PDF</span><span>Page {page} of {inspection.pageCount}</span></div><div className="preview-area"><Preview file={file} pageNumber={page}/></div><div className="pager"><button type="button" aria-label="Previous page" disabled={page<=1} onClick={()=>setPage(p=>p-1)}><ArrowLeft size={17}/></button><span>Visual reference</span><button type="button" aria-label="Next page" disabled={page>=inspection.pageCount} onClick={()=>setPage(p=>p+1)}><ArrowRight size={17}/></button></div></section>
      <section className="insights-column" aria-label="Accessibility findings and editor"><div role="tablist" className="insight-tabs" aria-label="Workspace panels">{(['findings','edit','review'] as const).map(t=><button type="button" key={t} role="tab" aria-selected={tab===t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t==='findings'?'Findings':t==='edit'?'Edit text':'Manual review'}</button>)}</div>
      <div className="insights-scroll">{tab==='findings'&&<><div className="panel-heading"><div><h2>Page {page} findings</h2><p>Each label reflects the evidence.</p></div><label><span className="sr-only">Filter findings</span><select value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="all">All</option><option value="verified">Verified</option><option value="potential">Potential</option><option value="manual">Manual</option></select></label></div>{findings.length?findings.map(f=><article className="finding" key={f.id}><div className="finding-label"><i className={f.kind}/>{titles[f.kind]} <small>{f.severity==='review'?'Review':f.severity+' priority'}</small></div><h3>{f.title}</h3><p>{f.description}</p><div className="recommendation"><strong>RECOMMENDED NEXT STEP</strong><p>{f.recommendation}</p></div></article>):<div className="panel-empty"><CheckCheck size={30}/><h3>No findings in this view</h3><p>This does not establish compliance. Use the review checklist.</p><button type="button" className="text-link" onClick={()=>setTab('review')}>Open manual review <ArrowRight size={16}/></button></div>}</>}
      {tab==='edit'&&<><div className="panel-heading"><div><h2>Review extracted text</h2><p>Page {page} · Edit content and semantic roles.</p></div></div><div className="inline-notice"><Info size={17}/>Extraction may change the order of text, columns or equations. Compare with the original.</div>{blocks.filter(b=>b.page===page).length?blocks.filter(b=>b.page===page).map(b=><div className="edit-block" key={b.id}><label htmlFor={'role-'+b.id}>Semantic role</label><select id={'role-'+b.id} value={b.kind} onChange={e=>update(b.id,{kind:e.target.value as EditableBlock['kind']})}><option value="paragraph">Paragraph</option><option value="heading">Heading (level 3)</option><option value="list">List item</option><option value="blockquote">Blockquote</option></select><label htmlFor={'text-'+b.id}>Extracted text</label><textarea id={'text-'+b.id} value={b.text} rows={Math.max(2,Math.min(6,Math.ceil(b.text.length/65)))} onChange={e=>update(b.id,{text:e.target.value})}/></div>):<div className="panel-empty"><AlertCircle/><h3>No text extracted</h3><p>This page may need separate OCR and human review.</p></div>}{current.imagePaintCount>0&&<div className="figure-note"><div><Image size={19}/><strong>Figure description note</strong></div><p>Images are not copied to HTML. A reviewed note will be included as separate text, not an alt attribute.</p><label htmlFor="figure-note">Human-reviewed description</label><textarea id="figure-note" rows={4} value={notes[page]||''} onChange={e=>{setNotes(n=>({...n,[page]:e.target.value}));setApproved(a=>{const next={...a};delete next[page];return next;});}}/><button type="button" className="button button-secondary" disabled={!notes[page]?.trim()} onClick={()=>{setApproved(a=>({...a,[page]:notes[page]}));setToast('Description note approved for HTML export.');}}><Check size={16}/> Approve note</button>{approved[page]&&<span className="approved">Approved for export</span>}</div>}</>}
      {tab==='review'&&<><div className="panel-heading"><div><h2>Manual review checklist</h2><p>{Object.values(done).filter(Boolean).length} of {checks.length} marked reviewed.</p></div></div><div className="inline-notice"><ClipboardCheck size={17}/>Checking a box records your progress in this session; it does not certify compliance.</div><div className="manual-list">{checks.map((text,i)=><label key={text}><input type="checkbox" checked={!!done[i]} onChange={e=>setDone(p=>({...p,[i]:e.target.checked}))}/><span>{text}</span></label>)}</div><div className="ai-card"><Sparkles size={20}/><div><strong>AI assistance is not connected</strong><p>No data is sent to AI providers. Future features will require consent and human approval.</p></div></div><h3 className="limitations-heading">Known limitations</h3><ul className="limitations">{inspection.limitations.map(text=><li key={text}>{text}</li>)}</ul></>}</div></section>
    </div>
    {toast&&<div role="status" className="toast"><Check size={17}/><span>{toast}</span><button type="button" aria-label="Dismiss" onClick={()=>setToast('')}>×</button></div>}
  </main>;
}
