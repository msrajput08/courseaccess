/**
 * PDFKit 0.20.2 sometimes writes an optional, incorrect CIDSet bitmap for
 * embedded Noto Sans subsets. veraPDF detects it as PDF/UA-1 7.21.4.2.
 *
 * PDF/UA-1 does not require CIDSet, but *if supplied* it must be exact.
 * Remove that optional mapping from the newly GENERATED reading copy,
 * leaving embedded fonts, ToUnicode, and the logical structure tree intact.
 * This is NOT a generic repair function for arbitrary external PDFs.
 */
export async function removeOptionalCidSets(generated:Blob):Promise<Blob> {
  const {PDFDocument,PDFDict,PDFName}=await import('pdf-lib');
  const pdf=await PDFDocument.load(new Uint8Array(await generated.arrayBuffer()),{
    updateMetadata:false,
  });
  const cidSet=PDFName.of('CIDSet');
  const type=PDFName.of('Type');
  let changes=0;
  for(const [,object] of pdf.context.enumerateIndirectObjects()){
    if(!(object instanceof PDFDict))continue;
    if(object.get(type)?.toString()!=='/FontDescriptor')continue;
    if(!object.has(cidSet))continue;
    object.delete(cidSet);
    changes++;
  }
  // If no CIDSet was emitted, preserve the original bytes unchanged.
  if(changes===0)return generated;
  // Non-object-stream PDF keeps the structure tree transparent for inspection.
  const bytes=await pdf.save({useObjectStreams:false});
  return new Blob([new Uint8Array(bytes).buffer],{type:'application/pdf'});
}
