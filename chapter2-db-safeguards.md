# SmartStock — Chapter 2 Database Safeguards

Status: prepared 8 October 2026; security-hardened revision 9 October 2026; **revision 2 corrections 9 October 2026** (rollback gate table-specificity, explicit service_role trust boundary, DB-enforced business ownership of new records, composite supplier FKs, role-switching test procedure, honest backup guidance). **The migration has NOT been executed.**

This document is the mandatory safeguard package required before the Chapter 2
schema migration (`chapter2-migration.sql`) is run.

---

## 1. Backup procedure (run BEFORE the migration)

The sandbox does not hold Supabase service credentials, so the backup is
performed by the project owner.

**Be honest with yourself about what each option gives you:**
- **Option A (pg_dump)** is a true restorable backup of schema + data.
- **Option B (CSV exports)** is a **data snapshot only** — it can NOT restore
  the schema, the RLS policies, the auth accounts or the relationships. It is
  a last-resort recovery source for table data, not a backup. Use it only if
  pg_dump cannot be installed.

### Option A — pg_dump from the Windows PC (recommended: real, restorable)

**Prerequisites**
1. PostgreSQL client tools, installed once:
   - In PowerShell: `winget install -e --id PostgreSQL.PostgreSQL.17`
     (or download the EDB PostgreSQL installer from enterprisedb.com and
     install just the command-line tools).
   - `pg_dump` and `psql` will be in `C:\Program Files\PostgreSQL\17\bin`.
   - Note: Git for Windows does **not** include pg_dump — you need the
     PostgreSQL client tools above. The dump tool's major version must be
     **equal to or newer than** the Supabase server version (shown in
     Dashboard → Settings → Infrastructure); PostgreSQL 17 client tools are
     safe for current Supabase projects.
2. The connection details from Supabase Dashboard → Project Settings →
   Database → Connection string → **Session pooler**: host
   (`aws-0-<region>.pooler.supabase.com`), port `5432`, database `postgres`,
   user `postgres.<project-ref>`.
3. **Password handling:** the password is the database password (resettable
   from the same Dashboard page if lost). **Never** type it into a chat, a
   script, or a command line argument — always let the tool prompt for it
   (`-W` flag below). It will exist only in your head/Supabase dashboard.

**Create the backup** (PowerShell, adjust the path to pg_dump):

```
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" `
  --host=aws-0-<region>.pooler.supabase.com --port=5432 `
  --username="postgres.<project-ref>" --dbname=postgres `
  --schema=public --schema=auth --no-owner --no-privileges `
  --file=smartstock-backup-2026-10-09.sql -W
```

You will be prompted for the password. On success the file
`smartstock-backup-2026-10-09.sql` contains everything needed to recreate the
schema and data.

**Verify the backup (a backup is not real until it is restored somewhere):**
1. The file exists and is non-empty, and contains `CREATE TABLE` entries for
   all 7 public tables (users, products, purchase_orders, order_items,
   stocktakes, stocktake_items, reorder_log).
2. **Test-restore into a scratch local database** (requires a local
   PostgreSQL server — the winget/EDB install can provide one, or install
   Docker-based Postgres):
   ```
   & "C:\Program Files\PostgreSQL\17\bin\createdb.exe" -h localhost -U postgres smartstock_verify
   & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -U postgres -d smartstock_verify -f smartstock-backup-2026-10-09.sql
   ```
   - Expected: the public schema restores cleanly. The `auth` schema section
     may partially fail on a local server (missing extensions/roles) — that
     part is informational; the public-table data is what you are verifying.
3. Record the pre-migration row counts (run in Supabase SQL Editor, and
   compare against the local restored copy):
   ```sql
   select 'products' t, count(*) from public.products
   union all select 'purchase_orders', count(*) from public.purchase_orders
   union all select 'order_items', count(*) from public.order_items
   union all select 'stocktakes', count(*) from public.stocktakes
   union all select 'stocktake_items', count(*) from public.stocktake_items
   union all select 'reorder_log', count(*) from public.reorder_log;
   ```

**Realistic restoration limitations (know them before you need them):**
- Supabase free tier has **no automatic backups or point-in-time recovery** —
  this dump is the only safety net.
- You cannot restore *over* a live Supabase project yourself. If the
  migration goes wrong: (a) run `chapter2-rollback.sql` (first choice), or
  (b) for a full restore, create a **new** Supabase project, restore the dump
  there with psql, and either point the app at it or migrate data back —
  or contact Supabase support. Restoring `auth.users` into a managed
  Supabase project requires Supabase support involvement; account passwords
  are not in the dump.
- Keep the dump file somewhere safe; it contains all business data.

### Option B — CSV exports via the Dashboard (data snapshot only, NOT restorable)

1. Supabase Dashboard → Table Editor → for **each** of the 7 tables:
   click Export → CSV. Save all 7 files.
2. For auth users: SQL Editor → run
   `select id, email, created_at from auth.users order by created_at;`
   → export/download the result as CSV.
3. **Verify**: open each CSV and confirm the row counts match the Table Editor
   counts. Store all files together in a folder named
   `smartstock-backup-2026-10-09`.
4. **Limitations:** no schema, no RLS policies, no auth accounts/passwords,
   no relations. If the database were lost, the CSVs would only let you
   manually re-import table data into a recreated schema. Choose Option A if
   at all possible.

---

## 2. What the security-hardened migration enforces

These were the findings from the independent reviews; each is now fixed **in
the database layer** — no UI restriction is relied on.

### 2.1 Membership tampering is impossible (privilege-escalation fix)

A row-level policy such as `using (auth.uid() = id)` cannot protect
*individual columns* of a row the user owns — so `users_update_self` alone
would let a user set their own `business_id` (join another business) or
`role` (elevate). Database-level layers close this:

1. **Column grants (hard lock):** `UPDATE` on `public.users` is revoked from
   `authenticated` and `anon` entirely. The app today never updates that row
   (verified by code search — no `.from('users').update(...)` anywhere);
   business-profile data lives in `public.businesses`. The same is done on
   `public.businesses`, where only the profile columns (name, contact_email,
   phone, address, delivery_address, logo_url) are updatable — never `id`,
   `created_by` or `created_at`.
2. **Guard trigger (trusted logic):** `enforce_users_membership_guard()`
   (`BEFORE UPDATE` on `public.users`) rejects any change to `users.role`
   (immutable to API users) and any change to `users.business_id` unless it
   is a **first-time claim into a business the same user created**
   (`businesses.created_by = auth.uid()`).
3. **Trusted RPC:** `claim_my_business(p_business_id)` is the only supported
   API path for establishing membership. It verifies the caller created the
   business and that they have no business yet (so it can never switch an
   existing membership), and it never touches `role`. Used by the app from
   the Chapter 2 business-profile stage; harmless for the current app
   version.

**Explicit trust boundary (revision 2):** the guard's only bypass is an
explicit **service_role JWT** (`auth.role() = 'service_role'`) — the trusted
backend key. The *absence* of JWT claims is **not** treated as proof of
administrator: claim-less sessions are subject to the same customer rules.
Privileged migration backfills instead explicitly `DISABLE` the guard trigger
for the single backfill statement and re-enable it — a table-owner SQL action
that API users can never perform. Nothing else raises the guard.

### 2.2 Business ownership of new records is database-enforced

`BEFORE INSERT` triggers (`enforce_business_ownership()`) on products,
purchase_orders, stocktakes and reorder_log:
- member user, `business_id` omitted → **filled with their business**;
- member user, `business_id` provided → must equal their own business, else
  the insert fails;
- pre-claim user (no business yet) → stays `null` (legacy compatible); they
  cannot attach rows to any business until they claim one.

RLS `WITH CHECK` (§2.3) re-validates the final row after the trigger runs, so
trigger and policy agree. The current app (which omits `business_id`) keeps
working unchanged, but new rows can no longer be orphaned or cross-assigned.

**How new users get their initial membership (secure path):**
1. The user signs up → `handle_new_user` creates their `users` row with
   `business_id = null` and `role = 'owner'`.
2. The user inserts their own business — RLS requires
   `businesses.created_by = auth.uid()`, so nobody can create a business
   attributed to someone else.
3. The user calls `claim_my_business(business_id)` — the trusted RPC verifies
   they created that business and have no membership yet, then sets
   `users.business_id`. The guard trigger allows exactly this shape.
   Membership can never be changed again via the API (only trusted logic).
   (Steps 2–3 are implemented by the app in the Chapter 2 business-profile
   stage; until then new users simply have `business_id = null`.)

### 2.3 Cross-business access is blocked by policy, not UI

- `businesses` inserts require `created_by = auth.uid()`.
- suppliers: every policy is scoped to the caller's own business.
- products / purchase_orders / stocktakes / reorder_log:
  - SELECT/DELETE: legacy owner OR own business;
  - INSERT/UPDATE `WITH CHECK`: the row's final state must be either a legacy
    self-owned row (`user_id = you`, `business_id = null`) or a row inside
    your own business. No one can create or move rows into another business.
- order_items / stocktake_items remain scoped through their parents.

### 2.4 Supplier/business consistency is database-enforced

Composite foreign keys — `(supplier_id, business_id) → suppliers(id,
business_id)` on products, and `(supplier_record_id, business_id)` on
purchase_orders — make it impossible to link a product or PO to a supplier
belonging to a different business, on INSERT and on UPDATE, regardless of app
behaviour. `MATCH SIMPLE` semantics mean rows with either column still NULL
(the current app's inserts) are unconstrained, preserving compatibility until
the app populates these fields (Stage 4).

### 2.5 Supplier backfill cannot produce duplicates or lose emails

The backfill groups by `business_id, lower(trim(supplier))` — so `AWS`, `aws`
and ` AWS ` resolve to **one** supplier per business (display name: the
alphabetically-first trimmed spelling seen). Different businesses remain
separate. Emails are preserved two ways: the best non-empty `supplier_email`
from the product group is used at creation, and a second statement tops up
existing supplier records that have an empty email. Re-running the migration
creates no duplicates (existence is checked per business + name key, backed by
a unique index).

### 2.6 Atomic, fail-safe execution

- The **entire migration runs in one transaction** (`BEGIN` … `COMMIT`).
- **Prerequisites are checked first** and abort loudly if the baseline
  (`set_updated_at()`, all 7 tables) is missing.
- An **integrity gate** at the end of the transaction raises an exception if
  any user/product/PO/stocktake/reorder_log row would end up without a
  business — the exception rolls back the ENTIRE migration. The script cannot
  silently half-apply.
- The rollback script likewise runs in one transaction, has its own integrity
  gate that checks **only the columns/tables Chapter 2 actually added**
  (table-specific; the original `purchase_orders.supplier_id` TEXT column is
  explicitly preserved and excluded from the check), and drops tables
  **without** `CASCADE` (all inbound foreign keys are removed first by the
  column drops, so a plain drop either succeeds or aborts loudly).

### 2.7 Honest reversibility statement

- The **migration is idempotent** (safe to re-run): every statement uses
  `if not exists` / `where not exists` / null-guarded updates / exception-
  guarded constraint additions. Supported and verifiable.
- The **rollback restores the exact pre-Chapter-2 schema shape and policies**,
  but it is NOT a full data reversal: Chapter 2 *linkage and profile data* is
  lost. Explicitly, a rollback loses:
  - business profile records and any profile edits made in the app since the
    migration;
  - supplier records, including any created or edited in the app since;
  - business assignments (users.business_id, users.role) and
    supplier-link columns (products.supplier_id,
    purchase_orders.supplier_record_id);
  - the security objects (guard trigger, ownership triggers, claim RPC).
  Re-running the migration afterwards regenerates the *auto-derived* state
  (one business per user, supplier records from product strings), but manual
  profile/supplier edits made after the migration are recoverable only from
  the pre-migration backup — which predates them. **All original products,
  orders, order items, stocktakes, stocktake items, reorder_log rows,
  supplier snapshots, the original purchase_orders.supplier_id TEXT column
  and all auth accounts are untouched and never lost** by either script.
  Prefer restoring the Option A backup for anything beyond the schema shape.

---

## 3. Migration sequence

1. ✅ Verify backup exists, is restorable (Option A test-restore), and record
   the pre-migration row counts (§1).
2. Run `chapter2-migration.sql` in SQL Editor. It is atomic: either every
   check and backfill succeeds and commits, or the SQL Editor shows an error
   and **nothing** was applied.
3. Run the post-migration verification queries at the bottom of the migration
   script and check each expected result (0 users without a business, 0 rows
   without a business, every supplier name maps to exactly 1 record, row
   counts identical to the backup counts, RLS enabled on all 9 tables, no
   UPDATE grant on `users` for authenticated/anon, guard + ownership triggers
   and the 2 composite FKs present).
4. Run the security verification tests in §5 below.
5. Re-test the app on the physical iPhone **before any app-code changes are
   merged**: existing account must still authenticate and load all records
   unchanged (the app continues to work against the old columns).
6. Only then proceed to the Chapter 2 app implementation
   (business profile UI, supplier records UI, PDF/email de-hardcoding).

## 4. Rollback procedure

- **First choice:** run `chapter2-rollback.sql` in the SQL Editor. It removes
  exactly what the migration added and restores the original policies and
  grants verbatim, atomically. See §2.7 for exactly what is lost. Original
  columns — including `purchase_orders.supplier_id` (TEXT) — are preserved.
- **Ultimate fallback:** restore from the Option A `pg_dump` backup into a
  fresh project (see §1 restoration limitations — you cannot restore over a
  live project; use a new project or Supabase support).
- After rollback: run its post-rollback verification queries (table list back
  to the original 7, no lingering policies/functions, row counts match the
  backup, `purchase_orders.supplier_id` still present as text) and re-test
  the app on the iPhone.

## 5. Security verification — two independent test businesses

Perform these AFTER the migration. Two kinds of test are distinguished:

- **[Inspection]** — verified by reading the script / catalog (doable now).
- **[Execution]** — must run against the live database after the migration.

**Setup (once, [Execution]):** note the two real user ids and business ids:

```sql
select u.id as user_id, u.email, u.business_id, b.name as business_name
  from public.users u left join public.businesses b on b.id = u.business_id;
```

Pick user A (e.g. the Lifestyle Windows account) and user B (a second
account; if none exists, register one in the app — or create a throwaway
account purely for testing). Replace `<USER_A_UID>`, `<USER_B_UID>`,
`<BIZ_A>`, `<BIZ_B>`. For a meaningful test, create at least one product /
PO / supplier as user B first (via the app or a service-role insert).

### 5.1 How to act as a genuine customer (not a privileged role)

Every test below runs inside its own transaction. `SET LOCAL ROLE
authenticated` genuinely switches the execution role — RLS policies **and**
column grants are then enforced against the customer's privileges. The JWT
claim settings fill in `auth.uid()` / `auth.role()`, which read those GUCs.

```sql
begin;
  set local role authenticated;                       -- real customer privileges
  select set_config('request.jwt.claim.sub', '<USER_A_UID>', false);
  select set_config('request.jwt.claim.role', 'authenticated', false);
  select set_config('request.jwt.claims',
    '{"sub":"<USER_A_UID>","role":"authenticated"}', false);

  -- CANARY 1: must return 'authenticated'. If it shows postgres/anonymous,
  -- the role switch failed — STOP, the tests would be invalid.
  select current_user as must_be_authenticated;

  -- CANARY 2 (positive control): user A must see their OWN rows (> 0).
  select count(*) as own_visible_products from public.products where user_id = '<USER_A_UID>';
rollback;
```

**Confirm tests cannot silently pass under a privileged role:** every test
block starts with the two canaries above. Canary 2 proves the claims were
picked up (a privileged role would see ALL rows; if you ever see more rows
than your own, stop and re-check). A forgotten claim-setting shows up as
canary 2 returning 0 or canary 1 returning the wrong role.

If `set local role authenticated` is rejected by the SQL Editor session
(permission denied), use the equally reliable alternative: run the same
statements through the Supabase client (supabase-js) signed in as each test
user — the API applies the exact same RLS and grant rules. Do not skip the
tests.

### 5.2 The negative-access tests

Run each block separately (each in its own `begin; … rollback;` together with
the §5.1 preamble for the stated user).

**Test 1 — Business A cannot read Business B's records [Execution]:**
as user A:

```sql
select count(*) from public.products        where user_id = '<USER_B_UID>';  -- must be 0
select count(*) from public.purchase_orders where user_id = '<USER_B_UID>';  -- must be 0
select count(*) from public.suppliers       where business_id = '<BIZ_B>';   -- must be 0
select count(*) from public.businesses      where id = '<BIZ_B>';            -- must be 0
```

**Test 2 — Business A cannot modify or delete Business B's records [Execution]:**
as user A — each statement must affect 0 rows or raise an error:

```sql
update public.products set name = 'hacked'        where user_id = '<USER_B_UID>';
delete from public.products                        where user_id = '<USER_B_UID>';
update public.purchase_orders set status = 'draft' where user_id = '<USER_B_UID>';
delete from public.suppliers                       where business_id = '<BIZ_B>';
```

**Test 3 — Business A cannot switch membership to Business B [Execution]:**
as user A — both must FAIL:

```sql
-- 3a. Direct API update — column grants reject it (permission denied):
update public.users set business_id = '<BIZ_B>' where id = '<USER_A_UID>';
-- 3b. Via the trusted RPC — guard rejects it (business not created by you):
select public.claim_my_business('<BIZ_B>'::uuid);
```

**Test 4 — Business A cannot elevate its own permissions [Execution]:**
as user A — must FAIL (column grant and/or guard trigger):

```sql
update public.users set role = 'admin' where id = '<USER_A_UID>';
```

**Test 5 — Cross-business record attachment is impossible [Execution]:**
as user A — both must FAIL (RLS WITH CHECK / ownership trigger):

```sql
insert into public.products (user_id, name, business_id)
  values ('<USER_A_UID>', 'attack', '<BIZ_B>'::uuid);           -- foreign business
update public.products set business_id = '<BIZ_B>'::uuid
  where user_id = '<USER_A_UID>';                                -- moving own row out
```

**Test 6 — Supplier/business consistency [Execution]:**
as user A (owning <BIZ_A>), with a supplier record existing in <BIZ_B> — must FAIL:

```sql
insert into public.products (user_id, name, supplier_id)
  select '<USER_A_UID>', 'cross-supplier', s.id from public.suppliers s
  where s.business_id = '<BIZ_B>' limit 1;
```

**Test 7 — Existing Lifestyle Windows records remain accessible [Execution + device]:**
as user A (Lifestyle account):
`select count(*) from public.products;` must return the FULL pre-migration
count from your §1 notes (not 0, not just your own subset). Then confirm on
the physical iPhone: sign in as the existing account — catalogue, orders,
history, stocktakes all load exactly as before.

**Test 8 — New customers receive isolated records [Execution + device]:**
register a brand-new account. It must appear with `business_id = null` and
see only its own (empty) data. Then, as the new user:
insert a business (`created_by` = own uid — must succeed), call
`claim_my_business(<new biz id>)` (must succeed), and confirm the guard now
rejects joining any other business. Repeat Tests 1–5 between the new user
and user A — all must pass.

**Test 9 — Row counts unchanged [Execution]:**
run the migration's verification query 4 and compare products /
purchase_orders / order_items / stocktakes / stocktake_items / reorder_log
against the §1 counts. Every count must be **identical** (suppliers and
businesses are new tables and will be non-zero).

**Inspection checks [Inspection] — verifiable by reading the script:**
- Every `select`/`delete` policy is `USING (legacy-owner OR own-business)`;
  every `insert`/`update` carries a `WITH CHECK` that pins the row to the
  caller's own business or legacy ownership.
- `businesses_insert_own` requires `created_by = auth.uid()`.
- The `users` UPDATE grant is revoked from `authenticated`/`anon` (the
  migration's verification query 6 exposes this from the catalog).
- The guard trigger bypasses ONLY for `auth.role() = 'service_role'` — never
  for claim-less sessions; the migration's backfill uses an explicit,
  owner-only `DISABLE TRIGGER` window instead.
- `enforce_business_ownership()` triggers exist on all 4 data tables
  (INSERT) and the 2 composite FKs guarantee supplier/business consistency.

## 6. Checked risks

- **Data loss:** migration is additive only; no `drop`, no `delete`, no column
  retypes. Verified line-by-line against `supabase-full-setup.sql`. The
  transaction + integrity gates mean a partial application is impossible.
- **Duplicate suppliers:** the backfill groups by business + lower(trim(name))
  and is backed by the per-business unique index. Case/spacing variants
  collapse into one record; re-runs create nothing new.
- **Access control:** membership is tamper-proof (§2.1); cross-business reads
  and writes are blocked by policy `WITH CHECK`/`USING` clauses (§2.3);
  supplier links cannot cross businesses (§2.4). Child tables
  (order_items, stocktake_items) remain parent-scoped.
- **App compatibility during transition:** the app never updates
  `public.users` (verified by code search) and inserts omit `business_id` —
  the ownership triggers fill it from membership (or leave it null for
  pre-claim users), matching the current behaviour exactly. Existing flows
  keep working unchanged.
- **New sign-ups during the migration window:** if a user registers between
  backup and migration they are covered by the same backfill (one business
  each). If somehow a user with no business existed, the integrity gate
  aborts the whole migration rather than half-apply.

## 7. Execution approval

The migration will only be run after:
1. The backup is completed, test-restored, and row counts recorded (§1).
2. The project owner explicitly approves running `chapter2-migration.sql`.
3. Post-migration verification queries (§3 step 3) all pass.
4. Security verification tests (§5) all pass.
5. The app is re-tested on the physical iPhone against the migrated database.

## 8. What could NOT be verified without a live database

All SQL has been checked by careful static inspection against PostgreSQL and
Supabase semantics — **no statement has been executed against any database**
(no Supabase credentials and no PostgreSQL server exist in this sandbox).
Specifically unverified until Stage 2:

- Actual execution of the migration/rollback (transaction semantics, trigger
  firing, exception guards).
- Whether the SQL Editor's `postgres` role may `SET LOCAL ROLE
  authenticated` in your project (Supabase normally grants this; if not, use
  the supabase-js alternative in §5.1).
- Which GUC layout (`request.jwt.claim.sub` vs `request.jwt.claims` JSON)
  your Supabase instance's `auth.uid()`/`auth.role()` read — the tests set
  both, so they work either way.
- Real-device behaviour after migration (existing account, then new account).
