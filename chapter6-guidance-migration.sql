-- PREPARED ONLY. Not applied by automated development.
-- Back up and review on a test database before attended production deployment.
-- Existing products remain opted OUT. No counts, purchasing fields, RLS or
-- supplier data are changed. App hides guidance settings until columns exist.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.products
  ADD COLUMN desired_stock_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN desired_stock_quantity numeric;
ALTER TABLE public.products ADD CONSTRAINT products_desired_stock_valid CHECK (
  (desired_stock_quantity IS NULL OR
    (desired_stock_quantity >= 0 AND desired_stock_quantity <= 9007199254740991))
  AND (NOT desired_stock_enabled OR desired_stock_quantity IS NOT NULL)
);
COMMIT;
