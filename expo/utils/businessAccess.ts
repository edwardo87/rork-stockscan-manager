import type { BusinessMembership, BusinessRole } from './businessEntitlements';
export interface BusinessPlan { businessId: string; code: string; memberLimit: number | null; productLimit: number | null }
export interface AccessRows { memberships: unknown[]; plans: unknown[] }
export interface AccessDependencies {
  currentUser: () => Promise<string | null>;
  read: (userId: string, signal: AbortSignal) => Promise<AccessRows | null>;
}
export type BusinessAccess = { available: false } | { available: true; memberships: BusinessMembership[]; plans: BusinessPlan[] };
const roles = new Set(['owner', 'admin', 'manager', 'staff']);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const limit = (value: unknown, min: number): value is number | null => value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= min);
/** Reject malformed/cross-user responses; do not interpret unavailable schema as unlimited access. */
export function parseBusinessAccess(rows: AccessRows, userId: string): BusinessAccess {
  const seen = new Set<string>();
  const memberships = rows.memberships.map((raw: any): BusinessMembership => {
    if (!raw || !uuid(raw.business_id) || raw.user_id !== userId || raw.status !== 'active' || !roles.has(raw.role) || seen.has(raw.business_id))
      throw new Error('Business access could not be verified.');
    seen.add(raw.business_id);
    return { businessId: raw.business_id, userId, role: raw.role as BusinessRole, active: true };
  });
  const plansSeen = new Set<string>();
  const plans = rows.plans.map((raw: any): BusinessPlan => {
    if (!raw || !seen.has(raw.business_id) || plansSeen.has(raw.business_id) || typeof raw.plan_code !== 'string' || !raw.plan_code.trim() || raw.plan_code.trim().length > 64 || !limit(raw.member_limit, 1) || !limit(raw.product_limit, 0))
      throw new Error('Business plan could not be verified.');
    plansSeen.add(raw.business_id);
    return { businessId: raw.business_id, code: raw.plan_code, memberLimit: raw.member_limit, productLimit: raw.product_limit };
  });
  return { available: true, memberships, plans };
}
export async function readBusinessAccess(userId: string, signal: AbortSignal, io: AccessDependencies): Promise<BusinessAccess> {
  if (signal.aborted) throw new Error('Loading cancelled.');
  if (await io.currentUser() !== userId) throw new Error('Your account changed. Reopen business access.');
  if (signal.aborted) throw new Error('Loading cancelled.');
  const rows = await io.read(userId, signal);
  if (signal.aborted) throw new Error('Loading cancelled.');
  if (await io.currentUser() !== userId) throw new Error('Your account changed. Reopen business access.');
  if (signal.aborted) throw new Error('Loading cancelled.');
  return rows ? parseBusinessAccess(rows, userId) : { available: false };
}