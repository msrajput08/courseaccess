import {describe,it,expect} from 'vitest';
import {detectDocumentFormat,ZIP_FORMATS,sectionUnit} from '../src/lib/formats';
import {parseDelimited} from '../src/lib/importDocument';
import {safeStem} from '../src/lib/export';
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
  it('exports filenames from any imported source extension',()=>{
    expect(safeStem('Biology Lecture.docx')).toBe('Biology-Lecture');
    expect(safeStem('grades.xlsx')).toBe('grades');
    expect(safeStem('slides.pptx')).toBe('slides');
  });
});
