import {describe,it,expect,vi} from 'vitest';import {recordNavigation} from '../server/trafficAnalytics';
const origin='https://courseaccess.minty-12-shar.workers.dev';
describe('cookie-free aggregate traffic',()=>{
 it('records a fixed page, country and source without storing any identifiers',()=>{
 const writeDataPoint=vi.fn();const req=new Request(origin+'/pricing?utm_source=email&email=private%40example.com',{headers:{accept:'text/html',cookie:'session=secret',referer:'https://example.org/private?token=secret','cf-connecting-ip':'192.0.2.1'}});
 Object.defineProperty(req,'cf',{value:{country:'IN'}});
 recordNavigation(req,{writeDataPoint});
 expect(writeDataPoint).toHaveBeenCalledExactlyOnceWith({indexes:['/pricing'],blobs:['/pricing','IN','email'],doubles:[1]});
 });
 it('ignores API, assets, prefetch and nonproduction requests',()=>{
 const writeDataPoint=vi.fn();for(const path of ['/api/auth/me','/assets/app.js','/guides/private-id'])recordNavigation(new Request(origin+path,{headers:{accept:'text/html'}}),{writeDataPoint});
 recordNavigation(new Request(origin+'/',{headers:{accept:'text/html','sec-purpose':'prefetch'}}),{writeDataPoint});
 recordNavigation(new Request('https://example.com/',{headers:{accept:'text/html'}}),{writeDataPoint});
 expect(writeDataPoint).not.toHaveBeenCalled();
 });
 it('fails open if analytics unavailable',()=>{expect(()=>recordNavigation(new Request(origin+'/',{headers:{accept:'text/html'}}),{writeDataPoint(){throw Error('unavailable')}})).not.toThrow();});
});
