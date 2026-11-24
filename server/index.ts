import {handleAccountApi} from './accountApi';
import {defaultPaymentPage} from './defaultPaymentPage';
import {handleBillingPortal} from './billingPortal';
import {handleLiveWebhook,retryPaddleInbox,handleBillingStatus,type BillingEnv,type BillingExecutionContext} from './billingApi';
import type {AccountEnv} from './accountSecurity';
import {parsePlans} from './entitlements';
import {handleEntitlements,handlePaidReviewHistory} from './paidAccess';
import {checkoutConfig,createCheckoutIntent} from './liveCheckout';
type Env=AccountEnv & BillingEnv & { ASSETS: {fetch:(request:Request)=>Promise<Response>}; COURSEACCESS_PLANS_JSON?:string; PADDLE_LIVE_CLIENT_TOKEN?:string; };
const jsonHeaders={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const knownPaths=['/','/checker','/pricing','/guides','/guides/pdf-accessibility-checker','/guides/accessible-lecture-notes','/guides/fix-inaccessible-pdfs','/guides/math-accessibility','/guides/academic-documents','/privacy','/terms','/refunds'];
const navigationPaths=new Set(['/','/checker','/workspace','/account','/pricing','/guides','/privacy','/terms','/refunds']);
function isAppNavigation(pathname:string):boolean {
  return navigationPaths.has(pathname)||pathname.startsWith('/guides/');
}
const contentSecurityPolicy=[
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
].join('; ');
const securityHeaders={
  'content-security-policy':contentSecurityPolicy,
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'referrer-policy':'strict-origin-when-cross-origin',
  'cross-origin-resource-policy':'same-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()',
};
function secure(response:Response):Response {
  const headers=new Headers(response.headers);
  for(const [name,value] of Object.entries(securityHeaders))headers.set(name,value);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function reply(value:unknown,status=200):Response{return secure(new Response(JSON.stringify(value),{status,headers:jsonHeaders}));}
function sitemap(host:string):string{return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+knownPaths.map(path=>'<url><loc>'+host+path+'</loc></url>').join('')+'</urlset>';}
export default {
  async scheduled(_controller:unknown,env:Env,ctx:BillingExecutionContext){ctx.waitUntil(retryPaddleInbox(env));},
  async fetch(request:Request,env:Env,ctx?:BillingExecutionContext):Promise<Response>{
    const url=new URL(request.url);
    if(url.pathname==='/checkout'&&(request.method==='GET'||request.method==='HEAD'))return defaultPaymentPage(request,env.PADDLE_LIVE_CLIENT_TOKEN);
    if(url.pathname==='/api/billing/webhook'&&request.method==='POST')return secure(await handleLiveWebhook(request,env,ctx));
    if(url.pathname==='/api/billing/portal'&&request.method==='POST')return secure(await handleBillingPortal(request,env));
    if(url.pathname==='/api/billing/status'&&request.method==='GET')return secure(await handleBillingStatus(request,env));
    if(url.pathname==='/api/health'&&request.method==='GET')return reply({status:'ok',product:'CourseAccess',documentStorage:false});
    if(url.pathname.startsWith('/api/auth/')||url.pathname.startsWith('/api/organizations'))return secure(await handleAccountApi(request,env));
    if(url.pathname==='/api/plans'&&request.method==='GET')return reply({plans:parsePlans(env.COURSEACCESS_PLANS_JSON),billingEnabled:false});
    if(url.pathname==='/api/entitlements'&&request.method==='GET')return secure(await handleEntitlements(request,env));
    if(url.pathname==='/api/billing/review-history'&&['GET','POST','DELETE'].includes(request.method))return secure(await handlePaidReviewHistory(request,env));
    if(url.pathname==='/api/billing/checkout-config'&&request.method==='GET')return secure(checkoutConfig(request,env));
    if(url.pathname==='/api/billing/checkout-intent'&&request.method==='POST')return secure(await createCheckoutIntent(request,env));
    if(url.pathname.startsWith('/api/'))return reply({error:'Not available. Authentication and billing are not configured.'},request.method==='GET'?404:403);
    if(request.method==='GET'&&url.pathname==='/sitemap.xml')return secure(new Response(sitemap(url.origin),{headers:{'content-type':'application/xml; charset=utf-8','cache-control':'public, max-age=3600'}}));
    if(request.method==='GET'&&url.pathname==='/robots.txt')return secure(new Response('User-agent: *\nAllow: /\nSitemap: '+url.origin+'/sitemap.xml\n',{headers:{'content-type':'text/plain; charset=utf-8','cache-control':'public, max-age=3600'}}));
    // Serve navigations through the Worker so the HTML shell cannot linger
    // behind old immutable JS/CSS hashed assets during a deployment. In
    // particular a stale index.html paired with removed hashed JS causes a
    // blank mobile screen (MIME text/html instead of JavaScript).
    if((request.method==='GET'||request.method==='HEAD') && isAppNavigation(url.pathname)){
      // Let Cloudflare's SPA asset binding resolve the route to its current
      // HTML shell. Fetching /index.html directly can trigger its canonical
      // route redirect instead of serving the document body.
      const shell=await env.ASSETS.fetch(request);
      const headers=new Headers(shell.headers);
      headers.set('cache-control','no-store, no-cache, must-revalidate');
      headers.set('pragma','no-cache');
      headers.set('x-content-type-options','nosniff');
      return secure(new Response(request.method==='HEAD'?null:shell.body,{status:shell.status,headers}));
    }
    return secure(await env.ASSETS.fetch(request));
  },
};
