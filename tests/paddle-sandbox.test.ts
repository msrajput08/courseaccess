import {describe,it,expect} from 'vitest';
import {sandboxConfig,sandboxLocalizedPrices} from '../src/lib/paddleSandbox';
import {LIVE_PRICES} from '../src/lib/paddleLive';
const pro='pri_'+'a'.repeat(26),institution='pri_'+'b'.repeat(26);
describe('isolated sandbox checkout',()=>{
  it('rejects production builds, remote hosts, live tokens and live prices',()=>{
    expect(sandboxConfig(false,'localhost','test_example',pro,institution)).toBeNull();
    expect(sandboxConfig(true,'courseaccess.minty-12-shar.workers.dev','test_example',pro,institution)).toBeNull();
    expect(sandboxConfig(true,'localhost','live_example',pro,institution)).toBeNull();
    expect(sandboxConfig(true,'localhost','test_example',LIVE_PRICES.pro,institution)).toBeNull();
    expect(sandboxConfig(true,'localhost','test_example',pro,pro)).toBeNull();
  });
  it('maps only configured test price IDs',()=>{
    const c=sandboxConfig(true,'localhost','test_example',pro,institution)!;
    expect(c).not.toBeNull();
    expect(sandboxLocalizedPrices({data:{details:{lineItems:[{price:{id:pro},formattedTotals:{subtotal:'₹999'}},{price:{id:LIVE_PRICES.institution},formattedTotals:{subtotal:'$79'}}]}}},c)).toEqual({pro:'₹999'});
  });
});
