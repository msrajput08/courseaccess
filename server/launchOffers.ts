export const LAUNCH_SPECS={pro:{code:'PROLAUNCH25',percent:25,regular:12,monthly:9,priceId:'pri_01m87cf8a3d6nedgenr8jmhzwc',productId:'pro_01m87ccf14cemskhymbze0w9gd'},institution:{code:'INSTLAUNCH',percent:12.66,regular:79,monthly:69,priceId:'pri_01m87chg5xqcnggt17wvsknvw9',productId:'pro_01m87cg6jmsj8ptqynxa1rf10h'}} as const;
export type OfferTier=keyof typeof LAUNCH_SPECS;
export type LaunchOffer={monthly:number;regular:number;percent:number;months:number;expiresAt:string};
export function validOffer(d:Record<string,unknown>,tier:OfferTier,now=Date.now()){
 const s=LAUNCH_SPECS[tier];
 return typeof d.id==='string'&&/^dsc_[a-z0-9]{26}$/.test(d.id)&&String(d.code).toUpperCase()===s.code&&d.status==='active'&&d.type==='percentage'&&Number(d.amount)===s.percent&&d.recur===true&&d.maximum_recurring_intervals===12&&d.usage_limit===null&&d.enabled_for_checkout===true&&Array.isArray(d.restrict_to)&&d.restrict_to.length===1&&(d.restrict_to[0]===s.priceId||d.restrict_to[0]===s.productId)&&typeof d.expires_at==='string'&&Date.parse(d.expires_at)>now&&Date.parse(d.expires_at)>=Date.parse('2026-12-24T00:00:00Z')&&Date.parse(d.expires_at)<=Date.parse('2026-12-27T00:00:00Z');
}
export function configuredOffer(raw:string|undefined,tier:OfferTier,now=Date.now()):{id:string;offer:LaunchOffer}|null{
 try{const x=JSON.parse(raw||'{}')[tier];if(!x||typeof x.id!=='string'||!/^dsc_[a-z0-9]{26}$/.test(x.id)||typeof x.expiresAt!=='string'||!(Date.parse(x.expiresAt)>now)||Date.parse(x.expiresAt)>Date.parse('2026-12-27T00:00:00Z'))return null;const s=LAUNCH_SPECS[tier];return {id:x.id,offer:{monthly:s.monthly,regular:s.regular,percent:s.percent,months:12,expiresAt:x.expiresAt}};}catch{return null;}
}
export function publicOffers(raw:string|undefined){return {pro:configuredOffer(raw,'pro')?.offer||null,institution:configuredOffer(raw,'institution')?.offer||null};}
