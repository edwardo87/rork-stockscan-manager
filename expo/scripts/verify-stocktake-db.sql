\set ON_ERROR_STOP on
SET row_security = on;
SET ROLE authenticated;
SET request.jwt.claim.role = 'authenticated';
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
SELECT public.save_stocktake_v1('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '[{"productId":"00000000-0000-4000-8000-000000000001","expectedQuantity":10,"actualQuantity":0}]');
DO $$ BEGIN
 IF (SELECT count(*) FROM public.stocktakes) <> 1 OR (SELECT count(*) FROM public.stocktake_items) <> 1 THEN RAISE EXCEPTION 'FAIL success rows'; END IF;
 IF (SELECT current_stock FROM public.products WHERE barcode='001') <> 0 THEN RAISE EXCEPTION 'FAIL zero count'; END IF;
END $$;
UPDATE public.products SET current_stock=99 WHERE barcode='001';
SELECT public.save_stocktake_v1('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '[{"productId":"00000000-0000-4000-8000-000000000001","expectedQuantity":10,"actualQuantity":0}]');
DO $$ BEGIN
 IF (SELECT current_stock FROM public.products WHERE barcode='001') <> 99 OR (SELECT count(*) FROM public.stocktakes) <> 1 THEN RAISE EXCEPTION 'FAIL retry rewrote newer count or duplicated'; END IF;
END $$;
DO $$ BEGIN
 BEGIN
  PERFORM public.save_stocktake_v1('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '[{"productId":"00000000-0000-4000-8000-000000000001","expectedQuantity":99,"actualQuantity":4},{"productId":"00000000-0000-4000-8000-000000000002","expectedQuantity":5,"actualQuantity":13}]');
  RAISE EXCEPTION 'FAIL expected injected failure';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Injected update failure' THEN RAISE; END IF; END;
 IF (SELECT current_stock FROM public.products WHERE barcode='001') <> 99 OR (SELECT count(*) FROM public.stocktakes) <> 1 OR (SELECT count(*) FROM public.stocktake_items) <> 1 THEN RAISE EXCEPTION 'FAIL partial write survived rollback'; END IF;
END $$;
DO $$ DECLARE bad jsonb; BEGIN
 FOR bad IN SELECT value FROM jsonb_array_elements('[
 [{"productId":"00000000-0000-4000-8000-000000000003","expectedQuantity":9,"actualQuantity":1}],
 [{"productId":"00000000-0000-4000-8000-000000000001","expectedQuantity":10,"actualQuantity":1}],
 [{"productId":"00000000-0000-4000-8000-000000000001","expectedQuantity":99,"actualQuantity":-1}],
 [{"productId":"00000000-0000-4000-8000-000000000001","expectedQuantity":99,"actualQuantity":"NaN"}],
 [{"productId":"00000000-0000-4000-8000-000000000001","expectedQuantity":99,"actualQuantity":1},{"productId":"00000000-0000-4000-8000-000000000001","expectedQuantity":99,"actualQuantity":1}],
 []]') LOOP
  BEGIN
   PERFORM public.save_stocktake_v1('cccccccc-cccc-4ccc-8ccc-cccccccccccc',bad);
   RAISE EXCEPTION 'FAIL accepted invalid or foreign count';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
 END LOOP;
 IF (SELECT count(*) FROM public.stocktakes) <> 1 THEN RAISE EXCEPTION 'FAIL rejection left parent'; END IF;
END $$;
SELECT public.save_stocktake_v1('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '[{"productId":"00000000-0000-4000-8000-000000000002","expectedQuantity":5,"actualQuantity":2.5}]');
DO $$ BEGIN IF (SELECT current_stock FROM public.products WHERE barcode='002') <> 2.5 THEN RAISE EXCEPTION 'FAIL decimal count'; END IF; END $$;
SELECT 'PASS: atomic writes, zero/decimal counts, rollback after mid-save failure, retry no-op, stale count conflict, cross-owner denial and invalid inputs' AS result;
