import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowDownToLine, ArrowLeft, ArrowRight, Check, CheckCheck, ClipboardCheck, FileCode2, FileText, Image, Info, LockKeyhole, Save, ShieldCheck } from 'lucide-react';
import { PRODUCT } from '../config';
import { summarizeAutomation } from '../lib/inspection';
import { searchablePages } from '../lib/searchablePdf';
import { downloadReport, downloadText, downloadBlob, safeStem, semanticHtml } from '../lib/export';
import { rememberMetadata } from '../lib/history';
import type { EditableBlock, FindingKind, Inspection } from '../types';

const titles: Record<FindingKind, string> = {verified:'Verified observation',potential:'Potential issue',manual:'Human review'};
function guidedChecks(inspection: Inspection): string[] {
  const tasks: string[] = [];
  if (inspection.pages.some((p) => !p.text.trim())) tasks.push('Recover text for the pages with no selectable content. Use the Add recovered text control on each affected page.');
  if (inspection.findings.some((f) => f.category === 'visual')) tasks.push('Confirm the purpose of the detected images. Add concise descriptions for meaningful figures.');
  if (inspection.findings.some((f) => f.category === 'stem')) tasks.push('Compare flagged equations with the source; preserve symbols, exponents and mathematical meaning.');
  if (inspection.findings.some((f) => f.category === 'structure')) tasks.push('Inspect referenced tables and the proposed heading structure where flagged.');
  tasks.push('Spot-check the exported reading sequence against the source PDF, particularly if it has columns or footnotes.');
  return tasks;
}
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
  const [recovered,setRecovered]=useState<Record<number,string>>({});
  const automation=summarizeAutomation(inspection);
  const tasks=guidedChecks(inspection);
  const [toast,setToast]=useState('');
  const [pdfExporting,setPdfExporting]=useState(false);
  const [sourceExporting,setSourceExporting]=useState(false);
  const searchable=searchablePages(inspection);
  const findings=inspection.findings.filter(f=>f.page===page&&(filter==='all'||filter===f.kind));
  const current=inspection.pages[page-1];
  const update=(id:string,patch:Partial<EditableBlock>)=>setBlocks(prev=>prev.map(b=>b.id===id?{...b,...patch}:b));
  function addRecoveredText(){
    const additions=(recovered[page]||'').split(/\n+/).map(t=>t.trim()).filter(Boolean).slice(0,200);
    if(!additions.length)return;
    setBlocks(prev=>[...prev,...additions.map((text,i)=>({id:'p'+page+'-recovered-'+Date.now()+'-'+i,page,kind:'paragraph' as const,text}))]);
    setRecovered(prev=>({...prev,[page]:''}));
    setToast('Recovered text added to the editable HTML draft.');
  }
  function save(){try{rememberMetadata(inspection);onSaved();setToast('Saved only document metadata in this browser. No PDF or text was stored.');}catch{setToast('Local storage was unavailable; no data was saved.');}}
  function html(){downloadText(safeStem(inspection.name)+'-reviewed.html',semanticHtml(inspection,blocks,approved),'text/html;charset=utf-8');setToast('Semantic HTML reading copy downloaded.');}
  async function taggedPdf(){
    if(pdfExporting)return;
    setPdfExporting(true);setToast('Building tagged PDF reading copy locally…');
    try {
      const {buildTaggedReadingPdf}=await import('../lib/taggedPdf');
      const blob=await buildTaggedReadingPdf(inspection,blocks,approved);
      downloadBlob(safeStem(inspection.name)+'-tagged-reading.pdf',blob);
      setToast('Tagged reading PDF downloaded. Original PDF remains unchanged.');
    }catch(err){
      setToast(err instanceof Error?'PDF export failed: '+err.message:'Tagged PDF export failed.');
    }finally{setPdfExporting(false);}
  }
  async function searchablePdf() {
    if(sourceExporting)return;
    setSourceExporting(true);
    setToast('Placing recognized words over scanned pages without changing their appearance…');
    try{
      const {buildSearchableSourcePdf}=await import('../lib/searchablePdf');
      const result=await buildSearchableSourcePdf(file,inspection);
      downloadBlob(safeStem(inspection.name)+'-searchable-original-layout.pdf',result.pdf);
      setToast('Searchable visual copy downloaded: '+result.pages+' scanned page(s), '+result.words+' positioned OCR words. This is not a tagged PDF.');
    }catch(error){
      setToast(error instanceof Error?'Searchable PDF export failed: '+error.message:'Searchable PDF export failed.');
    }finally{setSourceExporting(false);}
  }
  return <main className="workspace shell">
    <div className="workspace-top"><button className="text-button" onClick={onNew} type="button"><ArrowLeft size={16}/> New inspection</button><div className="workspace-actions"><button className="button button-quiet" type="button" onClick={save}><Save size={16}/> Save metadata</button><button className="button button-quiet" type="button" onClick={()=>downloadReport(inspection,blocks,approved)}><ArrowDownToLine size={16}/> Report JSON</button><button className="button button-quiet" type="button" onClick={html}><FileCode2 size={16}/> Export HTML</button><button className="button button-primary" type="button" disabled={pdfExporting} onClick={()=>void taggedPdf()}><FileText size={16}/>{pdfExporting?'Building PDF…':'Download tagged PDF'}</button>{searchable.length>0&&<button type="button" className="button button-secondary" disabled={sourceExporting} onClick={()=>void searchablePdf()}><FileText size={16}/>{sourceExporting?'Building searchable PDF…':'Keep layout + searchable OCR'}</button>}</div></div>
    <div className="workspace-intro"><div><span className="eyebrow">INSPECTION / LOCAL DOCUMENT</span><h1>{inspection.name}</h1><p>Automatic OCR when needed, editable structure, and accessible-first exports—in one workspace.</p></div><span className="private-tag"><LockKeyhole size={15}/> Document stays on this device</span></div>
    <div className="automation-summary" role="region" aria-label="Automated document preparation"><div><span className="eyebrow">AUTOMATED DOCUMENT PREPARATION</span><h2>Reading draft prepared.</h2><p>Text recovered from <strong>{automation.textPages} of {inspection.pageCount} pages</strong>. The checker proposed <strong>{automation.proposedHeadings} heading{automation.proposedHeadings===1?'':'s'}</strong> and <strong>{automation.proposedLists} list item{automation.proposedLists===1?'':'s'}</strong> using observable text formatting. {automation.missingTextPages.length>0?`${automation.missingTextPages.length} page(s) still need text.`:'No missing-text pages detected.'} {automation.ocrRecoveredPages>0?`${automation.ocrRecoveredPages} scanned page(s) recovered by OCR.`:''} {automation.ocrFailedPages>0?`${automation.ocrFailedPages} page(s) could not be recognized.`:''}</p><small>Choose a semantic tagged reading PDF, HTML, or—when OCR geometry exists—a visual-layout-preserving searchable PDF copy. The original file stays unchanged.</small></div><button type="button" className="button button-secondary" onClick={()=>{setTab('edit');setPage(automation.missingTextPages[0]||1);}}>Improve draft <ArrowRight size={16}/></button></div>
    {searchable.length>0&&<div className="searchable-banner" role="region" aria-label="Original-layout searchable PDF">
      <div><span className="eyebrow">NEW · SEARCHABLE SOURCE COPY</span><h2>Keep the design. Recover the words.</h2>
      <p>{searchable.length} image-based page(s) have positional OCR data. The original page artwork is retained, with an invisible selectable OCR text layer on top. Unlike the tagged reading PDF, this option does not produce a tagged or PDF/UA-conformant PDF.</p>
      <small>Best for scanned pages. OCR words are from the initial scan: subsequent text edits belong to the tagged reading copy and HTML, not the positioned overlay.</small></div>
      <button type="button" className="button button-secondary" disabled={sourceExporting} onClick={()=>void searchablePdf()}>{sourceExporting?'Preparing…':'Download searchable copy'} <ArrowRight size={16}/></button>
    </div>}
    <div className="stats-row"><div><strong>{inspection.pageCount}</strong><span>Pages</span></div><div><strong>{inspection.findings.filter(f=>f.kind==='verified').length}</strong><span>Verified observations</span></div><div><strong>{inspection.findings.filter(f=>f.kind==='potential').length}</strong><span>Potential issues</span></div><div><strong>{inspection.findings.filter(f=>f.kind==='manual').length}</strong><span>Focused follow-ups</span></div><div className="stats-caveat"><Info size={17}/> Not a compliance score</div></div>
    <div className="editor-layout">
      <aside className="editor-rail"><span className="rail-label">DOCUMENT PAGES</span>{inspection.pages.map(p=><button key={p.number} type="button" className={'page-link '+(p.number===page?'selected':'')} aria-current={p.number===page?'page':undefined} onClick={()=>setPage(p.number)}><span>Page {String(p.number).padStart(2,'0')}</span><small>{inspection.findings.filter(f=>f.page===p.number).length}</small></button>)}<div className="rail-note"><ShieldCheck size={21}/><strong>Fix what matters.</strong><p>Jump straight to pages with detected text gaps and layout cues.</p></div></aside>
      <section className="preview-column" aria-label="PDF visual preview"><div className="column-heading"><span><FileText size={16}/> Source PDF</span><span>Page {page} of {inspection.pageCount}</span></div><div className="preview-area"><Preview file={file} pageNumber={page}/></div>{current.ocr&&<div className="ocr-evidence" role="status"><strong>{current.ocr.status==='recovered'?'OCR text recovered':current.ocr.status==='empty'?'OCR found no readable words':'OCR could not run'}</strong><span>{current.ocr.status==='recovered'?current.ocr.characters+' characters · Confidence '+Math.round(current.ocr.confidence||0)+'% · Check technical terms before sharing.':'Add an existing transcription in Edit text if the page has information.'}</span></div>}<div className="pager"><button type="button" aria-label="Previous page" disabled={page<=1} onClick={()=>setPage(p=>p-1)}><ArrowLeft size={17}/></button><span>Visual reference</span><button type="button" aria-label="Next page" disabled={page>=inspection.pageCount} onClick={()=>setPage(p=>p+1)}><ArrowRight size={17}/></button></div></section>
      <section className="insights-column" aria-label="Accessibility findings and editor"><div role="tablist" className="insight-tabs" aria-label="Workspace panels" onKeyDown={e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;e.preventDefault();const tabs=['findings','edit','review'] as const;const index=tabs.indexOf(tab);const next=(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;setTab(tabs[next]);e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();}}>{(['findings','edit','review'] as const).map(t=><button type="button" key={t} role="tab" id={'courseaccess-tab-'+t} aria-controls="courseaccess-panel" aria-selected={tab===t} tabIndex={tab===t?0:-1} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t==='findings'?'Findings':t==='edit'?'Edit text':'Final checks'}</button>)}</div>
      <div className="insights-scroll" role="tabpanel" id="courseaccess-panel" aria-labelledby={'courseaccess-tab-'+tab} tabIndex={0}>{tab==='findings'&&<><div className="panel-heading"><div><h2>Page {page} findings</h2><p>Each label reflects the evidence.</p></div><label><span className="sr-only">Filter findings</span><select value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="all">All</option><option value="verified">Verified</option><option value="potential">Potential</option><option value="manual">Manual</option></select></label></div>{findings.length?findings.map(f=><article className="finding" key={f.id}><div className="finding-label"><i className={f.kind}/>{titles[f.kind]} <small>{f.severity==='review'?'Review':f.severity+' priority'}</small></div><h3>{f.title}</h3><p>{f.description}</p><div className="recommendation"><strong>RECOMMENDED NEXT STEP</strong><p>{f.recommendation}</p></div></article>):<div className="panel-empty"><CheckCheck size={30}/><h3>No findings in this view</h3><p>No issues matched this filter. The reading draft is still available to edit.</p><button type="button" className="text-link" onClick={()=>setTab('edit')}>Edit structured draft <ArrowRight size={16}/></button></div>}</>}
      {tab==='edit'&&<><div className="panel-heading"><div><h2>Review extracted text</h2><p>Page {page} · Edit content and semantic roles.</p></div></div><div className="inline-notice"><Info size={17}/>Heading sizes and visible bullets are auto-structured where confidently detected. All roles and text can be corrected here.</div>{blocks.filter(b=>b.page===page).length?blocks.filter(b=>b.page===page).map(b=><div className="edit-block" key={b.id}><label htmlFor={'role-'+b.id}>Semantic role</label><select id={'role-'+b.id} value={b.kind} onChange={e=>update(b.id,{kind:e.target.value as EditableBlock['kind']})}><option value="paragraph">Paragraph</option><option value="heading">Heading (level 3)</option><option value="list">List item</option><option value="blockquote">Blockquote</option></select><label htmlFor={'text-'+b.id}>Extracted text</label><textarea id={'text-'+b.id} value={b.text} rows={Math.max(2,Math.min(6,Math.ceil(b.text.length/65)))} onChange={e=>update(b.id,{text:e.target.value})}/></div>):<div className="panel-empty"><AlertCircle/><h3>No text extracted</h3><p>Use OCR from a trusted source or paste an existing accessible transcription to build the reading version right here.</p><label htmlFor="recovered-text">Add recovered page text</label><textarea id="recovered-text" rows={6} value={recovered[page]||''} onChange={e=>setRecovered(p=>({...p,[page]:e.target.value}))} placeholder="Paste accessible text for this page. Separate paragraphs with new lines."/><button type="button" className="button button-secondary" disabled={!recovered[page]?.trim()} onClick={addRecoveredText}>Add text to HTML draft <ArrowRight size={16}/></button></div>}{current.imagePaintCount>0&&<div className="figure-note"><div><Image size={19}/><strong>Figure description note</strong></div><p>Images are not copied to HTML. A reviewed note will be included as separate text, not an alt attribute.</p><label htmlFor="figure-note">Human-reviewed description</label><textarea id="figure-note" rows={4} value={notes[page]||''} onChange={e=>{setNotes(n=>({...n,[page]:e.target.value}));setApproved(a=>{const next={...a};delete next[page];return next;});}}/><button type="button" className="button button-secondary" disabled={!notes[page]?.trim()} onClick={()=>{setApproved(a=>({...a,[page]:notes[page]}));setToast('Description note approved for HTML export.');}}><Check size={16}/> Approve note</button>{approved[page]&&<span className="approved">Approved for export</span>}</div>}</>}
      {tab==='review'&&<><div className="panel-heading"><div><h2>Focused finishing checks</h2><p>{Object.values(done).filter(Boolean).length} of {tasks.length} completed for this document.</p></div></div><div className="inline-notice"><ClipboardCheck size={17}/>Only checks relevant to the current document are listed, plus one final reading-order spot check.</div><div className="manual-list">{tasks.map((text,i)=><label key={text}><input type="checkbox" checked={!!done[i]} onChange={e=>setDone(p=>({...p,[i]:e.target.checked}))}/><span>{text}</span></label>)}</div><div className="ai-card"><CheckCheck size={20}/><div><strong>Two reading formats available</strong><p>Download a tagged reading PDF or semantic HTML. Both include your corrected text and approved figure notes; the original PDF is unchanged.</p></div></div><details className="limitations-details"><summary>Technical coverage and limits</summary><ul className="limitations">{inspection.limitations.map(text=><li key={text}>{text}</li>)}</ul></details></>}</div></section>
    </div>
    {toast&&<div role="status" className="toast"><Check size={17}/><span>{toast}</span><button type="button" aria-label="Dismiss" onClick={()=>setToast('')}>×</button></div>}
  </main>;
}
