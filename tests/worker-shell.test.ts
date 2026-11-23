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
  it('returns security and browser privacy headers on every public response',async()=>{
    for(const route of ['/', '/checker', '/api/health', '/api/plans', '/sitemap.xml', '/robots.txt', '/assets/app-123.js']){
      const response=await worker.fetch(new Request('https://example.workers.dev'+route),env);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
      expect(response.headers.get('permissions-policy')).toContain('camera=()');
      const csp=response.headers.get('content-security-policy')||'';
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("worker-src 'self' blob:");
      expect(csp).toContain("'wasm-unsafe-eval'");
      expect(csp).not.toContain("'unsafe-eval'");
    }
  });
  it('does not turn hashed asset requests into HTML navigation shells',async()=>{
    assetCalls.length=0;
    const response=await worker.fetch(new Request('https://example.workers.dev/assets/app-123.js'),env);
    expect(response.headers.get('content-type')).toContain('javascript');
    expect(assetCalls).toEqual(['/assets/app-123.js']);
  });
  it('fails closed for account and organization writes when no trusted D1 binding is configured',async()=>{
    const origin='https://example.workers.dev';
    const status=await worker.fetch(new Request(origin+'/api/auth/status'),env);
    expect(await status.json()).toMatchObject({enabled:false,billingEnabled:false});
    const registration=await worker.fetch(new Request(origin+'/api/auth/register/options',{
      method:'POST',headers:{'content-type':'application/json',origin},
      body:JSON.stringify({displayName:'Teacher Account'})
    }),env);
    expect(registration.status).toBe(503);
    const orgs=await worker.fetch(new Request(origin+'/api/organizations'),env);
    expect(orgs.status).toBe(503);
    const accountShell=await worker.fetch(new Request(origin+'/account'),env);
    expect(accountShell.headers.get('cache-control')).toMatch(/no-store/);
  });
  it('keeps API health JSON and robots outside the shell',async()=>{
    assetCalls.length=0;
    const response=await worker.fetch(new Request('https://example.workers.dev/api/health'),env);
    expect((await response.json())).toMatchObject({status:'ok',product:'CourseAccess'});
    expect(assetCalls).toEqual([]);
  });
});
