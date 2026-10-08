-- =============================================================================
-- SmartStock — Chapter 2 ROLLBACK script
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor → paste this file → Run.
--
-- USE ONLY IF the Chapter 2 migration caused a problem and you need to return
-- the database to its pre-Chapter-2 state.
--
-- What this does: removes everything the Chapter 2 migration ADDED (the two
-- new tables, the new columns, and the business-aware policies) and restores
-- the exact pre-Chapter-2 policies. Because the migration was additive, this
-- restores the original schema shape exactly.
--
-- What you lose: only the NEW linkage data (business assignments and supplier
-- record links). No product, stock, order or stocktake data is deleted —
-- those all live in untouched original columns.
--
-- The pre-migration BACKUP (chapter2-db-safeguards.md) remains the ultimate
-- fallback. Prefer restoring from backup if anything looks wrong beyond the
-- schema shape.
-- =============================================================================


-- ---------- 1. Restore original (pre-Chapter-2) RLS policies -----------------

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


-- ---------- 2. Drop business-aware policies on Chapter 2 tables --------------
drop policy if exists "businesses_select_member" on public.businesses;
drop policy if exists "businesses_insert_any" on public.businesses;
drop policy if exists "businesses_update_member" on public.businesses;
drop policy if exists "suppliers_select" on public.suppliers;
drop policy if exists "suppliers_insert" on public.suppliers;
drop policy if exists "suppliers_update" on public.suppliers;
drop policy if exists "suppliers_delete" on public.suppliers;


-- ---------- 3. Drop the new columns ------------------------------------------
-- (Original columns — including products.supplier, purchase_orders.supplier_id
--  text, supplier_name and supplier_email snapshots — are never touched.)
alter table public.products        drop column if exists supplier_id;
alter table public.products        drop column if exists business_id;
alter table public.purchase_orders drop column if exists supplier_record_id;
alter table public.purchase_orders drop column if exists business_id;
alter table public.stocktakes      drop column if exists business_id;
alter table public.reorder_log     drop column if exists business_id;
alter table public.users           drop column if exists business_id;
alter table public.users           drop column if exists role;


-- ---------- 4. Drop the Chapter 2 tables -------------------------------------
drop table if exists public.suppliers cascade;
drop table if exists public.businesses cascade;


-- ---------- 5. Verification: back to the pre-Chapter-2 shape -----------------
-- Should list exactly: users, products, purchase_orders, order_items,
-- stocktakes, stocktake_items, reorder_log
select tablename from pg_tables where schemaname = 'public' order by tablename;

-- Should return 0 (no lingering policies on dropped tables):
select tablename, policyname from pg_policies
where schemaname = 'public'
  and tablename in ('suppliers', 'businesses');
