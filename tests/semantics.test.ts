import {describe,it,expect} from 'vitest';
import {buildInspection,type PageEvidence} from '../src/lib/inspection';
import {parseTable,detectTableRows,formulaMathML,moveReadingBlock,auditReadingCopy} from '../src/lib/semantics';
import {semanticHtml} from '../src/lib/export';
import type {EditableBlock} from '../src/types';

const evidence:PageEvidence={number:1,width:612,height:792,lines:['A lecture about biology.'],sizes:[12,12,12],textItems:3,imagePaintCount:0,structureTree:false};

describe('professional remediation tables',()=>{
  it('parses tabular rows and rejects misleading inconsistent columns',()=>{
    expect(parseTable('Topic\tScore\nPhysics\t90\nBiology\t95')?.rows).toEqual([
      ['Topic','Score'],['Physics','90'],['Biology','95']
    ]);
    expect(parseTable('| Topic | Score |\n| Physics | 90 |')?.rows[0]).toEqual(['Topic','Score']);
    expect(parseTable('Topic\tScore\nPhysics')).toBeNull();
    expect(parseTable('just a sentence')).toBeNull();
  });
  it('conservatively proposes a table only with repeated structured evidence',()=>{
    const rows=['Part\tValue','A\t10','B\t20','After the table'];
    expect(detectTableRows(rows,0)?.rows).toHaveLength(3);
    expect(detectTableRows(['A\tB','x\ty'],0)).toBeNull();
    const report=buildInspection('scores.pdf',100,[{...evidence,lines:rows}]);
    expect(report.pages[0].blocks.map(b=>b.kind)).toEqual(['table','paragraph']);
  });
  it('exports navigable headers/captions and escapes hostile table data',()=>{
    const report=buildInspection('safe.pdf',100,[evidence]);
    const blocks:EditableBlock[]=[{id:'t',page:1,kind:'table',
      text:'Subject\tScore\nPhysics\t<svg onload=alert(1)>',description:'Assessment results'}];
    const html=semanticHtml(report,blocks);
    expect(html).toContain('<table><caption>Assessment results</caption><thead><tr><th scope="col">Subject</th>');
    expect(html).toContain('&lt;svg onload=alert(1)&gt;');
    expect(html).not.toContain('<svg');
  });
});
describe('semantic math',()=>{
  it('converts valid LaTeX into native MathML and rejects invalid commands',()=>{
    expect(formulaMathML('x^2+y^2=z^2')).toContain('<math');
    expect(formulaMathML('\\thisIsNotAFunction')).toBeNull();
    expect(formulaMathML('')).toBeNull();
  });
  it('escapes explanations and does not inject raw user markup',()=>{
    const report=buildInspection('math.pdf',100,[evidence]);
    const html=semanticHtml(report,[{id:'eq',page:1,kind:'equation',
      text:'\\sqrt{x^2+1}',description:'<img src=x onerror=alert(1)>'}]);
    expect(html).toContain('<math');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
  });
});
describe('reading-order and document quality engine',()=>{
  it('only swaps within one page and preserves block identity and text',()=>{
    const blocks:EditableBlock[]=[
      {id:'a',page:1,kind:'paragraph',text:'First'},
      {id:'b',page:1,kind:'paragraph',text:'Second'},
      {id:'c',page:2,kind:'paragraph',text:'Third'},
    ];
    expect(moveReadingBlock(blocks,'b',-1).map(b=>b.id)).toEqual(['b','a','c']);
    expect(moveReadingBlock(blocks,'b',1)).toEqual(blocks);
    expect(moveReadingBlock(blocks,'missing',1)).toEqual(blocks);
  });
  it('checks missing page text, weak tables, invalid math and reviewed figures without compliance claims',()=>{
    const report=buildInspection('exam.pdf',100,[
      {...evidence,imagePaintCount:1,ocr:{status:'recovered',language:'eng',confidence:45,characters:20}},
      {...evidence,number:2,lines:[],textItems:0},
    ]);
    const blocks:EditableBlock[]=[
      {id:'t',page:1,kind:'table',text:'A\tB\nx',description:''},
      {id:'m',page:1,kind:'equation',text:'\\thisIsNotAFunction',description:''},
    ];
    const qa=auditReadingCopy(report,blocks);
    expect(qa.status).toBe('attention-needed');
    expect(qa.missingTextPages).toBe(1);
    expect(qa.issues.some(i=>i.title==='Table needs consistent columns')).toBe(true);
    expect(qa.issues.some(i=>i.title==='Equation syntax invalid')).toBe(true);
    expect(qa.issues.some(i=>i.title==='Low-confidence OCR')).toBe(true);
    expect(qa.issues.some(i=>i.title==='Figure meaning not documented')).toBe(true);
    expect('pdfUaCertified' in qa).toBe(false);
  });
});
