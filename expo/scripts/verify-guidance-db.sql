\set ON_ERROR_STOP on
SET row_security = on;
SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
SET request.jwt.claim.role = 'authenticated';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.products WHERE desired_stock_enabled OR desired_stock_quantity IS NOT NULL) THEN RAISE EXCEPTION 'FAIL guidance must default off'; END IF;
END $$;
UPDATE public.products SET desired_stock_enabled=true, desired_stock_quantity=0 WHERE barcode='001';
UPDATE public.products SET desired_stock_quantity=12.5 WHERE barcode='001';
DO $$ DECLARE invalid numeric; BEGIN
 FOREACH invalid IN ARRAY ARRAY[-1::numeric, 'NaN'::numeric, 'Infinity'::numeric] LOOP
  BEGIN
   UPDATE public.products SET desired_stock_quantity=invalid WHERE barcode='001';
   RAISE EXCEPTION 'FAIL invalid target accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
 END LOOP;
 BEGIN
  UPDATE public.products SET desired_stock_quantity=NULL WHERE barcode='001';
  RAISE EXCEPTION 'FAIL enabled target may not be null';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF (SELECT desired_stock_quantity FROM public.products WHERE barcode='001') <> 12.5 THEN RAISE EXCEPTION 'FAIL valid target changed'; END IF;
END $$;
UPDATE public.products SET desired_stock_enabled=false, desired_stock_quantity=NULL WHERE barcode='001';
SELECT 'PASS guidance defaults, zero/decimal target, disabled state and invalid-target constraints' AS result;
