-- =============================================================================
-- SmartStock — Add supplier_email to products
-- Run ONCE in your Supabase project (SQL Editor → New query → paste → Run).
-- Idempotent: safe to re-run.
--
-- Purpose:
--   Stores the supplier's email address on each product row so the
--   "low stock → grouped PO → email supplier" flow can auto-fill the
--   recipient without a separate supplier management screen.
--
-- The column is nullable; existing imports without an email continue to work
-- (the PO email composer simply opens with no recipient when missing).
-- =============================================================================

alter table public.products
  add column if not exists supplier_email text;

-- Optional: lightweight format check (commented out by default; uncomment if you
-- want the DB to reject obviously bad emails on insert/update).
-- alter table public.products
--   add constraint products_supplier_email_format
--   check (supplier_email is null or supplier_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
