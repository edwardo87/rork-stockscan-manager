-- =============================================================================
-- SmartStock — Chapter 2 ROLLBACK script (security-hardened revision, 9 Oct 2026)
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor → paste this file → Run.
--
-- USE ONLY IF the Chapter 2 migration caused a problem and you need to return
-- the database to its pre-Chapter-2 state.
--
-- What this does: removes everything the Chapter 2 migration ADDED (the two
-- new tables, the new columns, the security functions/triggers, the column
-- grant changes, and the business-aware policies) and restores the exact
-- pre-Chapter-2 policies and grants. Because the migration was additive, the
-- original schema shape is restored exactly.
--
-- WHAT WOULD BE LOST by running this rollback (be aware before running):
--   • public.businesses: business profile records — names, contact details,
--     delivery addresses, logos, INCLUDING any edits made in the app after
--     the migration. Regenerable ONLY as the auto-derived state (re-running
--     the migration recreates one business per user from the account email);
--     manual profile edits are recoverable only from the pre-migration
--     backup... which by definition predates them. Treat post-migration
--     business-profile edits as lost.
--   • public.suppliers: all supplier records, including any created or
--     edited in the app after the migration. Regenerable only as the
--     auto-derived state from product strings (same caveat as above).
--   • users.business_id / users.role assignments.
--   • products.supplier_id and purchase_orders.supplier_record_id links.
--   • The claim_my_business() RPC.
-- What is NEVER lost: all original products, purchase orders (including
-- supplier_name / supplier_email snapshots), order items, stocktakes,
-- stocktake items, reorder_log rows, and all auth accounts — these live in
-- original columns the migration and rollback never touch.
--
-- The pre-migration BACKUP (chapter2-db-safeguards.md) remains the ultimate
-- fallback. Prefer restoring from backup if anything looks wrong beyond the
-- schema shape.
-- =============================================================================

begin;


-- ---------- 1. Remove Chapter 2 security objects -----------------------------
drop trigger if exists trg_users_membership_guard on public.users;
drop function if exists public.enforce_users_membership_guard();
drop function if exists public.claim_my_business(uuid);


-- ---------- 2. Restore original (pre-Chapter-2) RLS policies ----------------

-- users (identical to pre-Chapter-2)
drop policy if exists "users_select_self" on public.users;
drop policy if exists "users_update_self" on public.users;
create policy "users_select_self" on public.users
  for select using (auth.uid() = id);
create policy "users_update_self" on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- products (original: strict user-owns-row)
drop policy if exists "products_select_own" on public.products;
drop policy if exists "products_insert_own" on public.products;
drop policy if exists "products_update_own" on public.products;
drop policy if exists "products_delete_own" on public.products;
create policy "products_select_own" on public.products
  for select using (auth.uid() = user_id);
create policy "products_insert_own" on public.products
  for insert with check (auth.uid() = user_id);
create policy "products_update_own" on public.products
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "products_delete_own" on public.products
  for delete using (auth.uid() = user_id);

-- purchase_orders (original)
drop policy if exists "purchase_orders_select_own" on public.purchase_orders;
drop policy if exists "purchase_orders_insert_own" on public.purchase_orders;
drop policy if exists "purchase_orders_update_own" on public.purchase_orders;
drop policy if exists "purchase_orders_delete_own" on public.purchase_orders;
create policy "purchase_orders_select_own" on public.purchase_orders
  for select using (auth.uid() = user_id);
create policy "purchase_orders_insert_own" on public.purchase_orders
  for insert with check (auth.uid() = user_id);
create policy "purchase_orders_update_own" on public.purchase_orders
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "purchase_orders_delete_own" on public.purchase_orders
  for delete using (auth.uid() = user_id);

-- stocktakes (original)
drop policy if exists "stocktakes_select_own" on public.stocktakes;
drop policy if exists "stocktakes_insert_own" on public.stocktakes;
drop policy if exists "stocktakes_update_own" on public.stocktakes;
drop policy if exists "stocktakes_delete_own" on public.stocktakes;
create policy "stocktakes_select_own" on public.stocktakes
  for select using (auth.uid() = user_id);
create policy "stocktakes_insert_own" on public.stocktakes
  for insert with check (auth.uid() = user_id);
create policy "stocktakes_update_own" on public.stocktakes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "stocktakes_delete_own" on public.stocktakes
  for delete using (auth.uid() = user_id);

-- reorder_log (original)
drop policy if exists "reorder_log_select_own" on public.reorder_log;
drop policy if exists "reorder_log_insert_own" on public.reorder_log;
drop policy if exists "reorder_log_update_own" on public.reorder_log;
drop policy if exists "reorder_log_delete_own" on public.reorder_log;
create policy "reorder_log_select_own" on public.reorder_log
  for select using (auth.uid() = user_id);
create policy "reorder_log_insert_own" on public.reorder_log
  for insert with check (auth.uid() = user_id);
create policy "reorder_log_update_own" on public.reorder_log
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reorder_log_delete_own" on public.reorder_log
  for delete using (auth.uid() = user_id);

-- order_items / stocktake_items policies were never changed — nothing to do.


-- ---------- 3. Drop business-aware policies on Chapter 2 tables --------------
drop policy if exists "businesses_select_member" on public.businesses;
drop policy if exists "businesses_insert_own" on public.businesses;
drop policy if exists "businesses_insert_any" on public.businesses;
drop policy if exists "businesses_update_member" on public.businesses;
drop policy if exists "suppliers_select" on public.suppliers;
drop policy if exists "suppliers_insert" on public.suppliers;
drop policy if exists "suppliers_update" on public.suppliers;
drop policy if exists "suppliers_delete" on public.suppliers;


-- ---------- 4. Drop the new columns ------------------------------------------
-- (Original columns — including products.supplier, purchase_orders.supplier_id
--  text, supplier_name and supplier_email snapshots — are never touched.
--  Dropping a column drops its FK constraint with it, so no CASCADE needed.)
alter table public.products        drop column if exists supplier_id;
alter table public.products        drop column if exists business_id;
alter table public.purchase_orders drop column if exists supplier_record_id;
alter table public.purchase_orders drop column if exists business_id;
alter table public.stocktakes      drop column if exists business_id;
alter table public.reorder_log     drop column if exists business_id;
alter table public.users           drop column if exists business_id;
alter table public.users           drop column if exists role;


-- ---------- 5. Drop the Chapter 2 tables -------------------------------------
-- No CASCADE: all inbound foreign keys (from users, products, purchase_orders)
-- were already removed with the columns above, so a plain drop cannot fail —
-- and if it ever DID fail, the transaction aborts loudly instead of silently
-- destroying dependent objects.
drop table if exists public.suppliers;
drop table if exists public.businesses;


-- ---------- 6. Restore original table grants ---------------------------------
-- The migration revoked UPDATE on public.users / public.businesses from the
-- API roles. Supabase's baseline grants authenticated (and anon) full DML;
-- restore that so the database matches its pre-Chapter-2 state exactly.
grant update on table public.users to authenticated, anon;
-- public.businesses is dropped above; its grants go with it.


-- ---------- 7. Integrity gate: nothing below may fail silently ---------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name in ('suppliers', 'businesses')
  ) then
    raise exception 'SmartStock rollback ABORTED: Chapter 2 tables still present. The transaction was rolled back — nothing was applied.';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('users', 'products', 'purchase_orders', 'stocktakes', 'reorder_log')
      and column_name in ('business_id', 'role', 'supplier_id', 'supplier_record_id')
  ) then
    raise exception 'SmartStock rollback ABORTED: Chapter 2 columns still present. The transaction was rolled back — nothing was applied.';
  end if;
end $$;

commit;

-- =============================================================================
-- POST-ROLLBACK VERIFICATION
-- =============================================================================

-- Should list exactly: users, products, purchase_orders, order_items,
-- stocktakes, stocktake_items, reorder_log
select tablename from pg_tables where schemaname = 'public' order by tablename;

-- Should return 0 rows (no lingering policies on dropped tables):
select tablename, policyname from pg_policies
where schemaname = 'public'
  and tablename in ('suppliers', 'businesses');

-- Should return 0 rows (no lingering security objects):
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('enforce_users_membership_guard', 'claim_my_business');

-- Row counts must match your pre-migration backup counts exactly:
select 'products' t, count(*) from public.products
union all select 'purchase_orders', count(*) from public.purchase_orders
union all select 'order_items', count(*) from public.order_items
union all select 'stocktakes', count(*) from public.stocktakes
union all select 'stocktake_items', count(*) from public.stocktake_items
union all select 'reorder_log', count(*) from public.reorder_log;

-- App re-test: the existing account must authenticate and load all records
-- unchanged on the physical iPhone before considering the rollback complete.
