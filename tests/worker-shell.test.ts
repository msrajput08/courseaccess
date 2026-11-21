import {describe,it,expect} from 'vitest';
import worker from '../server/index';
const assetCalls:string[]=[];
const env={
  ASSETS:{
    fetch:async(request:Request)=>{
      assetCalls.push(new URL(request.url).pathname);
      const path=new URL(request.url).pathname;
      if(path==='/index.html'||path==='/'||path==='/checker'||path==='/workspace'||path==='/pricing'||path==='/guides'||path.startsWith('/guides/')||path==='/privacy'||path==='/terms')return new Response('<!doctype html><html><body><script type="module" src="/assets/app-123.js"></script></body></html>',{
        headers:{'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=14400'}});
      if(path.includes('/assets/'))return new Response('export const ok=true;',{
        headers:{'content-type':'application/javascript'}});
      return new Response('Fallback',{status:404});
    }
  }
};
describe('Cloudflare navigation shell cache policy',()=>{
  it.each(['/','/checker','/workspace','/pricing','/guides','/guides/math-accessibility','/privacy','/terms'])(
    'serves %s via fresh index.html with no-store HTML headers',async path=>{
      assetCalls.length=0;
      const response=await worker.fetch(new Request('https://example.workers.dev'+path),env);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toMatch(/no-store/);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(await response.text()).toContain('src="/assets/app-123.js"');
      expect(assetCalls).toEqual([path]);
    }
  );
  it('does not turn hashed asset requests into HTML navigation shells',async()=>{
    assetCalls.length=0;
    const response=await worker.fetch(new Request('https://example.workers.dev/assets/app-123.js'),env);
    expect(response.headers.get('content-type')).toContain('javascript');
    expect(assetCalls).toEqual(['/assets/app-123.js']);
  });
  it('keeps API health JSON and robots outside the shell',async()=>{
    assetCalls.length=0;
    const response=await worker.fetch(new Request('https://example.workers.dev/api/health'),env);
    expect((await response.json())).toMatchObject({status:'ok',product:'CourseAccess'});
    expect(assetCalls).toEqual([]);
  });
});
