-- =============================================================================
-- SmartStock — Chapter 2 Migration: Business ownership + Supplier records
-- SECURITY-HARDENED REVISION (9 October 2026) — supersedes the 8 Oct draft.
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
--   • ATOMIC. The whole migration runs inside one transaction. Any failed
--     prerequisite, failed backfill or failed integrity check aborts the
--     ENTIRE transaction — the database is left exactly as it was.
--   • Idempotent: every statement is safe to re-run (IF NOT EXISTS /
--     WHERE NOT EXISTS / null-guarded updates).
--   • MEMBERSHIP IS TAMPER-PROOF (fixes the privilege-escalation finding):
--       - API users have NO column-level UPDATE privilege on public.users at
--         all (the app never updates that row; profiles live in businesses).
--       - A BEFORE UPDATE trigger additionally blocks any change to
--         users.business_id / users.role that does not come from trusted
--         database logic. A user can only claim a business THEY created.
--       - RLS alone cannot protect individual columns of a row the user owns;
--         the column grants + trigger close that hole.
--   • INSERT/UPDATE policies on data tables are tightened so no one can
--     attach their rows to (or move rows into) another business.
--   • Supplier backfill groups by the CASE-INSENSITIVE, TRIMMED name, so
--     'AWS', 'aws' and ' AWS ' become ONE supplier per business, and the
--     best available supplier email is preserved.
--   • One business is auto-created per existing user (created_by = the user);
--     every existing row is assigned to that business. The existing Lifestyle
--     Windows account keeps seeing all of its records exactly as before.
--   • New tables: businesses, suppliers.
--   • New columns: users.business_id (+ role hook for later chapters),
--     products.business_id + products.supplier_id (uuid FK),
--     purchase_orders.business_id + purchase_orders.supplier_record_id (uuid
--     FK — the existing TEXT supplier_id column is left untouched),
--     stocktakes.business_id, reorder_log.business_id.
--     order_items / stocktake_items stay scoped through their parents.
--   • Historical POs keep their supplier_name / supplier_email snapshots.
-- =============================================================================

begin;


-- ---------- 0. Prerequisites (fail fast, nothing applied if unmet) -----------
do $$
declare
  t text;
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at'
  ) then
    raise exception 'SmartStock prerequisite failed: public.set_updated_at() is missing. Run the supabase-full-setup.sql baseline first. Nothing has been changed.';
  end if;

  foreach t in array array['users','products','purchase_orders','order_items','stocktakes','stocktake_items','reorder_log'] loop
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      raise exception 'SmartStock prerequisite failed: table public.% is missing. Run the supabase-full-setup.sql baseline first. Nothing has been changed.', t;
    end if;
  end loop;
end $$;


-- ---------- 1. businesses ----------------------------------------------------
create table if not exists public.businesses (
  id               uuid primary key default gen_random_uuid(),
  name             text not null default '',
  contact_email    text not null default '',
  phone            text not null default '',
  address          text not null default '',
  delivery_address text not null default '',
  logo_url         text,
  created_by       uuid references auth.users(id) on delete set null,
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

-- One supplier name per business (case-insensitive, trimmed):
-- 'AWS', 'aws' and ' AWS ' are the same supplier within one business.
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
-- IMMUTABLE to API users: enforced by the column grants and trigger in section 7.
alter table public.users add column if not exists role text not null default 'owner';

alter table public.products        add column if not exists business_id uuid references public.businesses(id);
alter table public.products        add column if not exists supplier_id  uuid references public.suppliers(id);
alter table public.purchase_orders add column if not exists business_id       uuid references public.businesses(id);
alter table public.purchase_orders add column if not exists supplier_record_id uuid references public.suppliers(id);
alter table public.stocktakes      add column if not exists business_id uuid references public.businesses(id);
alter table public.reorder_log     add column if not exists business_id uuid references public.businesses(id);

create index if not exists products_business_idx        on public.products(business_id);
create index if not exists products_supplier_id_idx     on public.products(supplier_id);
create index if not exists purchase_orders_business_idx on public.purchase_orders(business_id);
create index if not exists stocktakes_business_idx      on public.stocktakes(business_id);
create index if not exists reorder_log_business_idx     on public.reorder_log(business_id);


-- ---------- 4. Backfill: one business per existing user ----------------------
-- Idempotent: only creates a business for users that do not have one yet.
-- Business name is derived from the account email's local part; the user can
-- rename it in the app (Business Profile, next stage). created_by records
-- which user established the business — this is what makes first-time
-- membership claims secure (see section 7).
insert into public.businesses (name, contact_email, created_by)
select
  case
    when position('@' in u.email) > 1
      then initcap(split_part(u.email, '@', 1)) || ' (Business)'
    else 'My Business'
  end,
  u.email,
  u.id
from public.users u
where not exists (
  select 1 from public.businesses b where b.contact_email = u.email
);

-- Safety net if a pre-Chapter-2-draft businesses table existed without created_by.
update public.businesses b
set created_by = u.id
from public.users u
where u.email = b.contact_email
  and b.created_by is null;

-- Assign every user to their business (matched by contact_email).
-- Runs as a privileged SQL session (no JWT claims) — permitted by the
-- membership guard trigger in section 7.
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
-- Groups by the CASE-INSENSITIVE, TRIMMED supplier name so that 'AWS', 'aws'
-- and ' AWS ' produce ONE supplier per business (the unique index can no
-- longer be violated by spelling variants). The canonical display name is the
-- alphabetically-first trimmed spelling seen. Supplier emails are preserved:
-- the best non-empty product.supplier_email in the group is used, and existing
-- supplier records with an empty email are topped up afterwards. Existing
-- supplier text on products and historical POs is NOT modified.
insert into public.suppliers (business_id, name, ordering_email)
select src.business_id, src.name, coalesce(src.email, '')
from (
  select
    u.business_id,
    min(trim(p.supplier)) as name,
    lower(trim(p.supplier)) as name_key,
    min(nullif(trim(coalesce(p.supplier_email, '')), '')) as email
  from public.products p
  join public.users u on u.id = p.user_id
  where trim(p.supplier) <> ''
    and u.business_id is not null
  group by u.business_id, lower(trim(p.supplier))
) src
where not exists (
  select 1 from public.suppliers s
  where s.business_id = src.business_id
    and lower(trim(s.name)) = src.name_key
);

-- Preserve emails: fill in supplier records that exist but have no email yet.
update public.suppliers s
set ordering_email = src.email
from (
  select
    u.business_id,
    lower(trim(p.supplier)) as name_key,
    min(nullif(trim(coalesce(p.supplier_email, '')), '')) as email
  from public.products p
  join public.users u on u.id = p.user_id
  where trim(p.supplier) <> ''
    and u.business_id is not null
  group by u.business_id, lower(trim(p.supplier))
) src
where s.business_id = src.business_id
  and lower(trim(s.name)) = src.name_key
  and (s.ordering_email is null or s.ordering_email = '')
  and src.email is not null;

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
  and trim(po.supplier_name) <> ''
  and po.supplier_record_id is null;


-- ---------- 7. Membership security (trusted database logic) ------------------
-- Fixes the privilege-escalation finding: a user-owned RLS policy cannot
-- protect individual columns (users.business_id, users.role). Three layers:
--   (a) Column grants: API roles get NO update privilege on public.users.
--   (b) Trigger: even a privileged/accidental UPDATE cannot change
--       business_id or role except via trusted paths.
--   (c) claim_my_business(): the ONLY way an API user may establish
--       membership — and only into a business THEY created (created_by).

create or replace function public.enforce_users_membership_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Privileged SQL sessions (this migration, admin tools) carry no JWT
  -- claims; PostgREST always sets them. Only claim-less sessions pass freely.
  if current_setting('request.jwt.claims', true) is null then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'SmartStock: users.role is immutable to API users. Role changes happen only through trusted database logic.';
  end if;

  if new.business_id is distinct from old.business_id then
    if old.business_id is not null then
      raise exception 'SmartStock: business membership cannot be changed via the API.';
    end if;
    -- First-time claim only: the target business must have been created by
    -- the very user making the change.
    if not exists (
      select 1 from public.businesses b
      where b.id = new.business_id and b.created_by = auth.uid()
    ) then
      raise exception 'SmartStock: a user may only join a business they created themselves.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_users_membership_guard on public.users;
create trigger trg_users_membership_guard
  before update on public.users
  for each row execute function public.enforce_users_membership_guard();

-- (a) Column grants: the app never PATCHes public.users today (verified by
-- code search). Business-profile data lives in public.businesses.
revoke update on table public.users from authenticated;
revoke update on table public.users from anon;

-- (c) Trusted claim function — used by the app from the Chapter 2
-- business-profile stage onwards. No-op for the current app version.
create or replace function public.claim_my_business(p_business_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_bid  uuid;
begin
  if v_uid is null then
    raise exception 'SmartStock: authentication required.';
  end if;

  select b.id into v_bid
  from public.businesses b
  where b.id = p_business_id and b.created_by = v_uid;

  if v_bid is null then
    raise exception 'SmartStock: business not found or not created by you.';
  end if;

  update public.users u
  set business_id = v_bid
  where u.id = v_uid and u.business_id is null;

  if not found then
    raise exception 'SmartStock: this account already has a business.';
  end if;

  return v_bid;
end;
$$;

revoke execute on function public.claim_my_business(uuid) from public, anon;
grant execute on function public.claim_my_business(uuid) to authenticated;

-- businesses table: API users may edit profile fields only — never id,
-- created_by or created_at.
revoke update on table public.businesses from authenticated;
revoke update on table public.businesses from anon;
grant update (name, contact_email, phone, address, delivery_address, logo_url)
  on table public.businesses to authenticated;


-- ---------- 8. RLS: businesses ----------------------------------------------
alter table public.businesses enable row level security;
drop policy if exists "businesses_select_member" on public.businesses;
drop policy if exists "businesses_insert_own" on public.businesses;
drop policy if exists "businesses_insert_any" on public.businesses;
drop policy if exists "businesses_update_member" on public.businesses;
create policy "businesses_select_member" on public.businesses
  for select using (
    id = (select business_id from public.users where id = auth.uid())
  );
-- A user may only establish a business that records THEM as the creator.
create policy "businesses_insert_own" on public.businesses
  for insert with check (created_by = auth.uid());
create policy "businesses_update_member" on public.businesses
  for update using (
    id = (select business_id from public.users where id = auth.uid())
  )
  with check (
    id = (select business_id from public.users where id = auth.uid())
  );


-- ---------- 9. RLS: suppliers (member-scoped) --------------------------------
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


-- ---------- 10. RLS: business-aware policies on existing tables --------------
-- SELECT/DELETE: EITHER the legacy condition (auth.uid() = user_id) OR
-- business membership — existing accounts keep full access.
-- INSERT/UPDATE (with check): the row's FINAL state must be legitimate —
--   either a legacy self-owned row with no business, or a row inside the
--   caller's OWN business. This closes the hole where a user could insert or
--   move a row into another business while satisfying a user_id-only check.
--
-- (The identical block is applied to products, purchase_orders, stocktakes
-- and reorder_log.)

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
    and (business_id is null or business_id = (select business_id from public.users where id = auth.uid()))
  );
create policy "products_update_own" on public.products
  for update using (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  )
  with check (
    (business_id is null and auth.uid() = user_id)
    or (business_id is not null and business_id = (select business_id from public.users where id = auth.uid()))
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
    and (business_id is null or business_id = (select business_id from public.users where id = auth.uid()))
  );
create policy "purchase_orders_update_own" on public.purchase_orders
  for update using (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  )
  with check (
    (business_id is null and auth.uid() = user_id)
    or (business_id is not null and business_id = (select business_id from public.users where id = auth.uid()))
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
    and (business_id is null or business_id = (select business_id from public.users where id = auth.uid()))
  );
create policy "stocktakes_update_own" on public.stocktakes
  for update using (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  )
  with check (
    (business_id is null and auth.uid() = user_id)
    or (business_id is not null and business_id = (select business_id from public.users where id = auth.uid()))
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
    and (business_id is null or business_id = (select business_id from public.users where id = auth.uid()))
  );
create policy "reorder_log_update_own" on public.reorder_log
  for update using (
    auth.uid() = user_id
    or business_id = (select business_id from public.users where id = auth.uid())
  )
  with check (
    (business_id is null and auth.uid() = user_id)
    or (business_id is not null and business_id = (select business_id from public.users where id = auth.uid()))
  );

-- order_items / stocktake_items: policies unchanged (scoped via parent rows,
-- which are now business-aware through their own tables).


-- ---------- 11. Integrity gate (aborts the ENTIRE transaction if unmet) ------
do $$
begin
  if exists (select 1 from public.users where business_id is null) then
    raise exception 'SmartStock migration ABORTED: some users have no business. The transaction was rolled back — nothing was applied.';
  end if;
  if exists (select 1 from public.products where business_id is null) then
    raise exception 'SmartStock migration ABORTED: some products have no business. The transaction was rolled back — nothing was applied.';
  end if;
  if exists (select 1 from public.purchase_orders where business_id is null) then
    raise exception 'SmartStock migration ABORTED: some purchase orders have no business. The transaction was rolled back — nothing was applied.';
  end if;
  if exists (select 1 from public.stocktakes where business_id is null) then
    raise exception 'SmartStock migration ABORTED: some stocktakes have no business. The transaction was rolled back — nothing was applied.';
  end if;
  if exists (select 1 from public.reorder_log where business_id is null) then
    raise exception 'SmartStock migration ABORTED: some reorder_log rows have no business. The transaction was rolled back — nothing was applied.';
  end if;
end $$;

commit;

-- =============================================================================
-- POST-MIGRATION VERIFICATION — run these after the script succeeds.
-- Security (negative-access) tests are in chapter2-db-safeguards.md §5.
-- =============================================================================

-- 1. Every user has a business (belt-and-braces; section 11 already enforced):
--    must return 0 rows
select id, email from public.users where business_id is null;

-- 2. Every data row has a business (must all be 0):
select count(*) as products_without_business
  from public.products where business_id is null;
select count(*) as pos_without_business
  from public.purchase_orders where business_id is null;
select count(*) as stocktakes_without_business
  from public.stocktakes where business_id is null;
select count(*) as reorder_log_without_business
  from public.reorder_log where business_id is null;

-- 3. Supplier backfill sanity:
--    (a) every distinct product supplier name must map to exactly one
--        supplier record (must return 0 rows):
select u.business_id, lower(trim(p.supplier)) as supplier_name,
       count(distinct s.id) as supplier_records
  from public.products p
  join public.users u on u.id = p.user_id
  left join public.suppliers s
    on s.business_id = u.business_id
   and lower(trim(s.name)) = lower(trim(p.supplier))
 where trim(p.supplier) <> ''
 group by u.business_id, lower(trim(p.supplier))
 having count(distinct s.id) <> 1;
--    (b) products with a supplier name but no supplier record (investigate if
--        > 0; they remain fully functional — only the new FK link is absent):
select count(*) as products_with_name_without_record
  from public.products
 where trim(supplier) <> '' and supplier_id is null;

-- 4. Row counts unchanged vs your backup (products, purchase_orders,
--    order_items, stocktakes, stocktake_items, reorder_log must MATCH the
--    backup exactly; suppliers/businesses are new):
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

-- 6. users is locked down: this must return NO update grants for
--    authenticated/anon on public.users:
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'users'
   and grantee in ('authenticated', 'anon')
   and privilege_type = 'UPDATE';
