-- =============================================================================
-- SmartStock — Chapter 3 ROLLBACK: universal product and purchasing model
-- =============================================================================
-- Reverses chapter3-migration.sql by dropping ONLY the columns and indexes it
-- added. Run in the Supabase SQL Editor as ONE execution (single transaction,
-- idempotent).
--
-- WHAT IS LOST (permanent):
--   - Supplier product codes, stock/order units, pack quantities, ex-GST
--     purchase prices, price bases and purchasing snapshots on order items
--     recorded while Chapter 3 was live.
--
-- WHAT IS PRESERVED (unchanged):
--   - All pre-Chapter 3 data: products (including the original `unit`,
--     supplier, stock and pricing columns), purchase orders, order_items
--     `quantity` (stock-unit values), stocktakes, reorder_log, users,
--     businesses, suppliers and ALL Chapter 2 structures, triggers, RLS.
-- =============================================================================

begin;

-- Indexes supporting import matching
drop index if exists public.products_business_barcode_lower_idx;
drop index if exists public.products_business_name_lower_idx;

-- order_items purchasing snapshots
alter table public.order_items drop column if exists line_total;
alter table public.order_items drop column if exists price_basis_unit;
alter table public.order_items drop column if exists price_basis_quantity;
alter table public.order_items drop column if exists unit_price;
alter table public.order_items drop column if exists order_quantity;
alter table public.order_items drop column if exists units_per_order_unit;
alter table public.order_items drop column if exists order_unit;
alter table public.order_items drop column if exists supplier_code;

-- products purchasing columns
alter table public.products drop column if exists price_basis_unit;
alter table public.products drop column if exists price_basis_quantity;
alter table public.products drop column if exists purchase_price;
alter table public.products drop column if exists units_per_order_unit;
alter table public.products drop column if exists order_unit;
alter table public.products drop column if exists stock_unit;
alter table public.products drop column if exists supplier_code;

commit;

-- Post-rollback integrity check: the original schema is intact.
--   select count(*) from public.products where unit is null;
--   -- expected: 0
