import {expect,it,describe} from 'vitest';
import {authorizeEntitlement,parsePlans} from '../server/entitlements';
describe('untrusted account must never unlock premium',()=>{
  it('makes basic local tools accessible to anonymous visitors',()=>{
    expect(authorizeEntitlement('pdf-inspection',null)).toBe(true);
    expect(authorizeEntitlement('semantic-html',null)).toBe(true);
  });
  it('denies paid functions to anonymous or unpaid users',()=>{
    expect(authorizeEntitlement('advanced-remediation',null)).toBe(false);
    expect(authorizeEntitlement('team-workspace',{subject:'x',tier:'institution',billingStatus:'past_due'})).toBe(false);
    expect(authorizeEntitlement('team-workspace',{subject:'x',tier:'pro',billingStatus:'active'})).toBe(false);
  });
  it('models intended server-verified privileges without exposing routes',()=>{
    expect(authorizeEntitlement('advanced-remediation',{subject:'verified-id',tier:'pro',billingStatus:'active'})).toBe(true);
    expect(authorizeEntitlement('team-workspace',{subject:'verified-id',tier:'institution',billingStatus:'trialing'})).toBe(true);
  });
  it('supports configurable price and usage proposals while keeping checkout disabled',()=>{
    const plans=parsePlans(JSON.stringify([{tier:'pro',monthlyUsd:14,plannedMonthlyChecks:150,available:true}]));
    expect(plans.find(p=>p.tier==='pro')).toMatchObject({monthlyUsd:14,plannedMonthlyChecks:150,available:false});
  });
  it('publishes only the fixed commercial tiers when explicitly enabled',()=>{const p=parsePlans(undefined,true);expect(p.filter(x=>x.available).map(x=>x.tier)).toEqual(['free','pro','institution']);expect(p.find(x=>x.tier==='pro')?.monthlyUsd).toBe(12);expect(p.find(x=>x.tier==='institution')?.monthlyUsd).toBe(79);});
  it('falls back safely on malformed configurations',()=>{
    expect(parsePlans('not-json')).toEqual(parsePlans());
  });
});
