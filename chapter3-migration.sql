-- =============================================================================
-- SmartStock — Chapter 3 migration: universal product and purchasing model
-- =============================================================================
-- ADDITIVE ONLY. Adds dedicated purchasing columns to `products` and order
-- purchasing snapshots to `order_items`. No existing column is dropped,
-- renamed or re-typed; no rows are deleted; existing supplier/stocktake/
-- reorder history and all Chapter 2 structures (businesses, suppliers,
-- ownership triggers, RLS) are untouched.
--
-- ⚠️ DO NOT RUN WITHOUT: (1) a verified pg_dump backup, (2) explicit owner
-- approval. Run in the Supabase SQL Editor in ONE execution (it is a single
-- transaction and idempotent — safe to re-run if it rolled back).
--
-- Expected result: "UPDATE n" / "ALTER TABLE" messages, no errors. Integrity
-- check queries are at the bottom.
--
-- Column semantics (app contract, expo/utils/purchasing.ts):
--   products.supplier_code        Supplier's own product code (POs show it).
--   products.stock_unit           Unit physical stock is counted in
--                                 (each / cartridge / m / roll). Preferred over
--                                 the legacy `unit`, which sometimes received
--                                 pack-size strings and is no longer written.
--   products.order_unit           Unit the product is ORDERED in
--                                 ("box of 1,000", "carton", "length").
--   products.units_per_order_unit Stock units per order unit (pack quantity).
--   products.purchase_price       Purchase price EX GST per the price basis.
--   products.price_basis_quantity Price refers to this many stock units (100 = per 100).
--   products.price_basis_unit     Unit the price basis refers to.
--   order_items.*                 Snapshots of the above at order time, plus
--                                 order_quantity (in ORDER units) and
--                                 line_total (ex GST). Historical rows keep
--                                 NULLs — `quantity` retains its original
--                                 stock-unit meaning forever.
-- =============================================================================

begin;

-- ---- products: dedicated purchasing columns ---------------------------------
alter table public.products add column if not exists supplier_code        text   not null default '';
alter table public.products add column if not exists stock_unit           text   not null default '';
alter table public.products add column if not exists order_unit           text   not null default '';
alter table public.products add column if not exists units_per_order_unit numeric not null default 1;
alter table public.products add column if not exists purchase_price       numeric;
alter table public.products add column if not exists price_basis_quantity numeric not null default 1;
alter table public.products add column if not exists price_basis_unit     text   not null default '';

-- Backfill: existing stock units live in the legacy `unit` column — UNLESS it
-- holds a pack-size description ("box of 12", "pack of 1000", "carton of 6").
-- Such strings must NEVER become a stock unit or a price-basis unit; those
-- rows are set to 'each' and the real pack size is entered in the app via
-- order_unit / units_per_order_unit. Price basis defaults to the stock unit.
update public.products
   set stock_unit = unit
 where stock_unit = ''
   and unit <> ''
   and unit !~ '[0-9]';   -- skip pack-size strings like "box of 12"

-- Price basis: prefer the cleaned stock unit; fall back to a CLEANED legacy
-- unit (digit-free only); pack-size strings fall back to 'each', never to the
-- pack description itself.
update public.products
   set price_basis_unit = case
         when stock_unit <> '' then stock_unit
         when unit <> '' and unit !~ '[0-9]' then unit
         else 'each'
       end
 where price_basis_unit = '';

-- Safety net (should find no rows after the statement above).
update public.products
   set price_basis_unit = 'each'
 where price_basis_unit = '';

-- ---- order_items: purchasing snapshots (nullable — preserves history) -------
alter table public.order_items add column if not exists supplier_code        text   not null default '';
alter table public.order_items add column if not exists order_unit           text   not null default '';
alter table public.order_items add column if not exists units_per_order_unit numeric;
alter table public.order_items add column if not exists order_quantity       numeric;
alter table public.order_items add column if not exists unit_price           numeric;
alter table public.order_items add column if not exists price_basis_quantity numeric;
alter table public.order_items add column if not exists price_basis_unit     text   not null default '';
alter table public.order_items add column if not exists line_total           numeric;

-- ---- indexes supporting import matching / duplicate protection -------------
-- Non-unique on purpose: legacy auto-generated barcodes may collide, and a
-- duplicate catalogue must be resolved by review, not by insert failure.
create index if not exists products_business_barcode_lower_idx
  on public.products (business_id, lower(trim(barcode)));
create index if not exists products_business_name_lower_idx
  on public.products (business_id, lower(trim(name)));

commit;

-- =============================================================================
-- Integrity checks (run after the transaction; SELECT-only, make no changes)
-- =============================================================================
-- Pack-size strings must never appear as stock or price-basis units:
--   select id, unit, stock_unit, price_basis_unit from public.products
--    where stock_unit ~ '[0-9]' or price_basis_unit ~ '[0-9]';
--   -- expected: 0 rows
--
-- Every product must have a non-empty price basis:
--   select count(*) from public.products where price_basis_unit = '';
--   -- expected: 0
--
-- Pack quantity must be positive where set:
--   select count(*) from public.products where units_per_order_unit is null or units_per_order_unit <= 0;
--   -- expected: 0
--
-- Historical order items unchanged (spot check — all NULL on new columns):
--   select count(*) from public.order_items where order_quantity is not null;
--   -- expected: 0 immediately after migration (grows only with new orders)
--
-- Row counts preserved:
--   select (select count(*) from public.products)       as products,
--          (select count(*) from public.purchase_orders) as purchase_orders,
--          (select count(*) from public.order_items)     as order_items;
