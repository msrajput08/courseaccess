import {describe,it,expect} from 'vitest';
import {createPortalProof,verifyPortalProof,verifiedPortalURL} from '../server/portalProof';
const secret='fixture-only-secret-at-least-32-characters',customer='ctm_'+'a'.repeat(26),sub='sub_'+'b'.repeat(26);
describe('portal email proof',()=>{
 it('requires matching secret, account, session, email, expiry and code',async()=>{
  const now=Date.now(),proof=await createPortalProof(secret,'account/session/email',now);
  expect(await verifyPortalProof(secret,'account/session/email',proof.challenge,proof.code,now)).toBe(true);
  expect(await verifyPortalProof(secret,'other/session/email',proof.challenge,proof.code,now)).toBe(false);
  expect(await verifyPortalProof(secret,'account/session/email',proof.challenge,'0'.repeat(20),now)).toBe(false);
  expect(await verifyPortalProof(secret,'account/session/email',proof.challenge,proof.code,now+300001)).toBe(false);
 });
 it('only accepts provider-returned matching subscription links',()=>{
  const url='https://customer-portal.paddle.com/cpl_'+'c'.repeat(26)+'?action=view_subscription&subscription_id='+sub+'&token=pga_fixture';
  const data={customer_id:customer,urls:{subscriptions:[{id:sub,view_subscription:url}]}};
  expect(verifiedPortalURL(data,customer,sub)).toBe(url);
  expect(verifiedPortalURL(data,'ctm_other',sub)).toBeNull();
  expect(verifiedPortalURL(data,customer,'sub_other')).toBeNull();
 });
});