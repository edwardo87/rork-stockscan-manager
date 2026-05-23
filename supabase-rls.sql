-- =============================================================================
-- SmartStock — Row Level Security setup
-- Run this ONCE in your Supabase project (SQL Editor → New query → paste → Run).
-- It is idempotent: safe to re-run.
--
-- It does the following for every user-owned table:
--   1. Enables RLS.
--   2. Drops any old policies with the same name.
--   3. Creates strict policies so a signed-in user can only read/write rows
--      where user_id = auth.uid().
--
-- Tables covered:
--   products, purchase_orders, order_items, stocktakes, stocktake_items, reorder_log
--
-- order_items and stocktake_items are isolated through their parent row's user_id
-- (they don't have their own user_id column).
-- =============================================================================

-- ---------- PRODUCTS ---------------------------------------------------------
alter table public.products enable row level security;

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

-- ---------- PURCHASE ORDERS --------------------------------------------------
alter table public.purchase_orders enable row level security;

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

-- ---------- ORDER ITEMS (scoped via parent purchase_orders) ------------------
alter table public.order_items enable row level security;

drop policy if exists "order_items_select_own" on public.order_items;
drop policy if exists "order_items_insert_own" on public.order_items;
drop policy if exists "order_items_update_own" on public.order_items;
drop policy if exists "order_items_delete_own" on public.order_items;

create policy "order_items_select_own" on public.order_items
  for select using (
    exists (
      select 1 from public.purchase_orders po
      where po.id = order_items.purchase_order_id
        and po.user_id = auth.uid()
    )
  );
create policy "order_items_insert_own" on public.order_items
  for insert with check (
    exists (
      select 1 from public.purchase_orders po
      where po.id = order_items.purchase_order_id
        and po.user_id = auth.uid()
    )
  );
create policy "order_items_update_own" on public.order_items
  for update using (
    exists (
      select 1 from public.purchase_orders po
      where po.id = order_items.purchase_order_id
        and po.user_id = auth.uid()
    )
  );
create policy "order_items_delete_own" on public.order_items
  for delete using (
    exists (
      select 1 from public.purchase_orders po
      where po.id = order_items.purchase_order_id
        and po.user_id = auth.uid()
    )
  );

-- ---------- STOCKTAKES -------------------------------------------------------
alter table public.stocktakes enable row level security;

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

-- ---------- STOCKTAKE ITEMS (scoped via parent stocktake) --------------------
alter table public.stocktake_items enable row level security;

drop policy if exists "stocktake_items_select_own" on public.stocktake_items;
drop policy if exists "stocktake_items_insert_own" on public.stocktake_items;
drop policy if exists "stocktake_items_update_own" on public.stocktake_items;
drop policy if exists "stocktake_items_delete_own" on public.stocktake_items;

create policy "stocktake_items_select_own" on public.stocktake_items
  for select using (
    exists (
      select 1 from public.stocktakes st
      where st.id = stocktake_items.stocktake_id
        and st.user_id = auth.uid()
    )
  );
create policy "stocktake_items_insert_own" on public.stocktake_items
  for insert with check (
    exists (
      select 1 from public.stocktakes st
      where st.id = stocktake_items.stocktake_id
        and st.user_id = auth.uid()
    )
  );
create policy "stocktake_items_update_own" on public.stocktake_items
  for update using (
    exists (
      select 1 from public.stocktakes st
      where st.id = stocktake_items.stocktake_id
        and st.user_id = auth.uid()
    )
  );
create policy "stocktake_items_delete_own" on public.stocktake_items
  for delete using (
    exists (
      select 1 from public.stocktakes st
      where st.id = stocktake_items.stocktake_id
        and st.user_id = auth.uid()
    )
  );

-- ---------- REORDER LOG ------------------------------------------------------
alter table public.reorder_log enable row level security;

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

-- =============================================================================
-- Verification queries — run these to confirm RLS is active:
--   select tablename, rowsecurity from pg_tables where schemaname='public';
--   select tablename, policyname, cmd from pg_policies where schemaname='public' order by tablename, cmd;
-- =============================================================================
