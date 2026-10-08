# SmartStock — Chapter 2 Database Safeguards

Status: prepared 8 October 2026. **The migration has NOT been executed.**

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

## 2. Migration sequence

1. ✅ Verify backup exists and is readable (above).
2. Run `chapter2-migration.sql` in SQL Editor (idempotent — safe to re-run).
3. Run the 5 verification queries at the bottom of the migration script and
   check each expected result (0 orphan users, 0 rows without a business,
   row counts identical to the backup counts, RLS enabled on all 9 tables).
4. Re-test the app on the physical iPhone **before any app-code changes are
   merged**: existing account must still authenticate and load all records
   unchanged (the app continues to work against the old columns).
5. Only then proceed to the Chapter 2 app implementation
   (business profile UI, supplier records UI, PDF/email de-hardcoding).

## 3. Rollback procedure

- **First choice:** run `chapter2-rollback.sql` in the SQL Editor. It removes
  exactly what the migration added (2 tables, new columns, business-aware
  policies) and restores the original policies verbatim. No product, stock,
  order or stocktake data is deleted — original columns are never touched.
  *Honest limitation:* the new linkage data (business/supplier FK links) is
  lost on rollback; it is regenerable by re-running the migration.
- **Ultimate fallback:** restore the database from the Option A `pg_dump`
  backup (requires a clean project or Supabase support involvement — this is
  why Option A is recommended and why the backup must be verified first).
- The rollback script has been written and reviewed against the original
  policy definitions in `supabase-full-setup.sql`. **The rollback is
  established, not merely claimed.**

## 4. How existing records are assigned to their business

- The migration creates **one business per existing user**, named from the
  account email (e.g. `edward@lifestylewindows.com.au` → a business named
  "Edward (Business)" — rename it freely in the app once the profile screen
  exists). Its `contact_email` is the account email.
- Every existing row keeps its `user_id` **and** gains `business_id` copied
  from its owning user. No rows move, merge or change owner.
- Supplier records are auto-created from the distinct supplier names already
  present on the existing products (with the first non-empty supplier email
  found). Products and historical POs are linked to the matching supplier
  record by name. The original supplier text columns are left untouched, so
  historical POs keep their original supplier name/email snapshots exactly.
- The existing Lifestyle Windows account therefore sees **all** of its records
  exactly as before: every RLS policy accepts the legacy
  `auth.uid() = user_id` condition.

## 5. Existing user access confirmation

- All RLS policies are additive: legacy user-ownership still grants full
  access; business membership grants the same access. No existing user can
  lose access as a result of this migration.
- New sign-ups keep working: the `handle_new_user` trigger is unchanged.
  (New users have `business_id = null` until the Chapter 2 app code creates
  their business on first use — the immediate next stage after the migration.)

## 6. Checked risks (no data loss / duplicates / access failures found)

- **Data loss:** migration is additive only; no `drop`, no `delete`, no column
  retypes. Verified line-by-line against `supabase-full-setup.sql`.
- **Duplicate suppliers:** the suppliers table has a per-business unique index
  on the trimmed, lower-cased name; the backfill checks existence before
  insert and is re-runnable.
- **Access control:** policies accept legacy ownership OR membership; order/
  stocktake child tables remain parent-scoped; `auth.uid()` subqueries cannot
  be manipulated by the client.
- **Known limitation (accepted for now, hardened in Chapter 7):** a user can
  technically set their `business_id` to any business (single membership,
  no invite flow yet). There are no staff users yet, so exposure is nil;
  Chapter 7 replaces this with a proper membership table.

## 7. Execution approval

The migration will only be run after:
1. The backup is completed and verified by the project owner.
2. The project owner explicitly approves running `chapter2-migration.sql`.
3. Post-migration verification queries all pass.
4. The app is re-tested on the physical iPhone against the migrated database.
