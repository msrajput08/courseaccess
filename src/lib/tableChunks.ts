/** Split imported tabular rows without truncating content silently.
 * Each chunk remains within the current editable-block character and row limits.
 * The end index is exclusive; callers can retain the exact source range.
 */
export interface TableChunk {
  start:number;
  end:number;
  text:string;
}
/** Encode embedded CSV cell line breaks/tabs without confusing a newline/tab
 * delimited semantic table. U+2028 remains a visible intra-cell line break;
 * U+2003 is a horizontal space that cannot be parsed as a new column.
 */
export function serializeTableRow(cells:readonly string[]):string{
  return cells.map(cell=>cell.replace(/\r\n|\r|\n/g,'\u2028').replace(/\t/g,'\u2003')).join('\t');
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
      const line=serializeTableRow(rows[end]);
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

/** Repeat the actual first-row header in every logical continuation table.
 * Avoid converting subsequent data rows into false column headings.
 * start/end still describe unique source data rows, without counting header repeats.
 */
export function chunkTabularRows(
  rows:readonly (readonly string[])[],maxRows=190,maxChars=12_000,
):TableChunk[]{
  if(rows.length<2)return chunkDelimitedRows(rows,maxRows,maxChars);
  const header=serializeTableRow(rows[0]);
  if(header.length>=maxChars || maxRows<2)
    throw new Error('Table header exceeds the available reading-block limit.');
  const data=chunkDelimitedRows(rows.slice(1),maxRows-1,maxChars-header.length-1);
  return data.map((chunk,index)=>({
    start:index===0?0:chunk.start+1,
    end:chunk.end+1,
    text:header+'\n'+chunk.text,
  }));
}
