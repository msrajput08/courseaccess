import {describe,it,expect} from 'vitest';
import {detectDocumentFormat,ZIP_FORMATS,sectionUnit} from '../src/lib/formats';
import {parseDelimited} from '../src/lib/importDocument';
import {safeStem} from '../src/lib/export';
import {chunkDelimitedRows,chunkTabularRows,serializeTableRow} from '../src/lib/tableChunks';
describe('multiformat import safety and detection',()=>{
  it('supports common modern documents and rejects unknown files',()=>{
    expect(detectDocumentFormat('Course.DOCX')).toBe('docx');
    expect(detectDocumentFormat('presentation.pptx')).toBe('pptx');
    expect(detectDocumentFormat('marks.xlsx')).toBe('xlsx');
    expect(detectDocumentFormat('open.odt')).toBe('odt');
    expect(detectDocumentFormat('book.epub')).toBe('epub');
    expect(detectDocumentFormat('capture.png')).toBe('png');
    expect(detectDocumentFormat('malicious.exe')).toBeNull();
    expect(detectDocumentFormat('old.doc')).toBeNull();
    expect(ZIP_FORMATS.has('docx')).toBe(true);
    expect(sectionUnit('pptx')).toBe('slides');
  });
  it('handles CSV quoted commas, line breaks and escaped quotes',()=>{
    expect(parseDelimited('Name,Note\n"Sam, K","Hi ""friend"""\nKate,Done',',')).toEqual([
      ['Name','Note'],['Sam, K','Hi "friend"'],['Kate','Done']
    ]);
    expect(parseDelimited('A\tB\n1\t2','\t')).toEqual([['A','B'],['1','2']]);
    expect(()=>parseDelimited('"Unclosed,field',',')).toThrow(/unclosed/i);
  });
  it('parses UTF-8 BOM, mixed line endings and multi-line quoted fields without corrupting records',()=>{
    expect(parseDelimited('\uFEFFName,Note\r\nSam,"line one\r\nline two"\rJo,Done\n',',')).toEqual([
      ['Name','Note'],['Sam','line one\r\nline two'],['Jo','Done']
    ]);
    expect(parseDelimited('A,B\n\nC,D',',')).toEqual([
      ['A','B'],[''],['C','D']
    ]);
    expect(parseDelimited('a\tb\r1\t2','\t')).toEqual([['a','b'],['1','2']]);
  });
  it('rejects malformed quoted data rather than silently joining the wrong fields',()=>{
    expect(()=>parseDelimited('A,B\n"quoted"value,other',',')).toThrow(/closing quote/i);
    expect(()=>parseDelimited('A,B\nmissing"quote,other',',')).toThrow(/quote.*unquoted/i);
    expect(()=>parseDelimited('A,B\n"unterminated',',')).toThrow(/unclosed/i);
    expect(()=>parseDelimited(Array(130).fill('cell').join(','),',')).toThrow(/128/);
  });
  it('splits tall, text-heavy table blocks without truncation or row loss',()=>{
    const rows=Array.from({length:150},(_,index)=>[
      'Student '+index,'Repeated course details '+index+' '+('x'.repeat(150))
    ]);
    const chunks=chunkDelimitedRows(rows);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map(c=>c.text).join('\n')).toBe(rows.map(row=>row.join('\t')).join('\n'));
    expect(chunks.every(c=>c.text.length<=12_000&&c.end-c.start<=190)).toBe(true);
    expect(chunks[0].start).toBe(0);
    expect(chunks.at(-1)?.end).toBe(rows.length);
    expect(()=>chunkDelimitedRows([['x'.repeat(12_001)]])).toThrow(/row exceeds/i);
  });
  it('retains quoted multiline CSV fields without creating fake table rows or columns',()=>{
    const cells=['Research note','A first line\r\nsecond line with\ttab','Another\nline'];
    const line=serializeTableRow(cells);
    expect(line.split('\t')).toHaveLength(3);
    expect(line).toContain('first line\u2028second line with\u2003tab');
    expect(line).toContain('Another\u2028line');
    const chunks=chunkTabularRows([['Header','Notes'],['Student','Line one\nLine two']]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text.split('\n')).toHaveLength(2);
    expect(chunks[0].text).toContain('Line one\u2028Line two');
  });
  it('repeats the actual column headings for continued data tables',()=>{
    const rows=[['Student','Score'],...Array.from({length:100},(_,i)=>['Learner '+i,String(i)])];
    const chunks=chunkTabularRows(rows,15,300);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every(c=>c.text.startsWith('Student\tScore\n'))).toBe(true);
    const uniqueData=chunks.flatMap(c=>c.text.split('\n').slice(1));
    expect(uniqueData).toEqual(rows.slice(1).map(row=>row.join('\t')));
    expect(chunks.every(c=>c.text.length<=300)).toBe(true);
  });
  it('exports filenames from any imported source extension',()=>{
    expect(safeStem('Biology Lecture.docx')).toBe('Biology-Lecture');
    expect(safeStem('grades.xlsx')).toBe('grades');
    expect(safeStem('slides.pptx')).toBe('slides');
  });
});
