\set ON_ERROR_STOP on
DO $$ BEGIN
 IF (SELECT count(*) FROM public.stocktakes WHERE id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') <> 1 THEN RAISE EXCEPTION 'Duplicate or missing session'; END IF;
 IF (SELECT count(*) FROM public.stocktake_items WHERE stocktake_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') <> 1 THEN RAISE EXCEPTION 'Duplicate or missing lines'; END IF;
 IF (SELECT current_stock FROM public.products WHERE barcode='001') <> 7 THEN RAISE EXCEPTION 'Wrong final count'; END IF;
END $$;
SELECT 'PASS simultaneous retries produce one session and one set of lines' AS result;
