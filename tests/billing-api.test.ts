import {describe,it,expect} from 'vitest';
import {handleBillingStatus,handleLiveWebhook,inboxEnabled,inboxEvent} from '../server/billingApi';
import type {Database} from '../server/accountSecurity';
const origin='https://courseaccess.minty-12-shar.workers.dev';
const request=new Request(origin+'/api/billing/webhook',{method:'POST'});
describe('production billing preparation',()=>{
  it('fails closed when live webhook processing is not explicitly configured',async()=>{
    expect(inboxEnabled(request,{})).toBe(false);
    expect((await handleLiveWebhook(request,{})).status).toBe(503);
    expect(inboxEnabled(new Request('https://example.invalid'),{DB:{} as Database,PADDLE_LIVE_WEBHOOK_SECRET:'example',COURSEACCESS_LIVE_WEBHOOK_INBOX_ENABLED:'true'})).toBe(false);
  });
  it('does not expose subscription records to anonymous callers',async()=>{
    const response=await handleBillingStatus(new Request(origin+'/api/billing/status'),{});
    expect(await response.json()).toEqual({authenticated:false,billingEnabled:false,subscription:null});
  });
  it('extracts only minimal metadata and ignores unrelated selected events',()=>{
    const e={eventId:'evt_'+'a'.repeat(26),eventType:'subscription.updated',occurredAt:'2026-11-24T00:00:00Z',data:{id:'sub_'+'b'.repeat(26),email:'private@example.invalid'}};
    expect(inboxEvent(e)).toEqual({id:e.eventId,type:e.eventType,occurred:Date.parse(e.occurredAt),objectId:e.data.id});
    expect(inboxEvent({...e,eventType:'customer.updated'})).toBeNull();
    expect(inboxEvent({...e,eventType:'customer.updated',data:{id:'ctm_'+'c'.repeat(26),email:'private@example.invalid'}})).toEqual({id:e.eventId,type:'customer.updated',occurred:Date.parse(e.occurredAt),objectId:'ctm_'+'c'.repeat(26)});
    expect(inboxEvent({...e,eventType:'product.updated'})).toBeNull();
  });
});
