import {describe,it,expect,vi,afterEach} from 'vitest';import {analyticsQueries,summarizeAnalytics,handleAdminAnalytics,type AdminAnalyticsEnv} from '../server/adminAnalytics';
const origin='https://courseaccess.minty-12-shar.workers.dev',id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function env(account:string):AdminAnalyticsEnv{
 const statement={bind(){return this;},first:async()=>({account_id:account,hits:1}),all:async()=>({results:[]}),run:async()=>({})};
 return {DB:{prepare:()=>statement as never,batch:async()=>[]},COURSEACCESS_AUTH_ORIGIN:origin,COURSEACCESS_ACCOUNTS_ENABLED:'true',COURSEACCESS_ADMIN_ACCOUNT_ID:id,COURSEACCESS_ANALYTICS_READ_TOKEN:'test-only',COURSEACCESS_CF_ACCOUNT_ID:'a'.repeat(32)};
}
const request=(days='7',signed=true)=>new Request(origin+'/api/admin/analytics?days='+days,{headers:signed?{cookie:'__Host-courseaccess='+('a'.repeat(43))}:{}});
afterEach(()=>vi.unstubAllGlobals());
describe('private analytics',()=>{
 it('builds only fixed SQL and rolls up UTC days without fake data',()=>{expect(analyticsQueries(7)[0]).toContain("INTERVAL '6' DAY");expect(analyticsQueries(30)[0]).toContain("INTERVAL '29' DAY");const r=summarizeAnalytics([[{day:'2026-11-25 00:00:00',page:'/pricing',requests:'3'},{day:'2026-11-24 00:00:00',page:'/checkout',requests:2}],[{country:'IN',requests:5}],[{source:'email',requests:5}]],7,new Date('2026-11-25T12:00:00Z'));expect(r).toMatchObject({total:5,today:3,pricing:3,checkout:2,from:'2026-11-19',to:'2026-11-25'});expect(r.daily).toHaveLength(7);expect(r.daily[0].count).toBe(0);});
 it('rejects anonymous and non-owner access without querying Cloudflare',async()=>{const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);expect((await handleAdminAnalytics(request('7',false),env(id))).status).toBe(401);expect((await handleAdminAnalytics(request(),env('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'))).status).toBe(403);expect(fetcher).not.toHaveBeenCalled();});
 it('rejects invalid ranges and missing read token; permits only fixed queries for owner',async()=>{const fetcher=vi.fn(async()=>new Response(JSON.stringify({data:[]})));vi.stubGlobal('fetch',fetcher);expect((await handleAdminAnalytics(request('99'),env(id))).status).toBe(400);expect((await handleAdminAnalytics(request(),{...env(id),COURSEACCESS_ANALYTICS_READ_TOKEN:undefined})).status).toBe(503);expect(fetcher).not.toHaveBeenCalled();const r=await handleAdminAnalytics(request('1'),env(id));expect(r.status).toBe(200);expect(await r.json()).toMatchObject({total:0,today:0});expect(fetcher).toHaveBeenCalledTimes(3);});
});
