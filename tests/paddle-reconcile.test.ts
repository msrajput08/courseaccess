import {describe,it,expect} from 'vitest';
import {canonicalSubscription,matchesInitialTransaction} from '../server/paddleReconcile';
import {PRICE_IDS} from '../server/liveCheckout';
const sub='sub_'+'a'.repeat(26),customer='ctm_'+'b'.repeat(26),tx='txn_'+'c'.repeat(26);
const items=[{quantity:1,price:{id:PRICE_IDS.pro}}];
const canonical={id:sub,customer_id:customer,status:'active',updated_at:'2026-11-24T00:00:00Z',current_billing_period:{starts_at:'2026-11-24T00:00:00Z',ends_at:'2026-12-24T00:00:00Z'},items};
describe('canonical provider state',()=>{
 it('accepts only the expected paid tier and provider identity',()=>{
  expect(canonicalSubscription(canonical)?.status).toBe('active');
  expect(canonicalSubscription({...canonical,status:'paused'})?.status).toBe('past_due');
  expect(canonicalSubscription({...canonical,items:[{quantity:2,price:{id:PRICE_IDS.pro}}]})).toBeNull();
  expect(canonicalSubscription({...canonical,current_billing_period:null})).toBeNull();
  expect(canonicalSubscription({...canonical,status:'toString'})).toBeNull();
 });
 it('requires a completed exact transaction with one expected recurring item',()=>{
  const data={id:tx,status:'completed',subscription_id:sub,customer_id:customer,items};
  expect(matchesInitialTransaction(data,tx)).toBe(true);
  expect(matchesInitialTransaction({...data,status:'paid'},tx)).toBe(false);
  expect(matchesInitialTransaction({...data,items:[]},tx)).toBe(false);
  expect(matchesInitialTransaction(data,'txn_other')).toBe(false);
 });
});
