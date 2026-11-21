import { describe, expect, it } from 'vitest';
import { normalizeOcrResult, shouldOcrPage } from '../src/lib/ocr';

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
});
