/** Tier framework only. Not a client-side substitute for database authorization. */
export type PlanCode = 'starter' | 'team' | 'pro';
export type BusinessRole = 'owner' | 'admin' | 'manager' | 'staff';
export interface PlanLimits {
  businesses: number | null;
  membersPerBusiness: number | null;
  productsPerBusiness: number | null;
}
export interface BusinessMembership {
  userId: string;
  businessId: string;
  role: BusinessRole;
  active: boolean;
}
export type LimitResult = 'allowed' | 'limit_reached' | 'invalid_configuration';
/** null explicitly means unlimited; missing/invalid values never mean unlimited. */
export function checkPlanCapacity(current: number, additional: number, limit: number | null): LimitResult {
  if (!Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(additional) || additional < 0)
    return 'invalid_configuration';
  if (limit !== null && (!Number.isSafeInteger(limit) || limit < 0)) return 'invalid_configuration';
  if (!Number.isSafeInteger(current + additional)) return 'invalid_configuration';
  return limit === null || current + additional <= limit ? 'allowed' : 'limit_reached';
}
/** Select explicit membership, never infer access from a plan or another business. */
export function membershipForBusiness(memberships: readonly BusinessMembership[], userId: string, businessId: string): BusinessMembership | null {
  const matches = memberships.filter(m => m.active && m.userId === userId && m.businessId === businessId);
  return matches.length === 1 ? matches[0] : null;
}