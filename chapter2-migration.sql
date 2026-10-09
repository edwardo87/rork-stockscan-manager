-- =============================================================================
-- SmartStock — Chapter 2 Migration: Business ownership + Supplier records
-- SECURITY-HARDENED REVISION 3 (9 October 2026). Supersedes revision 2.
-- Revision 3: claim_my_business() now also assigns the claiming user's
-- still-unassigned records (business_id IS NULL) to the claimed business,
-- atomically with the membership update.
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor → paste this file → Run.
--
-- PREREQUISITE (mandatory): a verified backup must exist first.
--   See chapter2-db-safeguards.md §1 for the backup + verification procedure.
--
-- Design principles:
--   • ADDITIVE ONLY. No existing column is dropped, renamed or retyped.
--     No row is deleted. Every RLS policy accepts EITHER the old
--     user-owns-row condition OR the new business-membership condition, so
--     existing users keep full access.
--   • ATOMIC. The whole migration is one transaction. Any failed
--     prerequisite, failed backfill or failed integrity check aborts the
--     ENTIRE transaction — the database is left exactly as it was.
--   • Idempotent: every statement is safe to re-run.
--   • MEMBERSHIP IS TAMPER-PROOF:
--       - API roles have NO column-level UPDATE privilege on public.users.
--       - A guard trigger blocks any API change to users.business_id /
--         users.role. The ONLY privileged bypass is an explicit service_role
--         JWT (trusted backend). Absence of JWT claims grants NOTHING.
--         The migration itself temporarily DISABLES the guard trigger for
--         its own privileged backfill (a table-owner SQL action that API
--         users can never perform) and re-enables it immediately after.
--       - claim_my_business() is the only API path to establish membership,
--         and only into a business the caller created (businesses.created_by).
--         A successful first-time claim ALSO assigns that user's existing
--         business_id-NULL records (products / purchase_orders / stocktakes /
--         reorder_log) to the claimed business — atomically, touching no
--         other column and no row already assigned to any business.
--   • BUSINESS OWNERSHIP OF NEW RECORDS IS DATABASE-ENFORCED:
--       - BEFORE INSERT triggers on products, purchase_orders, stocktakes
--         and reorder_log populate business_id from the inserting user's
--         membership (null for pre-claim users — legacy compatible) and
--         reject cross-business values.
--       - Composite foreign keys (supplier_id, business_id) → suppliers
--         guarantee a product or PO can never link to a supplier from a
--         different business — enforced by the database, not the app.
--   • Supplier backfill groups by the CASE-INSENSITIVE, TRIMMED name:
--     'AWS', 'aws' and ' AWS ' become ONE supplier per business; emails are
--     preserved; re-runs create no duplicates.
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

-- Target for the composite foreign keys added in section 3 (supplier
-- consistency: a product/PO link is only valid within the same business).
create unique index if not exists suppliers_id_business_uq
  on public.suppliers (id, business_id);

create index if not exists suppliers_business_idx on public.suppliers(business_id);

drop trigger if exists trg_suppliers_updated_at on public.suppliers;
create trigger trg_suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();


-- ---------- 3. New columns on existing tables --------------------------------
alter table public.users add column if not exists business_id uuid references public.businesses(id);
-- role is a forward hook for Chapter 7 (owner/admin/staff). Not used by the app yet.
-- IMMUTABLE to API users: enforced by the column grants (section 9) and the
-- membership guard trigger (section 4).
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

-- Supplier/business consistency (CORRECTION 4): declarative composite FKs.
-- (supplier_id, business_id) must reference a suppliers row with the SAME
-- business. With MATCH SIMPLE semantics, rows where either column is NULL
-- (legacy app inserts before Stage 4) are not constrained — so current app
-- behaviour is untouched. Once both columns are populated, the database
-- itself rejects any cross-business supplier link, on INSERT and UPDATE.
do $$
begin
  alter table public.products add constraint products_supplier_record_consistent_fk
    foreign key (supplier_id, business_id) references public.suppliers (id, business_id);
exception when duplicate_object then null; -- already applied (idempotent re-run)
end $$;

do $$
begin
  alter table public.purchase_orders add constraint purchase_orders_supplier_record_consistent_fk
    foreign key (supplier_record_id, business_id) references public.suppliers (id, business_id);
exception when duplicate_object then null;
end $$;


-- ---------- 4. Membership guard (created BEFORE the backfill uses it) --------
-- CORRECTION 2. A row-level policy such as `using (auth.uid() = id)` cannot
-- protect individual columns of a row the user owns (users.business_id,
-- users.role). Layers:
--   (a) Column grants (section 9): API roles get NO update privilege.
--   (b) This guard trigger: rejects any API change to role (immutable) or to
--       business_id unless it is a first-time claim into a business the same
--       user created. The ONLY bypass is an explicit service_role JWT — the
--       PRESENCE of a service_role claim, NOT the absence of claims, is what
--       marks a trusted operation. API users can never forge it. Privileged
--       migration sessions instead disable the trigger explicitly, below —
--       a table-owner action unreachable from the API.
--   (c) claim_my_business() RPC (section 9): the ONLY API path for
--       establishing membership; cannot switch an existing membership and
--       never touches role.
create or replace function public.enforce_users_membership_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Explicit trust boundary: a service_role JWT only. Sessions with no JWT
  -- claims (direct SQL / SQL Editor) are NOT treated as administrators —
  -- they are subject to the same customer rules and must explicitly disable
  -- this trigger (as below) for privileged backfills.
  if auth.role() = 'service_role' then
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


-- ---------- 5. Backfill: one business per existing user ----------------------
-- Idempotent: only creates a business for users that do not have one yet.
-- created_by records which user established the business — this is what makes
-- first-time membership claims secure (see section 4).
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
-- The membership guard trigger is disabled for THIS statement only: this SQL
-- Editor session is the table owner and carries no service_role JWT, so the
-- trigger's customer rules would (correctly) reject the backfill. Disabling
-- a trigger requires table ownership — impossible for API users.
alter table public.users disable trigger trg_users_membership_guard;

update public.users u
set business_id = b.id
from public.businesses b
where b.contact_email = u.email
  and u.business_id is null;

alter table public.users enable trigger trg_users_membership_guard;


-- ---------- 6. Backfill: business_id on all existing data rows ---------------
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


-- ---------- 7. Backfill: supplier records from existing product strings ------
-- Groups by the CASE-INSENSITIVE, TRIMMED supplier name so that 'AWS', 'aws'
-- and ' AWS ' produce ONE supplier per business (the unique index can no
-- longer be violated by spelling variants). The canonical display name is the
-- alphabetically-first trimmed spelling seen. Emails are preserved: the best
-- non-empty product.supplier_email in the group is used, and existing supplier
-- records with an empty email are topped up afterwards. Existing supplier
-- text on products and historical POs is NOT modified.
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
-- CORRECTION 7: plain comma-separated FROM list — no JOIN clauses referencing
-- the target-table alias (UPDATE ... FROM with ON conditions that reference
-- the target is at best ambiguous; this form is unambiguous and standard).
update public.products p
set supplier_id = s.id
from public.suppliers s, public.users u
where u.id = p.user_id
  and s.business_id = u.business_id
  and lower(trim(s.name)) = lower(trim(p.supplier))
  and p.supplier_id is null;

-- Link historical POs to supplier records where the name still matches.
-- supplier_name / supplier_email snapshots are left exactly as they are.
update public.purchase_orders po
set supplier_record_id = s.id
from public.suppliers s, public.users u
where u.id = po.user_id
  and s.business_id = u.business_id
  and lower(trim(s.name)) = lower(trim(po.supplier_name))
  and trim(po.supplier_name) <> ''
  and po.supplier_record_id is null;


-- ---------- 8. Business ownership of NEW records (CORRECTION 3) --------------
-- The current app inserts products / POs / stocktakes / reorder_log rows with
-- business_id omitted (null). These BEFORE INSERT triggers populate it from
-- the inserting user's membership and validate any explicit value:
--   • member user, business_id omitted  → filled with their business.
--   • member user, business_id provided → must equal their own business.
--   • pre-claim user (no business yet)  → stays null (legacy compatible);
--     they cannot attach rows to ANY business until they claim one.
-- When a pre-claim user later runs claim_my_business() (section 9), all of
-- their business_id-null records are backfilled to the claimed business
-- atomically — see the function body.
-- RLS WITH CHECK (section 11) then re-validates the final row, so the
-- trigger and the policy agree. Bypass only for an explicit service_role
-- JWT (trusted backend); claim-less direct SQL sessions that try to set a
-- business_id are correctly rejected.
create or replace function public.enforce_business_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_own uuid;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  select business_id into v_own from public.users where id = auth.uid();

  if new.business_id is null then
    new.business_id := v_own; -- null stays null for pre-claim users
  elsif v_own is null or new.business_id <> v_own then
    raise exception 'SmartStock: business_id must reference your own business.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_products_business_owner on public.products;
create trigger trg_products_business_owner
  before insert on public.products
  for each row execute function public.enforce_business_ownership();

drop trigger if exists trg_purchase_orders_business_owner on public.purchase_orders;
create trigger trg_purchase_orders_business_owner
  before insert on public.purchase_orders
  for each row execute function public.enforce_business_ownership();

drop trigger if exists trg_stocktakes_business_owner on public.stocktakes;
create trigger trg_stocktakes_business_owner
  before insert on public.stocktakes
  for each row execute function public.enforce_business_ownership();

drop trigger if exists trg_reorder_log_business_owner on public.reorder_log;
create trigger trg_reorder_log_business_owner
  before insert on public.reorder_log
  for each row execute function public.enforce_business_ownership();


-- ---------- 9. Membership grants and trusted claim RPC (CORRECTION 2) --------
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

  if p_business_id is null then
    raise exception 'SmartStock: a business id is required.';
  end if;

  select b.id into v_bid
  from public.businesses b
  where b.id = p_business_id and b.created_by = v_uid;

  if v_bid is null then
    raise exception 'SmartStock: business not found or not created by you.';
  end if;

  -- Cannot switch membership: only fills a NULL business_id.
  -- NOTE on the guard trigger (CORRECTION 3 / review follow-up): this UPDATE
  -- fires trg_users_membership_guard normally, even though this function is
  -- SECURITY DEFINER (triggers always fire; definer only changes privileges).
  -- It passes legitimately: the caller is authenticated (NOT service_role),
  -- old.business_id IS null (first-time claim), and the guard's own check
  -- re-verifies businesses.created_by = auth.uid() — the same condition the
  -- lookup above enforced. auth.uid() inside the function still resolves from
  -- the caller's JWT, so the guard validates the REAL caller, not the definer.
  update public.users u
  set business_id = v_bid
  where u.id = v_uid and u.business_id is null;

  if not found then
    raise exception 'SmartStock: this account already has a business.';
  end if;

  -- CORRECTION 3 (review follow-up): first-time-claim record backfill.
  -- Assign the user's still-unassigned records to the newly claimed business.
  -- Guarantees:
  --   • only rows OWNED by the authenticated user (user_id = caller);
  --   • only rows where business_id IS NULL — rows already assigned to ANY
  --     business (own or another) are never touched;
  --   • ONLY the business_id column changes — stock quantities, order
  --     details, supplier_name / supplier_email snapshots and every other
  --     column are left exactly as they are.
  -- Runs in the SAME transaction as the membership update above (PostgREST
  -- wraps the RPC call in a transaction): if any statement fails, the whole
  -- claim — membership AND backfill — rolls back together, leaving no partial
  -- changes. SECURITY DEFINER (owner) execution means RLS does not silently
  -- filter these UPDATEs mid-claim; the user_id filter is the scope.
  update public.products p
     set business_id = v_bid
   where p.user_id = v_uid
     and p.business_id is null;

  update public.purchase_orders po
     set business_id = v_bid
   where po.user_id = v_uid
     and po.business_id is null;

  update public.stocktakes st
     set business_id = v_bid
   where st.user_id = v_uid
     and st.business_id is null;

  update public.reorder_log rl
     set business_id = v_bid
   where rl.user_id = v_uid
     and rl.business_id is null;

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


-- ---------- 10. RLS: businesses ----------------------------------------------
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
-- (This is the secure first-time-membership path: insert own business with
-- created_by = self, then claim it via claim_my_business().)
create policy "businesses_insert_own" on public.businesses
  for insert with check (created_by = auth.uid());
create policy "businesses_update_member" on public.businesses
  for update using (
    id = (select business_id from public.users where id = auth.uid())
  )
  with check (
    id = (select business_id from public.users where id = auth.uid())
  );


-- ---------- 11. RLS: suppliers (member-scoped) -------------------------------
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


-- ---------- 12. RLS: business-aware policies on existing tables --------------
-- SELECT/DELETE: EITHER the legacy condition (auth.uid() = user_id) OR
-- business membership — existing accounts keep full access.
-- INSERT/UPDATE (WITH CHECK): the row's FINAL state (evaluated AFTER the
-- section 8 ownership triggers have populated business_id) must be legitimate
-- — either a legacy self-owned row with no business, or a row inside the
-- caller's OWN business. No one can create or move rows into another business.
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


-- ---------- 13. Integrity gate (aborts the ENTIRE transaction if unmet) ------
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

-- 1. Every user has a business (belt-and-braces; section 13 already enforced):
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

-- 7. Enforcement objects present (guard trigger, 4 ownership triggers,
--    composite FKs; must list 1 + 4 triggers and 2 constraints):
select tgrelid::regclass as table_name, tgname
  from pg_trigger
 where not tgisinternal
   and tgname in ('trg_users_membership_guard',
                  'trg_products_business_owner',
                  'trg_purchase_orders_business_owner',
                  'trg_stocktakes_business_owner',
                  'trg_reorder_log_business_owner');
select conname from pg_constraint
 where conname in ('products_supplier_record_consistent_fk',
                   'purchase_orders_supplier_record_consistent_fk');
