import {describe,it,expect} from 'vitest';
import {emailPortalURL,handleBillingPortal} from '../server/billingPortal';
const sub='sub_'+'a'.repeat(26),base='https://customer-portal.paddle.com/cpl_'+'b'.repeat(26);
describe('billing management security',()=>{
 it('strips all bearer credentials and retains only the verified subscription target',()=>{
  const v=emailPortalURL(base+'?action=view_subscription&subscription_id='+sub+'&token=secret&other=secret#secret',sub);
  expect(v).toBe(base+'?action=view_subscription&subscription_id='+sub);
 });
 it('rejects wrong subscription, fake portal, credentials and arbitrary actions',()=>{
  expect(emailPortalURL(base+'?action=overview&subscription_id='+sub,sub)).toBeNull();
  expect(emailPortalURL(base+'?action=view_subscription&subscription_id=sub_other',sub)).toBeNull();
  expect(emailPortalURL('https://customer-portal.paddle.com.evil.invalid/cpl_x?action=view_subscription&subscription_id='+sub,sub)).toBeNull();
  expect(emailPortalURL(base.replace('https://','https://user@')+'?action=view_subscription&subscription_id='+sub,sub)).toBeNull();
 });
 it('requires a same-origin signed-in account',async()=>{
  const base='https://courseaccess.minty-12-shar.workers.dev';
  const post=(origin:string)=>new Request(base+'/api/billing/portal',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'});
  expect((await handleBillingPortal(post('https://evil.invalid'),{})).status).toBe(403);
  expect((await handleBillingPortal(post(base),{})).status).toBe(401);
 });
});
