-- =============================================================================
-- SmartStock — Chapter 2 Migration: Business ownership + Supplier records
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor → paste this file → Run.
--
-- PREREQUISITE (mandatory): a verified backup must exist first.
--   See chapter2-db-safeguards.md for the backup + verification procedure.
--
-- Design principles:
--   • ADDITIVE ONLY. No existing column is dropped, renamed or retyped.
--     No row is deleted. Existing user access is preserved by keeping every
--     user_id column and by making every RLS policy accept EITHER the old
--     user-owns-row condition OR the new business-membership condition.
--   • Fully idempotent (safe to re-run).
--   • One business is auto-created per existing user; every existing row is
--     assigned to that business. The existing Lifestyle Windows account keeps
--     seeing all of its records exactly as before.
--   • Business isolation is enforced by RLS (database level), not the UI.
--   • New tables: businesses, suppliers.
--   • New columns: users.business_id (+ role hook for later chapters),
--     products.business_id + products.supplier_id (uuid FK),
--     purchase_orders.business_id + purchase_orders.supplier_record_id (uuid FK
--     — the existing TEXT supplier_id column is left untouched),
--     stocktakes.business_id, reorder_log.business_id.
--     order_items / stocktake_items stay scoped through their parents.
--   • Historical POs keep their supplier_name / supplier_email snapshots.
-- =============================================================================


-- ---------- Extensions -------------------------------------------------------
create extension if not exists "pgcrypto";


-- ---------- 1. businesses ----------------------------------------------------
create table if not exists public.businesses (
  id               uuid primary key default gen_random_uuid(),
  name             text not null default '',
  contact_email    text not null default '',
  phone            text not null default '',
  address          text not null default '',
  delivery_address text not null default '',
  logo_url         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists businesses_contact_email_idx on public.businesses(contact_email);

drop trigger if exists trg_businesses_updated_at on public.businesses;
create trigger trg_businesses_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();


-- ---------- 2. suppliers -----------------------------------------------------
create table if not exists public.suppliers (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  name           text not null default '',
  ordering_email text not null default '',
  phone          text not null default '',
  contact_person text not null default '',
  address        text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- One supplier name per business (case-insensitive, trimmed).
create unique index if not exists suppliers_business_name_uq
  on public.suppliers (business_id, lower(trim(name)));
create index if not exists suppliers_business_idx on public.suppliers(business_id);

drop trigger if exists trg_suppliers_updated_at on public.suppliers;
create trigger trg_suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();


-- ---------- 3. New columns on existing tables --------------------------------
alter table public.users add column if not exists business_id uuid references public.businesses(id);
-- role is a forward hook for Chapter 7 (owner/admin/staff). Not used by the app yet.
alter table public.users add column if not exists role text not null default 'owner';

alter table public.products      add column if not exists business_id uuid references public.businesses(id);
alter table public.products      add column if not exists supplier_id  uuid references public.suppliers(id);
alter table public.purchase_orders add column if not exists business_id       uuid references public.businesses(id);
alter table public.purchase_orders add column if not exists supplier_record_id uuid references public.suppliers(id);
alter table public.stocktakes    add column if not exists business_id uuid references public.businesses(id);
alter table public.reorder_log   add column if not exists business_id uuid references public.businesses(id);

create index if not exists products_business_idx        on public.products(business_id);
create index if not exists products_supplier_id_idx     on public.products(supplier_id);
create index if not exists purchase_orders_business_idx on public.purchase_orders(business_id);
create index if not exists stocktakes_business_idx      on public.stocktakes(business_id);
create index if not exists reorder_log_business_idx     on public.reorder_log(business_id);


-- ---------- 4. Backfill: one business per existing user ----------------------
-- Idempotent: only creates a business for users that do not have one yet.
-- Business name is derived from the account email's local part; the user can
-- rename it in the app (Business Profile, next stage).
insert into public.businesses (name, contact_email)
select
  case
    when position('@' in u.email) > 1
      then initcap(split_part(u.email, '@', 1)) || ' (Business)'
    else 'My Business'
  end,
  u.email
from public.users u
where not exists (
  select 1 from public.businesses b where b.contact_email = u.email
);

-- Assign every user to their business (matched by contact_email).
update public.users u
set business_id = b.id
from public.businesses b
where b.contact_email = u.email
  and u.business_id is null;


-- ---------- 5. Backfill: business_id on all existing data rows ---------------
update public.products p
set business_id = u.business_id
from public.users u
where u.id = p.user_id and p.business_id is null;

update public.purchase_orders po
set business_id = u.business_id
from public.users u
where u.id = po.user_id and po.business_id is null;

update public.stocktakes st
set business_id = u.business_id
from public.users u
where u.id = st.user_id and st.business_id is null;

update public.reorder_log rl
set business_id = u.business_id
from public.users u
where u.id = rl.user_id and rl.business_id is null;


-- ---------- 6. Backfill: supplier records from existing product strings ------
-- Creates one supplier per (business, supplier-name) found on products, using
-- the first non-empty supplier_email seen for that name. Existing supplier
-- text on products and historical POs is NOT modified.
insert into public.suppliers (business_id, name, ordering_email)
select
  u.business_id,
  trim(p.supplier),
  coalesce(min(nullif(p.supplier_email, '')), '')
from public.products p
join public.users u on u.id = p.user_id
where trim(p.supplier) <> ''
  and u.business_id is not null
  and not exists (
    select 1 from public.suppliers s
    where s.business_id = u.business_id
      and lower(trim(s.name)) = lower(trim(p.supplier))
  )
group by u.business_id, trim(p.supplier);

-- Link products to their supplier record by name match (per business).
update public.products p
set supplier_id = s.id
from public.suppliers s
join public.users u on u.id = p.user_id
where s.business_id = u.business_id
  and lower(trim(s.name)) = lower(trim(p.supplier))
  and p.supplier_id is null;

-- Link historical POs to supplier records where the name still matches.
-- supplier_name / supplier_email snapshots are left exactly as they are.
update public.purchase_orders po
set supplier_record_id = s.id
from public.suppliers s
join public.users u on u.id = po.user_id
where s.business_id = u.business_id
  and lower(trim(s.name)) = lower(trim(po.supplier_name))
  and po.supplier_record_id is null;


-- ---------- 7. RLS: businesses ----------------------------------------------
alter table public.businesses enable row level security;
drop policy if exists "businesses_select_member" on public.businesses;
drop policy if exists "businesses_insert_any" on public.businesses;
drop policy if exists "businesses_update_member" on public.businesses;
create policy "businesses_select_member" on public.businesses
  for select using (
    id = (select business_id from public.users where id = auth.uid())
  );
create policy "businesses_insert_any" on public.businesses
  for insert with check (auth.uid() is not null);
create policy "businesses_update_member" on public.businesses
  for update using (
    id = (select business_id from public.users where id = auth.uid())
  )
  with check (
    id = (select business_id from public.users where id = auth.uid())
  );


-- ---------- 8. RLS: suppliers (member-scoped) --------------------------------
alter table public.suppliers enable row level security;
drop policy if exists "suppliers_select" on public.suppliers;
drop policy if exists "suppliers_insert" on public.suppliers;
drop policy if exists "suppliers_update" on public.suppliers;
drop policy if exists "suppliers_delete" on public.suppliers;
create policy "suppliers_select" on public.suppliers
  for select using (
    business_id = (select business_id from public.users where id = auth.uid())
  );
create policy "suppliers_insert" on public.suppliers
  for insert with check (
    business_id = (select business_id from public.users where id = auth.uid())
  );
create policy "suppliers_update" on public.suppliers
  for update using (
    business_id = (select business_id from public.users where id = auth.uid())
  )
  with check (
    business_id = (select business_id from public.users where id = auth.uid())
  );
create policy "suppliers_delete" on public.suppliers
  for delete using (
    business_id = (select business_id from public.users where id = auth.uid())
  );


-- ---------- 9. RLS: business-aware policies on existing tables ---------------
-- Each policy accepts EITHER the legacy condition (auth.uid() = user_id) OR
-- business membership, so existing accounts keep full access and future
-- multi-user businesses (Chapter 7) inherit isolation automatically.

-- users: self row only (unchanged intent; adds business read for self)
drop policy if exists "users_select_self" on public.users;
drop policy if exists "users_update_self" on public.users;
create policy "users_select_self" on public.users
  for select using (auth.uid() = id);
create policy "users_update_self" on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- products
alter table public.products enable row level security;
drop policy if exists "products_select_own" on public.products;
drop policy if exists "products_insert_own" on public.products;
drop policy if exists "products_update_own" on public.products;
drop policy if exists "products_delete_own" on public.products;
create policy "products_select_own" on public.products
  for select using (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  );
create policy "products_insert_own" on public.products
  for insert with check (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  );
create policy "products_update_own" on public.products
  for update using (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  )
  with check (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  );
create policy "products_delete_own" on public.products
  for delete using (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  );

-- purchase_orders
alter table public.purchase_orders enable row level security;
drop policy if exists "purchase_orders_select_own" on public.purchase_orders;
drop policy if exists "purchase_orders_insert_own" on public.purchase_orders;
drop policy if exists "purchase_orders_update_own" on public.purchase_orders;
drop policy if exists "purchase_orders_delete_own" on public.purchase_orders;
create policy "purchase_orders_select_own" on public.purchase_orders
  for select using (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  );
create policy "purchase_orders_insert_own" on public.purchase_orders
  for insert with check (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  );
create policy "purchase_orders_update_own" on public.purchase_orders
  for update using (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  )
  with check (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  );
create policy "purchase_orders_delete_own" on public.purchase_orders
  for delete using (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  );

-- stocktakes
alter table public.stocktakes enable row level security;
drop policy if exists "stocktakes_select_own" on public.stocktakes;
drop policy if exists "stocktakes_insert_own" on public.stocktakes;
drop policy if exists "stocktakes_update_own" on public.stocktakes;
drop policy if exists "stocktakes_delete_own" on public.stocktakes;
create policy "stocktakes_select_own" on public.stocktakes
  for select using (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  );
create policy "stocktakes_insert_own" on public.stocktakes
  for insert with check (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  );
create policy "stocktakes_update_own" on public.stocktakes
  for update using (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  )
  with check (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  );
create policy "stocktakes_delete_own" on public.stocktakes
  for delete using (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  );

-- reorder_log
alter table public.reorder_log enable row level security;
drop policy if exists "reorder_log_select_own" on public.reorder_log;
drop policy if exists "reorder_log_insert_own" on public.reorder_log;
drop policy if exists "reorder_log_update_own" on public.reorder_log;
drop policy if exists "reorder_log_delete_own" on public.reorder_log;
create policy "reorder_log_select_own" on public.reorder_log
  for select using (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  );
create policy "reorder_log_insert_own" on public.reorder_log
  for insert with check (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  );
create policy "reorder_log_update_own" on public.reorder_log
  for update using (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  )
  with check (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  );
create policy "reorder_log_delete_own" on public.reorder_log
  for delete using (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  );

-- order_items / stocktake_items: policies unchanged (scoped via parent rows,
-- which are now business-aware through their own tables).


-- =============================================================================
-- VERIFICATION — run these after the migration and check each result
-- =============================================================================

-- 1. Every user has a business:
--    must return 0 rows
select id, email from public.users where business_id is null;

-- 2. Every data row has a business (must all be 0):
select count(*) as products_without_business
  from public.products where business_id is null;
select count(*) as pos_without_business
  from public.purchase_orders where business_id is null;
select count(*) as stocktakes_without_business
  from public.stocktakes where business_id is null;

-- 3. Supplier backfill sanity:
--    products with a supplier name but no supplier record (investigate if > 0;
--    they are still fully functional and readable — only the FK link is new)
select count(*) as products_with_name_without_record
  from public.products
 where trim(supplier) <> '' and supplier_id is null;

-- 4. Row counts unchanged vs your backup (compare with backup counts):
select 'products' t, count(*) from public.products
union all select 'purchase_orders', count(*) from public.purchase_orders
union all select 'order_items', count(*) from public.order_items
union all select 'stocktakes', count(*) from public.stocktakes
union all select 'stocktake_items', count(*) from public.stocktake_items
union all select 'reorder_log', count(*) from public.reorder_log
union all select 'suppliers', count(*) from public.suppliers
union all select 'businesses', count(*) from public.businesses;

-- 5. RLS active everywhere (rowsecurity = true for all 9 tables):
select tablename, rowsecurity from pg_tables where schemaname = 'public';
