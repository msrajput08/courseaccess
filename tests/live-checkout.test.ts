import {describe,it,expect} from 'vitest';
import {checkoutEnabled,checkoutConfig,createCheckoutIntent,validTier,transactionId} from '../server/liveCheckout';
describe('live checkout release gate',()=>{
 const req=new Request('https://courseaccess.minty-12-shar.workers.dev/api/billing/checkout-config');
 it('never exposes credentials or creates transactions by default',async()=>{
  expect(checkoutEnabled(req,{})).toBe(false);
  expect(await checkoutConfig(req,{PADDLE_LIVE_API_KEY:'pdl_live_apikey_example',PADDLE_LIVE_CLIENT_TOKEN:'live_example'}).json()).toEqual({enabled:false,preview:false,clientToken:null});
  expect((await createCheckoutIntent(req,{})).status).toBe(503);
 });
 it('validates fixed catalog tiers and transaction identifiers',()=>{
  expect(validTier('pro')).toBe(true);expect(validTier('other')).toBe(false);
  expect(transactionId('txn_'+'a'.repeat(26))).toBe(true);expect(transactionId('sub_'+'a'.repeat(26))).toBe(false);
 });
});
