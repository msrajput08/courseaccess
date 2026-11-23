import {describe,it,expect} from 'vitest';
import {readBody,requireRecentVerification,ApiError,activeAccountService} from '../server/accountSecurity';

const post=(body:BodyInit,headers:Record<string,string>={})=>
  new Request('https://courseaccess.example/api/auth/login/options',{
    method:'POST',headers:{'content-type':'application/json',...headers},body
  });
describe('account API request safety',()=>{
  it('accepts a small JSON object using a streaming, bounded reader',async()=>{
    expect(await readBody(post(JSON.stringify({displayName:'Research Lecturer'}))))
      .toEqual({displayName:'Research Lecturer'});
  });
  it('rejects oversized payloads regardless of untrusted content-length header',async()=>{
    await expect(readBody(post(JSON.stringify({data:'x'.repeat(20000)}),{'content-length':'1'})))
      .rejects.toMatchObject({status:413});
    await expect(readBody(post(JSON.stringify({data:'x'}),{'content-length':'20000'})))
      .rejects.toMatchObject({status:413});
  });
  it('rejects invalid JSON roots and malformed UTF-8',async()=>{
    await expect(readBody(post('[]'))).rejects.toMatchObject({status:400});
    await expect(readBody(post('{invalid json'))).rejects.toMatchObject({status:400});
    await expect(readBody(post(new Uint8Array([0xff,0xfe])))).rejects.toMatchObject({status:400});
    await expect(readBody(post('{"ok":true}',{'content-type':'text/plain'})))
      .rejects.toMatchObject({status:415});
  });
  it('requires a passkey session from the past ten minutes for destructive operations',()=>{
    expect(()=>requireRecentVerification({issued_at_ms:Date.now()-300_000})).not.toThrow();
    expect(()=>requireRecentVerification({issued_at_ms:Date.now()-700_000})).toThrow(ApiError);
    expect(()=>requireRecentVerification({issued_at_ms:Date.now()+900_000})).toThrow(ApiError);
  });
  it('keeps account activation off without verified origin, D1 and explicit approval',()=>{
    const request=new Request('https://courseaccess.example/api/auth/status');
    expect(activeAccountService(request,{COURSEACCESS_ACCOUNTS_ENABLED:'true'})).toBe(false);
    expect(activeAccountService(request,{COURSEACCESS_AUTH_ORIGIN:'https://courseaccess.example',COURSEACCESS_ACCOUNTS_ENABLED:'false',DB:{} as never})).toBe(false);
    expect(activeAccountService(request,{COURSEACCESS_AUTH_ORIGIN:'https://other.example',COURSEACCESS_ACCOUNTS_ENABLED:'true',DB:{} as never})).toBe(false);
    expect(activeAccountService(request,{COURSEACCESS_AUTH_ORIGIN:'https://courseaccess.example',COURSEACCESS_ACCOUNTS_ENABLED:'true',DB:{} as never})).toBe(true);
  });
});
