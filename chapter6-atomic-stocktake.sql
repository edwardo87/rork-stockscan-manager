-- Prepared migration: test locally and review against production RLS before deployment.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.stocktakes ADD COLUMN submission_payload jsonb;
CREATE FUNCTION public.save_stocktake_v1(p_request_id uuid, p_items jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  prior public.stocktakes%ROWTYPE;
  entry jsonb;
  product public.products%ROWTYPE;
  expected numeric;
  actual numeric;
  affected integer;
BEGIN
  IF actor IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Sign in before saving a stocktake'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'Invalid stocktake'; END IF;
  IF jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 1000 THEN RAISE EXCEPTION 'Stocktake must contain 1 to 1000 products'; END IF;
  -- Same retry serialises, including concurrent requests after a lost response.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  SELECT * INTO prior FROM public.stocktakes WHERE id = p_request_id AND user_id = actor;
  IF FOUND THEN
    IF prior.submission_payload IS DISTINCT FROM p_items OR prior.status <> 'completed' THEN
      RAISE EXCEPTION 'Retry reference does not match the saved stocktake';
    END IF;
    RETURN prior.id; -- Never reapply older counts on retry.
  END IF;
  IF (SELECT count(DISTINCT value->>'productId') FROM jsonb_array_elements(p_items)) <> jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'Each product must appear exactly once';
  END IF;
  -- Deterministic product lock order also serialises different stocktakes.
  FOR entry IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'productId' LOOP
    IF jsonb_typeof(entry->'expectedQuantity') IS DISTINCT FROM 'number' OR
       jsonb_typeof(entry->'actualQuantity') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Invalid count';
    END IF;
    expected := (entry->>'expectedQuantity')::numeric;
    actual := (entry->>'actualQuantity')::numeric;
    IF NOT (expected BETWEEN 0 AND 9007199254740991 AND actual BETWEEN 0 AND 9007199254740991) THEN
      RAISE EXCEPTION 'Invalid count';
    END IF;
    SELECT * INTO product FROM public.products
      WHERE id = (entry->>'productId')::uuid AND user_id = actor FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product unavailable for this account'; END IF;
    IF product.current_stock IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'Stock count changed since this count started; refresh and review before saving';
    END IF;
  END LOOP;
  INSERT INTO public.stocktakes(id, user_id, date, status, submission_payload)
    VALUES (p_request_id, actor, now(), 'completed', p_items);
  FOR entry IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO product FROM public.products WHERE id = (entry->>'productId')::uuid AND user_id = actor;
    expected := (entry->>'expectedQuantity')::numeric;
    actual := (entry->>'actualQuantity')::numeric;
    INSERT INTO public.stocktake_items(stocktake_id, product_id, barcode, name, expected_quantity, actual_quantity, discrepancy)
      VALUES (p_request_id, product.id, product.barcode, product.name, expected, actual, actual - expected);
    UPDATE public.products SET current_stock = actual WHERE id = product.id AND user_id = actor;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'Product count could not be saved'; END IF;
  END LOOP;
  RETURN p_request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_stocktake_v1(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_stocktake_v1(uuid, jsonb) TO authenticated;
COMMIT;
