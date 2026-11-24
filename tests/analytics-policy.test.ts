import {describe,it,expect} from 'vitest';import {canLoadAnalytics,readConsent,ANALYTICS_ORIGIN} from '../src/lib/analyticsPolicy';import worker from '../server/index';
describe('analytics consent and document isolation',()=>{
 it('only permits public marketing pages and safe campaign parameters',()=>{
 for(const p of ['/','/pricing','/guides/math-accessibility','/?utm_source=email&utm_campaign=launch'])expect(canLoadAnalytics(new URL(ANALYTICS_ORIGIN+p))).toBe(true);
 for(const p of ['/checker','/workspace','/account','/checkout','/privacy','/guides/unknown','/?email=a@b.com','/?utm_source=a%40b.com','/?utm_source=a&utm_source=b','/#secret'])expect(canLoadAnalytics(new URL(ANALYTICS_ORIGIN+p))).toBe(false);
 expect(canLoadAnalytics(new URL('http://localhost:4173/'))).toBe(false);
 });
 it('defaults to off and expires stale consent',()=>{
 expect(readConsent(null,100)).toBeNull();expect(readConsent('bad',100)).toBeNull();expect(readConsent(JSON.stringify({choice:'granted',at:10}),100)).toBe('granted');expect(readConsent(JSON.stringify({choice:'denied',at:10}),100)).toBe('denied');expect(readConsent(JSON.stringify({choice:'granted',at:10}),180*86400000+10)).toBeNull();
 });
 it('allows Google scripts only in marketing document CSP',async()=>{
 const env={ASSETS:{fetch:async()=>new Response('<html></html>',{headers:{'content-type':'text/html'}})}};
 for(const p of ['/','/pricing','/checker','/workspace','/account','/privacy','/?token=secret']){
 const r=await worker.fetch(new Request(ANALYTICS_ORIGIN+p),env);const csp=r.headers.get('content-security-policy')||'';
 expect(csp.includes('https://www.googletagmanager.com'),p).toBe(p==='/'||p==='/pricing');
 expect(csp).not.toContain("'unsafe-eval'");expect(csp).not.toContain('doubleclick.net');
 if(!['/','/pricing'].includes(p))expect(r.headers.get('referrer-policy')).toBe('no-referrer');
 }
 });
});
