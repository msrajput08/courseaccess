import { describe, expect, it } from 'vitest';
import { normalizeOcrResult, normalizeOcrBoxes, shouldOcrPage } from '../src/lib/ocr';
import { searchablePages, textPlacement } from '../src/lib/searchablePdf';
import { buildInspection } from '../src/lib/inspection';

describe('real OCR routing and evidence',()=>{
  it('avoids OCR on blank non-image and existing searchable text pages',()=>{
    expect(shouldOcrPage(0,0,true)).toBe(false);
    expect(shouldOcrPage(8,1,true)).toBe(false);
    expect(shouldOcrPage(0,1,false)).toBe(false);
    expect(shouldOcrPage(0,1,true)).toBe(true);
  });
  it('keeps normalized OCR text and provenance distinct from original PDF text',()=>{
    const r=normalizeOcrResult('eng','  Biology notes  \n\n Cell nucleus. ',82);
    expect(r.ocr).toMatchObject({status:'recovered',language:'eng',confidence:82});
    expect(r.lines).toEqual(['Biology notes','Cell nucleus.']);
    expect(r.ocr.characters).toBeGreaterThan(20);
  });
  it('rejects noise and low confidence instead of presenting it as recovered content',()=>{
    expect(normalizeOcrResult('eng','I',99).ocr.status).toBe('empty');
    expect(normalizeOcrResult('eng','not a reliable transcription',5).lines).toEqual([]);
    expect(normalizeOcrResult('hin','कक्षा का पाठ',80).ocr.language).toBe('hin');
  });

  it('marks very long OCR transcripts unavailable instead of falsely returning the first 400 lines',()=>{
    const source=Array.from({length:401},(_,i)=>'Verified source line '+i).join('\n');
    const report=normalizeOcrResult('eng',source,95);
    expect(report.ocr.status).toBe('failed');
    expect(report.lines).toEqual([]);
    expect(report.ocr.characters).toBe(0);
  });
  it('normalizes valid OCR word geometry and drops invalid low-confidence positions',()=>{
    const raw=[{paragraphs:[{lines:[{words:[
      {text:'Biology',confidence:91,bbox:{x0:30,y0:20,x1:160,y1:50}},
      {text:'wrong',confidence:4,bbox:{x0:30,y0:60,x1:150,y1:80}},
      {text:'outside',confidence:98,bbox:{x0:30,y0:50,x1:900,y1:95}},
    ]}]}]}];
    expect(normalizeOcrBoxes(raw,600,200)).toEqual([
      {text:'Biology',confidence:91,x:0.05,y:0.1,width:130/600,height:0.15}
    ]);
    expect(normalizeOcrBoxes([],100,100)).toEqual([]);
    expect(normalizeOcrBoxes(raw,0,200)).toEqual([]);
  });
  it('maps OCR top-left positions into PDF bottom-left crop coordinates',()=>{
    const p=textPlacement({text:'Biology',confidence:91,x:0.1,y:0.2,width:0.3,height:0.1},
      {x:10,y:20,width:600,height:800});
    expect(p).toEqual({x:70,y:580,width:180,height:80});
    expect(textPlacement({text:'Bad',confidence:90,x:-0.2,y:0,width:0.5,height:0.1},
      {x:0,y:0,width:100,height:100})).toBeNull();
  });
  it('offers searchable copy only when OCR has words and no source tag tree',()=>{
    const report=buildInspection('scan.pdf',100,[{
      number:1,width:612,height:792,lines:['Hello'],sizes:[],textItems:0,imagePaintCount:1,
      ocr:{status:'recovered',language:'eng',confidence:92,characters:5,words:[
        {text:'Hello',confidence:92,x:0.1,y:0.2,width:0.3,height:0.1}
      ]},structureTree:false
    },{
      number:2,width:612,height:792,lines:['Original selectable text'],sizes:[],textItems:3,
      imagePaintCount:0,structureTree:true
    }]);
    expect(searchablePages(report)).toEqual([1]);
  });
});
