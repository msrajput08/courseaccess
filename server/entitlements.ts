// Server-side entitlements foundation. Never trust a tier supplied by a browser.
export type Tier = 'free' | 'one-time' | 'pro' | 'institution';
export type Entitlement = 'pdf-inspection' | 'semantic-html' | 'advanced-remediation' | 'history-cloud' | 'team-workspace';
export type BillingStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'none';
export interface VerifiedAccount {
  subject: string;
  tier: Tier;
  billingStatus: BillingStatus;
}
export interface Plan {
  tier: Tier;
  monthlyUsd: number | null;
  plannedMonthlyChecks: number | null;
  available: boolean;
}
export const BASE_PLANS: readonly Plan[] = Object.freeze([
  {tier:'free',monthlyUsd:0,plannedMonthlyChecks:5,available:true},
  {tier:'one-time',monthlyUsd:null,plannedMonthlyChecks:null,available:false},
  {tier:'pro',monthlyUsd:12,plannedMonthlyChecks:100,available:false},
  {tier:'institution',monthlyUsd:79,plannedMonthlyChecks:1000,available:false},
]);
export function parsePlans(raw?:string): readonly Plan[] {
  if(!raw)return BASE_PLANS;
  try {
    const input:unknown=JSON.parse(raw);
    if(!Array.isArray(input))return BASE_PLANS;
    const plans:Plan[]=[];
    for(const base of BASE_PLANS){
      const item=input.find((v:unknown)=>typeof v==='object'&&v!==null&&'tier' in v&&v.tier===base.tier) as Partial<Plan>|undefined;
      const price=item?.monthlyUsd;
      const limit=item?.plannedMonthlyChecks;
      plans.push({...base,
        monthlyUsd:price===null||typeof price==='number'&&Number.isFinite(price)&&price>=0?price:base.monthlyUsd,
        plannedMonthlyChecks:limit===null||typeof limit==='number'&&Number.isInteger(limit)&&limit>=0?limit:base.plannedMonthlyChecks,
        // Keeping enabled:false for paid tiers until secure billing is configured.
        available:base.tier==='free',
      });
    }
    return plans;
  }catch{return BASE_PLANS;}
}
export function authorizeEntitlement(feature:Entitlement, identity:VerifiedAccount|null):boolean {
  if(feature==='pdf-inspection'||feature==='semantic-html')return true;
  // Future integration must verify identity and billing status on the server, not from request JSON.
  if(!identity||!identity.subject||!['active','trialing'].includes(identity.billingStatus))return false;
  if(feature==='team-workspace')return identity.tier==='institution';
  return identity.tier==='pro'||identity.tier==='institution';
}
