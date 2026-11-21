export function makePdf(texts:string[]):Buffer {
  const pageIds=texts.map((_,i)=>4+i*2);
  const objects:string[]=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids ['+pageIds.map(id=>id+' 0 R').join(' ')+'] /Count '+texts.length+' >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  for(let i=0;i<texts.length;i++){
    const content=texts[i]?'BT /F1 12 Tf 65 730 Td ('+texts[i].replace(/[()\\]/g,'')+') Tj ET':'';
    const stream='<< /Length '+Buffer.byteLength(content,'latin1')+' >>\nstream\n'+content+'\nendstream';
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents '+(5+i*2)+' 0 R >>');
    objects.push(stream);
  }
  let pdf='%PDF-1.4\n';
  const offsets=[0];
  for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf,'latin1'));pdf+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}
  const start=Buffer.byteLength(pdf,'latin1');
  pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
  for(const offset of offsets.slice(1))pdf+=String(offset).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF';
  return Buffer.from(pdf,'latin1');
}

export function makeImageOnlyPdf():Buffer {
  const drawing='q 100 0 0 100 72 650 cm /Im1 Do Q';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 6 0 R >> >> /Contents 5 0 R >>',
    '<< /Length '+Buffer.byteLength(drawing,'latin1')+' >>\nstream\n'+drawing+'\nendstream',
    '<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length 7 >>\nstream\nFF0000>\nendstream',
  ];
  let pdf='%PDF-1.4\n';
  const offsets=[0];
  objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(pdf,'latin1'));pdf+=(index+1)+' 0 obj\n'+object+'\nendobj\n';});
  const start=Buffer.byteLength(pdf,'latin1');
  pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
  for(const offset of offsets.slice(1))pdf+=String(offset).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF';
  return Buffer.from(pdf,'latin1');
}


/** A tiny actual PDF with differently sized text and explicit bullet lines. */
export function makeStyledPdf(): Buffer {
  const drawing = [
    'BT /F1 24 Tf 65 740 Td (Cell Biology) Tj ET',
    'BT /F1 11 Tf 65 705 Td (Introduction to cell structures.) Tj ET',
    'BT /F1 11 Tf 65 675 Td (- Mitosis) Tj ET',
    'BT /F1 11 Tf 65 652 Td (- Meiosis) Tj ET',
    'BT /F1 11 Tf 65 625 Td (Lecture summary and next steps.) Tj ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
    '<< /Length '+Buffer.byteLength(drawing,'latin1')+' >>\nstream\n'+drawing+'\nendstream',
  ];
  let pdf='%PDF-1.4\n';
  const offsets=[0];
  for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf,'latin1'));pdf+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}
  const start=Buffer.byteLength(pdf,'latin1');
  pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
  for(const offset of offsets.slice(1))pdf+=String(offset).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF';
  return Buffer.from(pdf,'latin1');
}


/** An actual image-only PDF with embedded JPEG pixel data, no hidden text layer. */
export function makeScannedJpegPdf(jpeg:Buffer,width=900,height=260):Buffer {
  const imageHeader=Buffer.from('<< /Type /XObject /Subtype /Image /Width '+width+
    ' /Height '+height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n','latin1');
  const image=Buffer.concat([imageHeader,jpeg,Buffer.from('\nendstream','latin1')]);
  const drawing='q 525 0 0 152 46 565 cm /Scan Do Q';
  const objects:Buffer[]=[
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>','latin1'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>','latin1'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Scan 5 0 R >> >> /Contents 4 0 R >>','latin1'),
    Buffer.from('<< /Length '+Buffer.byteLength(drawing,'latin1')+' >>\nstream\n'+drawing+'\nendstream','latin1'),
    image,
  ];
  const parts:Buffer[]=[Buffer.from('%PDF-1.4\n','latin1')];
  const positions=[0];
  let offset=parts[0].length;
  for(let i=0;i<objects.length;i++){
    const object=Buffer.concat([Buffer.from((i+1)+' 0 obj\n','latin1'),objects[i],Buffer.from('\nendobj\n','latin1')]);
    positions.push(offset);
    parts.push(object);offset+=object.length;
  }
  const xrefOffset=offset;
  parts.push(Buffer.from('xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+
    positions.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n \n').join('')+
    'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xrefOffset+'\n%%EOF','latin1'));
  return Buffer.concat(parts);
}
