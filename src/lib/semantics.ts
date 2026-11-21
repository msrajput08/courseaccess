import katex from 'katex';
import type { EditableBlock, Inspection } from '../types';

export interface ParsedTable { rows:string[][]; caption?:string; skipCaption?:boolean }
const MAX_ROWS=200,MAX_COLS=16,MAX_CELL=750;

export function parseTable(text:string): ParsedTable | null {
  const source=text.trim();
  if(!source || source.length>45_000)return null;
  const lines=source.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
  if(lines.length<2 || lines.length>MAX_ROWS)return null;
  const delimiter=lines.every(v=>v.includes('\t'))?'\t':lines.every(v=>v.includes('|'))?'|':null;
  if(!delimiter)return null;
  const rows=lines.map(line=>{
    let s=line;
    if(delimiter==='|') s=s.replace(/^\s*\|/,'').replace(/\|\s*$/,'');
    return s.split(delimiter).map(cell=>cell.trim());
  });
  const width=rows[0]?.length??0;
  if(width<2 || width>MAX_COLS || rows.some(row=>row.length!==width || row.some(cell=>cell.length>MAX_CELL)))return null;
  if(rows.some(row=>row.every(cell=>!cell)))return null;
  return {rows};
}

/** Conservative automatic detection: at least 3 consecutive consistently delimited rows. */
export function detectTableRows(lines:string[],start:number):ParsedTable|null {
  if(start<0||start>=lines.length)return null;
  const first=lines[start];
  if(!first.includes('\t')&&!first.includes('|'))return null;
  const group:string[]=[];
  for(let i=start;i<Math.min(lines.length,start+MAX_ROWS);i++){
    const next=[...group,lines[i]];
    const parsed=next.length>=2?parseTable(next):null;
    if(next.length===2&&!parsed)break;
    if(next.length>2&&!parsed)break;
    group.push(lines[i]);
  }
  if(group.length<3)return null;
  const parsed=parseTable(group);
  if(!parsed)return null;
  // Only require a descriptive caption when the source explicitly includes it.
  return parsed;
}

/** Math markup is generated from supported LaTeX, not untrusted raw HTML/XML. */
export function formulaMathML(latex:string):string|null {
  if(!latex.trim()||latex.length>2000)return null;
  try{
    const html=katex.renderToString(latex,{output:'mathml',throwOnError:true,trust:false,strict:'warn',maxExpand:200});
    return html.includes('<math')?html:null;
  }catch{return null;}
}

export function moveReadingBlock(blocks:EditableBlock[],id:string,direction:-1|1):EditableBlock[] {
  const index=blocks.findIndex(b=>b.id===id);
  if(index<0)return blocks;
  const other=index+direction;
  if(other<0 || other>=blocks.length||blocks[other].page!==blocks[index].page)return blocks;
  const next=[...blocks];
  [next[index],next[other]]=[next[other],next[index]];
  return next;
}

export interface QualityIssue {
  id:string;
  page:number;
  level:'needs-attention'|'improvement';
  title:string;
  detail:string;
}
export interface QualityAudit {
  pageCount:number;
  checksPassed:number;
  issues:QualityIssue[];
  reviewedFigurePages:number;
  structuredTables:number;
  mathExpressions:number;
  missingTextPages:number;
  /** Diagnostic status, never a conformance score or certificate. */
  status:'attention-needed'|'prepared-with-checks';
}
export function auditReadingCopy(
  report:Inspection,blocks:EditableBlock[],approved:Record<number,string>={}
):QualityAudit {
  const issues:QualityIssue[]=[];
  const add=(page:number,id:string,title:string,detail:string,level:'needs-attention'|'improvement'='needs-attention')=>{
    issues.push({page,id:'p'+page+'-'+id,level,title,detail});
  };
  let structuredTables=0,mathExpressions=0,missingTextPages=0,reviewedFigurePages=0;
  let checksPassed=0;
  for(const page of report.pages){
    const current=blocks.filter(b=>b.page===page.number&&b.text.trim());
    if(!current.length){missingTextPages++;add(page.number,'missing','No readable text in reading copy','Try OCR or add accurate text in the editor.');}
    else checksPassed++;
    if(page.ocr?.status==='recovered' && (page.ocr.confidence||0)<70){
      add(page.number,'ocr-confidence','Low-confidence OCR','Recognized text needs checking against the original scan.','improvement');
    }else checksPassed++;
    if(page.imagePaintCount>0){
      if(approved[page.number]?.trim()){reviewedFigurePages++;checksPassed++;}
      else add(page.number,'figure','Figure meaning not documented','If the page contains a meaningful diagram or chart, add and approve its description.','improvement');
    }
    let lastHeading=2;
    for(const block of current){
      if(block.kind==='heading') {
        const level=block.headingLevel||3;
        if(level-lastHeading>1)add(page.number,block.id,'Heading level jumps','Use a sequential heading hierarchy without skipping levels.','improvement');
        lastHeading=level;
      }
      if(block.kind==='table'){
        if(!parseTable(block.text)){add(page.number,block.id,'Table needs consistent columns','Enter tab- or pipe-delimited rows with a header and at least one data row.');}
        else{structuredTables++;checksPassed++;}
        if(!block.description?.trim())add(page.number,block.id+'-caption','Table caption missing','Write a descriptive table caption.','improvement');
      }
      if(block.kind==='equation'){
        mathExpressions++;
        if(!formulaMathML(block.text)){add(page.number,block.id,'Equation syntax invalid','Enter a valid LaTeX equation so the HTML export can include MathML.');}
        else checksPassed++;
        if(!block.description?.trim())add(page.number,block.id+'-speech','Math explanation missing','Provide a short, accurate spoken explanation of the equation.','improvement');
      }
    }
  }
  const blockers=issues.some(issue=>issue.level==='needs-attention');
  return {pageCount:report.pageCount,checksPassed,issues,reviewedFigurePages,structuredTables,mathExpressions,
    missingTextPages,status:blockers?'attention-needed':'prepared-with-checks'};
}