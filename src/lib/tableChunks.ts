/** Split imported tabular rows without truncating content silently.
 * Each chunk remains within the current editable-block character and row limits.
 * The end index is exclusive; callers can retain the exact source range.
 */
export interface TableChunk {
  start:number;
  end:number;
  text:string;
}
export function chunkDelimitedRows(
  rows:readonly (readonly string[])[],maxRows=190,maxChars=12_000,
):TableChunk[]{
  if(!Number.isInteger(maxRows)||maxRows<1||!Number.isInteger(maxChars)||maxChars<1)
    throw new Error('Invalid table chunk limits.');
  const chunks:TableChunk[]=[];
  for(let start=0;start<rows.length;){
    let end=start,text='';
    while(end<rows.length&&end-start<maxRows){
      const line=rows[end].join('\t');
      if(line.length>maxChars)
        throw new Error('A table row exceeds the 12,000-character reading-block limit. Split wide source columns before importing.');
      if(end>start&&text.length+1+line.length>maxChars)break;
      text+=(end>start?'\n':'')+line;
      end++;
    }
    chunks.push({start,end,text});
    start=end;
  }
  return chunks;
}
