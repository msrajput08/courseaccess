import {describe,it,expect} from 'vitest';
import {paidPeriodValid,handleEntitlements,handlePaidReviewHistory} from '../server/paidAccess';
describe('paid feature access',()=>{
 it('requires an active unexpired verified period',()=>{
  expect(paidPeriodValid('active',1001,1000)).toBe(true);
  for(const status of ['trialing','past_due','canceled','paused'])expect(paidPeriodValid(status,1001,1000)).toBe(false);
  expect(paidPeriodValid('active',1000,1000)).toBe(false);
  expect(paidPeriodValid('active',null,1000)).toBe(false);
 });
 it('fails closed without account or flags',async()=>{
  const req=new Request('https://courseaccess.minty-12-shar.workers.dev/api/entitlements');
  const data=await (await handleEntitlements(req,{})).json();
  expect(data.paidFeaturesEnabled).toBe(false);
  expect(data.features['history-cloud']).toBe(false);
  expect((await handlePaidReviewHistory(req,{})).status).toBe(401);
 });
});
