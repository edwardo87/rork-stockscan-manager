import { supabase, getCurrentUser } from '@/lib/supabase';
import { readBusinessAccess } from '@/utils/businessAccess';

/** Prepared read-only adapter. Not enabled in the UI until coordinated tenant rollout. */
export function loadBusinessAccess(userId: string, signal: AbortSignal) {
  return readBusinessAccess(userId, signal, {
    currentUser: async () => (await getCurrentUser())?.id ?? null,
    read: async (id, abort) => {
      if (!supabase) throw new Error('Connect your account to view business access.');
      const memberships = [];
      const pageSize = 200;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase.from('business_memberships')
          .select('business_id,user_id,role,status').eq('user_id', id).eq('status', 'active')
          .order('business_id').range(offset, offset + pageSize - 1).abortSignal(abort);
        if (error) {
          if (error.code === '42P01' || error.code === 'PGRST205') return null;
          throw new Error('Could not load business access. Please retry.');
        }
        memberships.push(...(data ?? []));
        if ((data?.length ?? 0) < pageSize) break;
      }
      const plans = [];
      // Bound URL length; RLS independently restricts rows to active membership.
      for (let offset = 0; offset < memberships.length; offset += 100) {
        const { data, error } = await supabase.from('business_entitlements')
          .select('business_id,plan_code,member_limit,product_limit')
          .in('business_id', memberships.slice(offset, offset + 100).map(m => m.business_id)).abortSignal(abort);
        if (error) {
          if (error.code === '42P01' || error.code === 'PGRST205') return null;
          throw new Error('Could not load business plan. Please retry.');
        }
        plans.push(...(data ?? []));
      }
      return { memberships, plans };
    },
  });
}