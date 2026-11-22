/**
 * Fail the release if a Cloudflare HTML shell refers to missing hashed
 * scripts/styles or if a JavaScript asset gets served as fallback HTML.
 * This detects Worker assets version skew before browser tests.
 */
import process from 'node:process';
const origin=(process.argv[2]||'').replace(/\/$/,'');
if(!/^https:\/\/[^/]+$/i.test(origin))throw Error('Expected a verified HTTPS deployment origin.');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const scriptPattern=/<script\b[^>]*type=["']module["'][^>]*src=["']([^"']+)["'][^>]*>/gi;
const cssPattern=/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
let error;
for(let attempt=1;attempt<=12;attempt++){
  try{
    const response=await fetch(origin+'/checker?release-preflight='+attempt,{headers:{'cache-control':'no-cache'}});
    if(!response.ok)throw Error('Navigation HTTP '+response.status);
    const cache=response.headers.get('cache-control')||'';
    if(!cache.includes('no-store'))throw Error('HTML navigation missing no-store caching policy: '+cache);
    const csp=response.headers.get('content-security-policy')||'';
    if(!csp.includes("default-src 'self'")||!csp.includes("object-src 'none'"))
      throw Error('Production HTML is missing the restrictive CSP.');
    const html=await response.text();
    const modules=[...html.matchAll(scriptPattern)].map(x=>x[1]);
    const css=[...html.matchAll(cssPattern)].map(x=>x[1]).filter(x=>!x.startsWith('https://'));
    if(!modules.length)throw Error('Deployed HTML contains no module entrypoints.');
    for(const [uri,kind] of [...modules.map(x=>[x,'js']),...css.map(x=>[x,'css'])]){
      const asset=await fetch(new URL(uri,origin),{headers:{'cache-control':'no-cache'}});
      const contentType=asset.headers.get('content-type')||'';
      if(!asset.ok||!(kind==='js'?/javascript|ecmascript/i.test(contentType):/text\/css/i.test(contentType))){
        throw Error('Asset mismatch: '+uri+' responded '+asset.status+' '+contentType);
      }
    }
    // Assert that first-party OCR resources were published as real static assets
    // and are never confused with the SPA HTML shell.
    for(const uri of ['/ocr/worker.min.js','/ocr/lang/eng.traineddata.gz']){
      const asset=await fetch(new URL(uri,origin),{method:'HEAD',headers:{'cache-control':'no-cache'}});
      const type=asset.headers.get('content-type')||'';
      if(!asset.ok||/text\/html/i.test(type))
        throw Error('First-party OCR asset missing or served as HTML: '+uri+' -> '+asset.status+' '+type);
    }
    console.log('Deployment assets verified on attempt '+attempt+': '+modules.length+' JS + '+css.length+' stylesheets; CSP, HTML cache and OCR static resources verified.');
    process.exit(0);
  }catch(e){
    error=e;
    console.warn('Cloudflare asset preflight attempt '+attempt+': '+String(e));
    if(attempt<12)await wait(2000);
  }
}
throw new Error('Deployed assets failed release verification: '+String(error));
