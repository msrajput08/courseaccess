import {describe,it,expect} from 'vitest';
import {verifyPaddleWebhook} from '../server/paddleWebhook';
const secret='test-webhook-secret',timestamp=1760000000;
const raw=JSON.stringify({event_id:'evt_'+'a'.repeat(26),event_type:'subscription.updated',occurred_at:'2025-10-09T08:00:00Z',data:{id:'sub_test'}});
async function sign(body:string,ts=timestamp){
  const enc=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=await crypto.subtle.sign('HMAC',key,enc.encode(ts+':'+body));
  return 'ts='+ts+';h1='+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}
const request=(body:string,signature:string)=>new Request('https://example.invalid/api/billing/sandbox-webhook',{method:'POST',headers:{'content-type':'application/json','Paddle-Signature':signature},body});
describe('Paddle raw-body signature verification',()=>{
  it('accepts a valid signed event',async()=>{
    expect((await verifyPaddleWebhook(request(raw,await sign(raw)),secret,timestamp*1000)).eventType).toBe('subscription.updated');
  });
  it('rejects tampering, wrong secrets, old timestamps and missing signatures',async()=>{
    const sig=await sign(raw);
    await expect(verifyPaddleWebhook(request(raw+' ',sig),secret,timestamp*1000)).rejects.toThrow();
    await expect(verifyPaddleWebhook(request(raw,sig),'wrong',timestamp*1000)).rejects.toThrow();
    await expect(verifyPaddleWebhook(request(raw,sig),secret,timestamp*1000+6000)).rejects.toThrow();
    await expect(verifyPaddleWebhook(request(raw,''),secret,timestamp*1000)).rejects.toThrow();
  });
});
