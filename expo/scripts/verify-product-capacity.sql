-- LOCAL SYNTHETIC TEST ONLY. Existing fixture has two products in business One.
SET request.jwt.claim.role='service_role';
UPDATE public.business_entitlements SET product_limit=3 WHERE business_id='11111111-0000-4000-8000-000000000001';
INSERT INTO public.products(id,user_id,business_id,name,barcode,current_stock) VALUES
 ('00000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','11111111-0000-4000-8000-000000000001','Capacity test','004',0);
DO $$ BEGIN
 BEGIN
  INSERT INTO public.products(id,user_id,business_id,name,barcode,current_stock) VALUES
  ('00000000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','11111111-0000-4000-8000-000000000001','Over limit','005',0);
  RAISE EXCEPTION 'product limit bypass';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
-- Downgrade cannot delete products or prevent normal count/name edits.
UPDATE public.business_entitlements SET product_limit=1 WHERE business_id='11111111-0000-4000-8000-000000000001';
UPDATE public.products SET name='Still editable', current_stock=1 WHERE id='00000000-0000-4000-8000-000000000004';
DELETE FROM public.products WHERE id='00000000-0000-4000-8000-000000000004';
UPDATE public.business_entitlements SET product_limit=3 WHERE business_id='11111111-0000-4000-8000-000000000001';
DO $$ BEGIN
 BEGIN
  INSERT INTO public.products(id,user_id,business_id,name,barcode,current_stock) VALUES
  ('00000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','11111111-0000-4000-8000-000000000001','Batch1','004',0),
  ('00000000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','11111111-0000-4000-8000-000000000001','Batch2','005',0);
  RAISE EXCEPTION 'batch product bypass';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF (SELECT count(*) FROM public.products WHERE business_id='11111111-0000-4000-8000-000000000001') <> 2 THEN RAISE EXCEPTION 'partial product batch'; END IF;
END $$;
UPDATE public.business_entitlements SET product_limit=NULL WHERE business_id='11111111-0000-4000-8000-000000000001';
INSERT INTO public.products(id,user_id,business_id,name,barcode,current_stock) VALUES
 ('00000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','11111111-0000-4000-8000-000000000001','Unlimited','004',0);
DELETE FROM public.products WHERE id='00000000-0000-4000-8000-000000000004';
DELETE FROM public.business_entitlements WHERE business_id='11111111-0000-4000-8000-000000000001';
DO $$ BEGIN
 BEGIN
  INSERT INTO public.products(id,user_id,business_id,name,barcode,current_stock) VALUES
  ('00000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','11111111-0000-4000-8000-000000000001','Unconfigured','004',0);
  RAISE EXCEPTION 'missing product plan bypass';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF has_function_privilege('authenticated','public.enforce_product_capacity_v1()','EXECUTE') THEN RAISE EXCEPTION 'product RPC grant'; END IF;
 IF (SELECT count(*) FROM public.products) <> 3 OR (SELECT sum(current_stock) FROM public.products) <> 24 THEN RAISE EXCEPTION 'original products modified'; END IF;
END $$;
SELECT 'PASS product limits: boundary, batch rollback, downgrade/edit/delete, explicit unlimited, missing plan, original data preserved';
