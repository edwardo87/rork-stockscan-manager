import { checkPlanCapacity, membershipForBusiness, type LimitResult } from './businessEntitlements';
import type { BusinessAccess } from './businessAccess';
export type CapacityDecision = LimitResult | 'unavailable' | 'no_membership' | 'plan_unconfigured';
/** Advisory display only. Server transactions must enforce limits and action permissions. */
export function businessCapacity(
  access: BusinessAccess, userId: string, businessId: string,
  resource: 'members' | 'products', current: number, additional: number,
): CapacityDecision {
  if (!access.available) return 'unavailable';
  if (!membershipForBusiness(access.memberships, userId, businessId)) return 'no_membership';
  const matches = access.plans.filter(plan => plan.businessId === businessId);
  if (matches.length === 0) return 'plan_unconfigured';
  if (matches.length !== 1) return 'invalid_configuration';
  const plan = matches[0];
  const cap = resource === 'members' ? plan.memberLimit : plan.productLimit;
  return checkPlanCapacity(current, additional, cap);
}
