# SmartStock — Chapter 2 Database Safeguards

Status: prepared 8 October 2026; **security-hardened revision 9 October 2026** (privilege-escalation fix, supplier-backfill fix, transaction integrity). **The migration has NOT been executed.**

This document is the mandatory safeguard package required before the Chapter 2
schema migration (`chapter2-migration.sql`) is run.

---

## 1. Backup procedure (run BEFORE the migration)

The sandbox does not hold Supabase service credentials, so the backup is
performed by the project owner. Choose ONE option:

### Option A — pg_dump from the Windows PC (recommended, complete)

1. In Supabase Dashboard → Project Settings → Database → Connection string,
   copy the **Session pooler** URI (or use the direct connection if available).
   The password is the database password set when the project was created
   (resettable from the same page).
2. From a terminal with `pg_dump` available (Git for Windows includes it; or
   install PostgreSQL client tools), run:

   ```
   pg_dump "postgresql://postgres.<project-ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres" ^
     --schema=public --schema=auth --file=smartstock-backup-2026-10-08.sql
   ```

   (Replace `<project-ref>`, `<PASSWORD>`, `<region>`; use `%` instead of `^`
   in PowerShell-quoted contexts.)

3. **Verify the backup** (a backup is not real until verified):
   - The file exists and is not empty (`dir smartstock-backup-2026-10-08.sql`).
   - Open the file and confirm it contains `CREATE TABLE` entries for all
     7 public tables plus `auth` schema content.
   - Note the current row counts: Supabase Dashboard → Table Editor → record
     the row count of each of the 7 tables (users, products, purchase_orders,
     order_items, stocktakes, stocktake_items, reorder_log). You will compare
     after the migration.

### Option B — CSV exports via the Dashboard (no tools required, adequate)

1. Supabase Dashboard → Table Editor → for **each** of the 7 tables:
   click Export → CSV. Save all 7 files.
2. For auth users: SQL Editor → run
   `select id, email, created_at from auth.users order by created_at;`
   → export/download the result as CSV.
3. **Verify**: open each CSV and confirm the row counts match the Table Editor
   counts. Store all files together in a folder named
   `smartstock-backup-2026-10-08`.

> Note: Supabase free-tier projects do not include automatic daily backups, so
> this manual backup is the real safety net (verify this in Dashboard →
> Database → Backups for your plan).

---

## 2. What the security-hardened migration enforces

These were the findings from the independent review; each is now fixed **in
the database layer** — no UI restriction is relied on.

### 2.1 Membership tampering is impossible (privilege-escalation fix)

A row-level policy such as `using (auth.uid() = id)` cannot protect
*individual columns* of a row the user owns — so `users_update_self` alone
would let a user set their own `business_id` (join another business) or
`role` (elevate). Three database-level layers close this:

1. **Column grants (hard lock):** `UPDATE` on `public.users` is revoked from
   `authenticated` and `anon` entirely. The app today never updates that row
   (verified by code search — no `.from('users').update(...)` anywhere);
   business-profile data lives in `public.businesses`. The same is done on
   `public.businesses`, where only the profile columns (name, contact_email,
   phone, address, delivery_address, logo_url) are updatable — never `id`,
   `created_by` or `created_at`.
2. **Guard trigger (trusted logic):** `enforce_users_membership_guard()`
   (`BEFORE UPDATE` on `public.users`, SECURITY DEFINER) raises an exception
   on any API-visible change to `users.role` (immutable) or to
   `users.business_id` unless it is a **first-time claim into a business the
   same user created** (`businesses.created_by = auth.uid()`). Privileged
   admin/migration sessions (no JWT claims) pass freely — that is what allows
   the backfill to run.
3. **Trusted RPC:** `claim_my_business(p_business_id)` is the only supported
   API path for establishing membership. It verifies the caller created the
   business and that they have no business yet. (Used by the app from the
   Chapter 2 business-profile stage; harmless for the current app version.)

Also tightened: `INSERT`/`UPDATE` `WITH CHECK` clauses on products,
purchase_orders, stocktakes and reorder_log now require the row's final state
to be either a legacy self-owned row (`user_id = you`, no business) or a row
inside **your own** business — so no one can create or move rows into another
business. `businesses` inserts require `created_by = auth.uid()`.

### 2.2 Supplier backfill cannot produce duplicates or lose emails

The backfill now groups by `lower(trim(supplier))` — so `AWS`, `aws` and
` AWS ` resolve to **one** supplier per business (display name: the
alphabetically-first trimmed spelling seen). Different businesses remain
separate (grouped by `business_id` too). Emails are preserved two ways: the
best non-empty `supplier_email` from the product group is used at creation,
and a second statement tops up existing supplier records that have an empty
email. Re-running the migration creates no duplicates (existence is checked
per business + name key, and a unique index backs it up).

### 2.3 Atomic, fail-safe execution

- The **entire migration runs in one transaction** (`BEGIN` … `COMMIT`).
- **Prerequisites are checked first** and abort loudly if the baseline
  (`set_updated_at()`, all 7 tables) is missing.
- An **integrity gate** at the end of the transaction raises an exception if
  any user/product/PO/stocktake/reorder_log row would end up without a
  business — the exception rolls back the ENTIRE migration. The script cannot
  silently half-apply.
- The rollback script likewise runs in one transaction, has its own integrity
  gate, and drops tables **without** `CASCADE` (all inbound foreign keys are
  removed first by the column drops, so a plain drop either succeeds or
  aborts loudly — no silent dependent-object destruction).

### 2.4 Honest reversibility statement

- The **migration is idempotent** (safe to re-run): every statement uses
  `if not exists` / `where not exists` / null-guarded updates. Supported and
  verifiable.
- The **rollback restores the exact pre-Chapter-2 schema shape and policies**,
  but it is NOT a full data reversal: Chapter 2 *linkage and profile data* is
  lost. Explicitly, a rollback loses:
  - business profile records and any profile edits made in the app since the
    migration;
  - supplier records, including any created or edited in the app since;
  - business assignments (users.business_id, users.role) and
    supplier-link columns (products.supplier_id,
    purchase_orders.supplier_record_id);
  - the security objects (guard trigger, claim RPC).
  Re-running the migration afterwards regenerates the *auto-derived* state
  (one business per user, supplier records from product strings), but manual
  profile/supplier edits made after the migration are recoverable only from
  the pre-migration backup — which predates them. **All original products,
  orders, order items, stocktakes, stocktake items, reorder_log rows,
  supplier snapshots and auth accounts are untouched and never lost** by
  either script. Prefer restoring the Option A backup for anything beyond the
  schema shape.

---

## 3. Migration sequence

1. ✅ Verify backup exists and is readable (above).
2. Run `chapter2-migration.sql` in SQL Editor. It is atomic: either every
   check and backfill succeeds and commits, or the SQL Editor shows an error
   and **nothing** was applied.
3. Run the post-migration verification queries at the bottom of the migration
   script and check each expected result (0 users without a business, 0 rows
   without a business, every supplier name maps to exactly 1 record, row
   counts identical to the backup counts, RLS enabled on all 9 tables, no
   UPDATE grant on `users` for authenticated/anon).
4. Run the security verification tests in §5 below.
5. Re-test the app on the physical iPhone **before any app-code changes are
   merged**: existing account must still authenticate and load all records
   unchanged (the app continues to work against the old columns).
6. Only then proceed to the Chapter 2 app implementation
   (business profile UI, supplier records UI, PDF/email de-hardcoding).

## 4. Rollback procedure

- **First choice:** run `chapter2-rollback.sql` in the SQL Editor. It removes
  exactly what the migration added and restores the original policies and
  grants verbatim, atomically. See §2.4 for exactly what is lost.
- **Ultimate fallback:** restore the database from the Option A `pg_dump`
  backup (requires a clean project or Supabase support involvement — this is
  why Option A is recommended and why the backup must be verified first).
- After rollback: run its post-rollback verification queries (table list back
  to the original 7, no lingering policies/functions, row counts match the
  backup) and re-test the app on the iPhone.

## 5. Security verification — two independent test businesses

Perform these AFTER the migration. Two kinds of test are distinguished:

- **[Inspection]** — can be verified by reading the script / catalog
  (doable now, before execution).
- **[Execution]** — must run against the live database after the migration.

**Setup (once, [Execution]):** note the two real user ids and business ids:

```sql
select u.id as user_id, u.email, u.business_id, b.name as business_name
  from public.users u left join public.businesses b on b.id = u.business_id;
```

Pick user A (e.g. the Lifestyle Windows account) and user B (a second
account; if none exists, register one in the app — or create a throwaway
invite-free account purely for testing). Replace `<USER_A_UID>`,
`<USER_B_UID>`, `<BIZ_A>`, `<BIZ_B>` below.

**Impersonation pattern ([Execution]):** each test runs in its own
transaction so nothing persists. Set the JWT claims the way the API would:

```sql
begin;
select set_config('request.jwt.claim.sub', '<USER_A_UID>', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
select set_config('request.jwt.claims', '{"sub":"<USER_A_UID>","role":"authenticated"}', false);
-- ... the test statement(s) ...
rollback;   -- always roll back; nothing is persisted
```

**Test 1 — Business A cannot read Business B's records [Execution]:**
with user A's claims set, run:

```sql
select count(*) from public.products        where user_id = '<USER_B_UID>';
select count(*) from public.purchase_orders where user_id = '<USER_B_UID>';
select count(*) from public.suppliers       where business_id = '<BIZ_B>';
select count(*) from public.businesses      where id = '<BIZ_B>';
```
All must return **0**. (User B's rows must exist for a meaningful test —
create one product/PO as user B in the app first.)

**Test 2 — Business A cannot modify or delete Business B's records [Execution]:**
with user A's claims set, each statement must FAIL ("0 rows affected" counts
as a pass for UPDATE/DELETE via RLS; a permission error is also a pass):

```sql
update public.products set name = 'hacked'        where user_id = '<USER_B_UID>';
delete from public.products                        where user_id = '<USER_B_UID>';
update public.purchase_orders set status = 'draft' where user_id = '<USER_B_UID>';
delete from public.suppliers                       where business_id = '<BIZ_B>';
```

**Test 3 — Business A cannot switch membership to Business B [Execution]:**

```sql
-- 3a. Direct API update — must fail with a column-permission error:
update public.users set business_id = '<BIZ_B>' where id = '<USER_A_UID>';
-- 3b. Via the trusted RPC — must fail with the SmartStock guard message:
select public.claim_my_business('<BIZ_B>'::uuid);
```

**Test 4 — Business A cannot elevate its own permissions [Execution]:**

```sql
-- Must fail (column permission and/or the guard trigger):
update public.users set role = 'admin' where id = '<USER_A_UID>';
```

**Test 5 — Existing Lifestyle Windows records remain accessible [Execution + device]:**
with the Lifestyle account's claims set:
`select count(*) from public.products;` must return the FULL pre-migration
count from your backup notes (not 0). Then confirm on the physical iPhone:
sign in as the existing account — catalogue, orders, history, stocktakes all
load exactly as before.

**Test 6 — New customers receive isolated records [Execution + device]:**
register a brand-new account in the app. Before the Chapter 2 app code exists
the new user has `business_id = null` and sees only their own (empty) data.
After the business-profile stage, the new user's `claim_my_business` flow
gives them their own business; repeat Tests 1–3 between the new business and
Business A — all must pass.

**Test 7 — Row counts unchanged [Execution]:**
run the migration's verification query 4 and compare products /
purchase_orders / order_items / stocktakes / stocktake_items / reorder_log
against the backup counts recorded in §1. Every count must be **identical**
(suppliers and businesses are new tables and will be non-zero).

**Inspection checks [Inspection] — verifiable by reading the script:**
- Every `select`/`delete` policy is `USING (legacy-owner OR own-business)`;
  every `insert`/`update` carries a `WITH CHECK` that pins the row to the
  caller's own business or legacy ownership.
- `businesses_insert_own` requires `created_by = auth.uid()`.
- The `users` UPDATE grant is revoked from `authenticated`/`anon` (the
  migration's verification query 6 exposes this from the catalog).
- The guard trigger is `BEFORE UPDATE` on `public.users`, SECURITY DEFINER,
  and rejects role changes and non-first-time business changes.

## 6. Checked risks

- **Data loss:** migration is additive only; no `drop`, no `delete`, no column
  retypes. Verified line-by-line against `supabase-full-setup.sql`. The
  transaction + integrity gates mean a partial application is impossible.
- **Duplicate suppliers:** the backfill groups by business + lower(trim(name))
  and is backed by the per-business unique index. Case/spacing variants
  collapse into one record; re-runs create nothing new.
- **Access control:** membership is tamper-proof (§2.1); cross-business reads
  and writes are blocked by policy `WITH CHECK`/`USING` clauses (§2.3 notes).
  Child tables (order_items, stocktake_items) remain parent-scoped.
- **New sign-ups during the migration window:** if a user registers between
  backup and migration they are covered by the same backfill (one business
  each). If somehow a user with no business existed, the integrity gate
  aborts the whole migration rather than half-apply.
- **App compatibility during transition:** the app currently never updates
  `public.users` (verified by code search) and inserts leave `business_id`
  null — both allowed by the tightened policies. Existing flows keep working
  unchanged.

## 7. Execution approval

The migration will only be run after:
1. The backup is completed and verified by the project owner.
2. The project owner explicitly approves running `chapter2-migration.sql`.
3. Post-migration verification queries (§3 step 3) all pass.
4. Security verification tests (§5) all pass.
5. The app is re-tested on the physical iPhone against the migrated database.

## 8. What could NOT be verified without a live database

- Execution behaviour of every statement (transaction semantics, guard-trigger
  firing order, `set_config` impersonation results) is verified by inspection
  against the documented Supabase/Postgres behaviour, not by running SQL.
- The impersonation tests in §5 depend on Supabase's `auth.uid()` reading
  `request.jwt.claim.sub`; if a future platform change alters that, the tests
  themselves (not the database) would need updating.
- Real-device behaviour after migration (existing account, then new account)
  can only be confirmed on the owner's iPhone during Stage 2.
