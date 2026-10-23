import { supabase, getCurrentUser, isSupabaseConfigured } from '@/lib/supabase';
import { BusinessProfile } from '@/types/inventory';

/**
 * Chapter 2 — business profile access shared by the profile screen, PDF
 * generation and the email flow.
 *
 * Reads ONLY profile columns; never touches users.business_id, users.role or
 * businesses.created_by — membership and role are controlled by the database
 * (guard trigger + claim_my_business RPC), never by the app.
 *
 * The cached getter never throws: PDF generation and email sending must keep
 * working (with graceful fallbacks) when no profile exists or the lookup
 * fails. The profile screen uses the raw fetcher so it can show real errors.
 */

type BusinessRow = {
  id: string;
  name: string;
  contact_email: string;
  phone: string;
  address: string;
  delivery_address: string;
  logo_url: string | null;
};

const rowToProfile = (row: BusinessRow): BusinessProfile => ({
  id: row.id,
  name: row.name ?? '',
  contactEmail: row.contact_email ?? '',
  phone: row.phone ?? '',
  address: row.address ?? '',
  deliveryAddress: row.delivery_address ?? '',
  logoUrl: row.logo_url || undefined,
});

/**
 * Loads the authenticated user's business profile.
 * Returns null when the user has no business yet (pre-claim account).
 * Throws on real database errors (the profile screen shows them).
 */
export async function fetchBusinessProfile(): Promise<BusinessProfile | null> {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase is not configured');
  }
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  // The user's own row is readable under RLS (auth.uid() = id).
  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('business_id')
    .eq('id', user.id)
    .single();

  if (userError) {
    throw new Error(userError.message || 'Failed to load your account');
  }
  if (!userRow?.business_id) {
    return null; // pre-claim account — no business yet
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', userRow.business_id)
    .single();

  if (businessError) {
    throw new Error(businessError.message || 'Failed to load your business profile');
  }
  return business ? rowToProfile(business) : null;
}

// --- Small TTL cache so PDF/email flows don't re-query per document -------
const CACHE_TTL_MS = 60_000;
let cache: { profile: BusinessProfile | null; loadedAt: number } | null = null;

export function clearBusinessProfileCache(): void {
  cache = null;
}

/**
 * Cached, non-throwing profile lookup for PDF/email flows. Returns null when
 * the user has no profile or the lookup fails — callers fall back gracefully.
 */
export async function getCachedBusinessProfile(): Promise<BusinessProfile | null> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.profile;
  }
  try {
    const profile = await fetchBusinessProfile();
    cache = { profile, loadedAt: Date.now() };
    return profile;
  } catch (error) {
    console.warn('[BusinessProfile] lookup failed, continuing without it:', error);
    cache = { profile: null, loadedAt: Date.now() };
    return null;
  }
}
