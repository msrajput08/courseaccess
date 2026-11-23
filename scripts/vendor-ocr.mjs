import {copyFile, mkdir, readdir, stat} from 'node:fs/promises';
import {join} from 'node:path';

const root=process.cwd();
const destination=join(root,'public','ocr');
const languages=['eng','hin','spa','fra','deu'];
const CLOUDFLARE_ASSET_MAX=25*1024*1024;
async function copyStaticAsset(source,target){
  const file=await stat(source);
  if(!file.isFile()||file.size>CLOUDFLARE_ASSET_MAX)
    throw new Error('OCR static asset exceeds Cloudflare 25 MiB per-file cap: '+source);
  await copyFile(source,target);
}
const inside=(...paths)=>join(root,...paths);

async function findModel(base,lang){
  const scan=async(directory,depth)=>{
    if(depth>4)return [];
    let matches=[];
    for(const entry of await readdir(directory,{withFileTypes:true})){
      const full=join(directory,entry.name);
      if(entry.isDirectory())matches.push(...await scan(full,depth+1));
      else if(entry.isFile()&&entry.name===lang+'.traineddata.gz')matches.push(full);
    }
    return matches;
  };
  const models=await scan(base,0);
  // Best-int is the model line used by Tesseract.js CDN defaults.
  const best=models.find(path=>path.includes('best_int'))||models[0];
  if(!best)throw new Error('Missing packaged OCR language model: '+lang);
  return best;
}
async function main(){
  await mkdir(join(destination,'core'),{recursive:true});
  await mkdir(join(destination,'lang'),{recursive:true});
  const sourceWorker=inside('node_modules','tesseract.js','dist','worker.min.js');
  if(!(await stat(sourceWorker)).isFile())throw new Error('Tesseract worker missing');
  await copyStaticAsset(sourceWorker,join(destination,'worker.min.js'));

  const core=inside('node_modules','tesseract.js-core');
  const coreFiles=(await readdir(core)).filter(name=>name.startsWith('tesseract-core')&&
    (name.endsWith('.wasm')||name.endsWith('.wasm.js')));
  const scripts=coreFiles.filter(name=>name.endsWith('.wasm.js'));
  if(scripts.length<4 || coreFiles.filter(name=>name.endsWith('.wasm')).length<4)
    throw new Error('Incomplete local Tesseract core variants; refusing a CDN-only build.');
  for(const name of coreFiles)await copyStaticAsset(join(core,name),join(destination,'core',name));

  for(const lang of languages){
    const source=await findModel(inside('node_modules','@tesseract.js-data',lang),lang);
    await copyStaticAsset(source,join(destination,'lang',lang+'.traineddata.gz'));
  }
  console.log('First-party OCR assets prepared:',coreFiles.length,'core files,',languages.length,'language packs.');
}
await main();
