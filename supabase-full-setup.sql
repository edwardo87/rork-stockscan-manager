-- =============================================================================
-- SmartStock — Complete Supabase Setup (single script)
-- =============================================================================
-- Run this ONCE on a fresh Supabase project:
--   Supabase Dashboard → SQL Editor → New query → paste this file → Run.
--
-- It is fully idempotent (safe to re-run). It creates:
--   • Tables:    users, products, purchase_orders, order_items,
--                stocktakes, stocktake_items, reorder_log
--   • Indexes:   on every foreign key / lookup column the app uses
--   • Trigger:   auto-create a public.users row when a new auth user signs up
--   • Trigger:   keep updated_at columns fresh on update
--   • RLS:       enabled on every table with strict user-owns-row policies
--
-- After it succeeds you should see 7 tables under "Table editor" in Supabase.
-- =============================================================================


-- ---------- Extensions -------------------------------------------------------
create extension if not exists "pgcrypto";


-- ---------- updated_at helper -----------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =============================================================================
-- TABLES
-- =============================================================================

-- ---------- users (mirrors auth.users; one row per signed-up user) ----------
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();


-- ---------- products --------------------------------------------------------
create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  barcode         text not null default '',
  name            text not null default '',
  description     text not null default '',
  price           numeric not null default 0,
  cost            numeric not null default 0,
  sku             text not null default '',
  category        text not null default '',
  supplier        text not null default '',
  supplier_email  text,
  min_stock       numeric not null default 0,
  current_stock   numeric not null default 0,
  unit            text not null default 'pcs',
  image_url       text,
  last_ordered    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- supplier_email column safety (in case table already existed without it)
alter table public.products add column if not exists supplier_email text;

create index if not exists products_user_id_idx   on public.products(user_id);
create index if not exists products_barcode_idx   on public.products(user_id, barcode);
create index if not exists products_supplier_idx  on public.products(user_id, supplier);

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();


-- ---------- purchase_orders -------------------------------------------------
create table if not exists public.purchase_orders (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  supplier_id    text not null default '',
  supplier_name  text not null default '',
  date           timestamptz not null default now(),
  status         text not null default 'draft' check (status in ('draft','submitted','received')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists purchase_orders_user_id_idx on public.purchase_orders(user_id);

drop trigger if exists trg_purchase_orders_updated_at on public.purchase_orders;
create trigger trg_purchase_orders_updated_at
  before update on public.purchase_orders
  for each row execute function public.set_updated_at();


-- ---------- order_items -----------------------------------------------------
create table if not exists public.order_items (
  id                 uuid primary key default gen_random_uuid(),
  purchase_order_id  uuid not null references public.purchase_orders(id) on delete cascade,
  product_id         uuid not null references public.products(id) on delete restrict,
  barcode            text not null default '',
  name               text not null default '',
  quantity           numeric not null default 0,
  supplier           text not null default '',
  created_at         timestamptz not null default now()
);

create index if not exists order_items_po_idx       on public.order_items(purchase_order_id);
create index if not exists order_items_product_idx  on public.order_items(product_id);


-- ---------- stocktakes ------------------------------------------------------
create table if not exists public.stocktakes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  date        timestamptz not null default now(),
  status      text not null default 'in-progress' check (status in ('in-progress','completed')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists stocktakes_user_id_idx on public.stocktakes(user_id);

drop trigger if exists trg_stocktakes_updated_at on public.stocktakes;
create trigger trg_stocktakes_updated_at
  before update on public.stocktakes
  for each row execute function public.set_updated_at();


-- ---------- stocktake_items -------------------------------------------------
create table if not exists public.stocktake_items (
  id                 uuid primary key default gen_random_uuid(),
  stocktake_id       uuid not null references public.stocktakes(id) on delete cascade,
  product_id         uuid not null references public.products(id) on delete restrict,
  barcode            text not null default '',
  name               text not null default '',
  expected_quantity  numeric not null default 0,
  actual_quantity    numeric not null default 0,
  discrepancy        numeric not null default 0,
  created_at         timestamptz not null default now()
);

create index if not exists stocktake_items_stocktake_idx on public.stocktake_items(stocktake_id);
create index if not exists stocktake_items_product_idx   on public.stocktake_items(product_id);


-- ---------- reorder_log -----------------------------------------------------
create table if not exists public.reorder_log (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  product_id        uuid not null references public.products(id) on delete restrict,
  product_name      text not null default '',
  quantity_ordered  numeric not null default 0,
  supplier          text not null default '',
  order_date        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists reorder_log_user_id_idx    on public.reorder_log(user_id);
create index if not exists reorder_log_product_idx    on public.reorder_log(product_id);


-- =============================================================================
-- AUTH TRIGGER — create public.users row on signup
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- ---------- users -----------------------------------------------------------
alter table public.users enable row level security;
drop policy if exists "users_select_self" on public.users;
drop policy if exists "users_update_self" on public.users;
create policy "users_select_self" on public.users
  for select using (auth.uid() = id);
create policy "users_update_self" on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------- products --------------------------------------------------------
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

-- ---------- purchase_orders -------------------------------------------------
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

-- ---------- order_items (scoped via parent purchase_orders) -----------------
alter table public.order_items enable row level security;
drop policy if exists "order_items_select_own" on public.order_items;
drop policy if exists "order_items_insert_own" on public.order_items;
drop policy if exists "order_items_update_own" on public.order_items;
drop policy if exists "order_items_delete_own" on public.order_items;
create policy "order_items_select_own" on public.order_items
  for select using (exists (
    select 1 from public.purchase_orders po
    where po.id = order_items.purchase_order_id and po.user_id = auth.uid()));
create policy "order_items_insert_own" on public.order_items
  for insert with check (exists (
    select 1 from public.purchase_orders po
    where po.id = order_items.purchase_order_id and po.user_id = auth.uid()));
create policy "order_items_update_own" on public.order_items
  for update using (exists (
    select 1 from public.purchase_orders po
    where po.id = order_items.purchase_order_id and po.user_id = auth.uid()));
create policy "order_items_delete_own" on public.order_items
  for delete using (exists (
    select 1 from public.purchase_orders po
    where po.id = order_items.purchase_order_id and po.user_id = auth.uid()));

-- ---------- stocktakes ------------------------------------------------------
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

-- ---------- stocktake_items (scoped via parent stocktake) -------------------
alter table public.stocktake_items enable row level security;
drop policy if exists "stocktake_items_select_own" on public.stocktake_items;
drop policy if exists "stocktake_items_insert_own" on public.stocktake_items;
drop policy if exists "stocktake_items_update_own" on public.stocktake_items;
drop policy if exists "stocktake_items_delete_own" on public.stocktake_items;
create policy "stocktake_items_select_own" on public.stocktake_items
  for select using (exists (
    select 1 from public.stocktakes st
    where st.id = stocktake_items.stocktake_id and st.user_id = auth.uid()));
create policy "stocktake_items_insert_own" on public.stocktake_items
  for insert with check (exists (
    select 1 from public.stocktakes st
    where st.id = stocktake_items.stocktake_id and st.user_id = auth.uid()));
create policy "stocktake_items_update_own" on public.stocktake_items
  for update using (exists (
    select 1 from public.stocktakes st
    where st.id = stocktake_items.stocktake_id and st.user_id = auth.uid()));
create policy "stocktake_items_delete_own" on public.stocktake_items
  for delete using (exists (
    select 1 from public.stocktakes st
    where st.id = stocktake_items.stocktake_id and st.user_id = auth.uid()));

-- ---------- reorder_log -----------------------------------------------------
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
-- VERIFICATION (optional — run these after the script to confirm)
--   select tablename, rowsecurity from pg_tables where schemaname='public';
--   select tablename, policyname, cmd from pg_policies where schemaname='public'
--     order by tablename, cmd;
-- =============================================================================
