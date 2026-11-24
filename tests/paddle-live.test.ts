import {describe,it,expect,vi} from 'vitest';
import {LIVE_PRICES,localizedPrices,localPreviewAllowed,previewItems,openApprovedCheckout,type PaddleClient} from '../src/lib/paddleLive';
describe('Paddle live preparation without payment',()=>{
  it('never enables on production builds or non-loopback hosts',()=>{
    expect(localPreviewAllowed(false,'localhost','live_example')).toBe(false);
    expect(localPreviewAllowed(true,'courseaccess.minty-12-shar.workers.dev','live_example')).toBe(false);
    expect(localPreviewAllowed(true,'localhost','test_example')).toBe(false);
    expect(localPreviewAllowed(true,'localhost','')).toBe(false);
    expect(localPreviewAllowed(true,'localhost','live_example')).toBe(true);
  });
  it('uses existing live IDs and one unit per tier',()=>{
    expect(previewItems()).toEqual([{priceId:LIVE_PRICES.pro,quantity:1},{priceId:LIVE_PRICES.institution,quantity:1}]);
  });
  it('preserves localized formatting, maps by ID and ignores unknown prices',()=>{
    expect(localizedPrices({data:{details:{lineItems:[
      {price:{id:LIVE_PRICES.institution},formattedTotals:{subtotal:'€75,00'}},
      {price:{id:'unrecognized'},formattedTotals:{subtotal:'$1'}},
      {price:{id:LIVE_PRICES.pro},formattedTotals:{subtotal:'€11,00'}}
    ]}}})).toEqual({pro:'€11,00',institution:'€75,00'});
    expect(localizedPrices(null)).toEqual({});
  });
  it('builds overlay arguments using a mock, never sending a payment request',()=>{
    const open=vi.fn();
    const client={Checkout:{open}} as unknown as PaddleClient;
    openApprovedCheckout(client,'pro','verified@example.invalid');
    expect(open).toHaveBeenCalledWith({items:[{priceId:LIVE_PRICES.pro,quantity:1}],customer:{email:'verified@example.invalid'},settings:{displayMode:'overlay'}});
    openApprovedCheckout(client,'institution');
    expect(open).toHaveBeenLastCalledWith({items:[{priceId:LIVE_PRICES.institution,quantity:1}],settings:{displayMode:'overlay'}});
  });
});
