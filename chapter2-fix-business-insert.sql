-- =============================================================================
-- SmartStock — Chapter 2 hotfix: businesses INSERT policy (business creation)
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor → paste this file → Run.
--
-- SYMPTOM (24 Oct 2026, runtime error in the app's Business Profile screen):
--   Error creating business: { "code": "42501",
--     "message": "new row violates row-level security policy for table \"businesses\"" }
--
-- ROOT CAUSE (diagnosed from code + live-DB probes, no data inspected):
--   The app's designed first-time-membership flow (Chapter 2 Stage 3) is:
--     1. INSERT into public.businesses with created_by = auth.uid()
--        — allowed by the "businesses_insert_own" policy (created_by = auth.uid()).
--     2. Call claim_my_business(p_business_id) — verified present on production
--        with its single-uuid signature (probe: unknown-argument calls return
--        PGRST202; the uuid call resolves and is correctly denied to anon).
--   Production (Chapter 2 migration Revision 4, deployed 19 Oct 2026) rejects
--   step 1 for an authenticated user: the row-level INSERT check on businesses
--   either has no permissive policy or a stricter one. Revision 4's canonical
--   SQL is not in this repository, so the exact live policy text is unknown —
--   the DIAGNOSTIC section below prints it before anything is changed.
--   No app-side change can bypass RLS (by design), so the repair is this
--   policy restore, run by the owner.
--
-- SAFETY:
--   • Section 1 is read-only diagnostics (run and keep the output).
--   • Section 2 is idempotent and changes ONLY the businesses INSERT policy
--     and (defensively) re-grants INSERT if it was revoked. No rows are read,
--     added, changed or deleted. All other policies, triggers, the guard
--     trigger and the claim RPC are left untouched.
--   • The restored policy is the documented Chapter 2 design: a user may only
--     establish a business that records THEM as the creator. Claiming it then
--     still requires claim_my_business() + the users membership guard trigger.
-- =============================================================================


-- =============================================================================
-- 1. DIAGNOSTIC (read-only — copy the output into the project record)
-- =============================================================================

-- 1a. Current policies on businesses (expect to see the problem here:
--     either no row named "businesses_insert_own", or an unexpected cmd/check).
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'businesses';

-- 1b. Current table grants for businesses (INSERT must be granted to
--     authenticated for PostgREST inserts to be possible at all).
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'businesses'
order by grantee, privilege_type;

-- 1c. Accounts that currently cannot finish business creation (expect the
--     affected new account here; backfilled users from 19 Oct will not appear).
select id, email from public.users where business_id is null;


-- =============================================================================
-- 2. REPAIR (idempotent — safe to re-run)
-- =============================================================================

-- 2a. Restore the canonical INSERT policy for first-time business creation.
drop policy if exists "businesses_insert_own" on public.businesses;
create policy "businesses_insert_own" on public.businesses
  for insert with check (created_by = auth.uid());

-- 2b. Defensive grant (no-op if already present; Rev 4's grants are unknown).
--     RLS still restricts WHAT can be inserted via the policy above.
grant insert on table public.businesses to authenticated;

commit;


-- =============================================================================
-- 3. POST-FIX VERIFICATION (read-only)
-- =============================================================================

-- 3a. Must now show businesses_insert_own, cmd INSERT, with_check
--     "created_by = auth.uid()":
select policyname, cmd, roles, with_check
from pg_policies
where schemaname = 'public' and tablename = 'businesses';

-- 3b. End-to-end check: retry the failing flow in the app.
--     Sign in as the affected (new) account → Settings → Business Profile →
--     create the business. Expected: "Business Created", then the profile
--     loads and claim_my_business() assigns membership. The account must no
--     longer appear in query 1c afterwards.
--
-- 3c. Security spot-check (optional, impersonation — run per test user, in a
--     transaction you roll back):
--   begin;
--   select set_config('request.jwt.claim.sub', '<USER_UUID>', false);
--   select set_config('request.jwt.claim.role', 'authenticated', false);
--   -- must FAIL (another user's id as created_by):
--   insert into public.businesses (name, contact_email, created_by)
--   values ('attack', 'x@y.z', '<OTHER_USER_UUID>');
--   rollback;
-- =============================================================================
