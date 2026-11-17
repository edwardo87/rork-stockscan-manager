-- PREPARED ONLY. Requires configured plans AND business-scoped onboarding before release.
-- New unassigned products are rejected; existing records remain editable/deletable.
-- Does not replace authorization, permit tenant moves, or activate billing.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE FUNCTION public.enforce_product_capacity_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' AS $$
DECLARE capacity integer; used bigint;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.business_id IS NOT DISTINCT FROM NEW.business_id THEN RETURN NEW; END IF;
 END IF;
 IF NEW.business_id IS NULL THEN RAISE EXCEPTION 'Choose a business before adding products.' USING ERRCODE='23514'; END IF;
 UPDATE public.business_entitlements SET updated_at=updated_at
  WHERE business_id=NEW.business_id RETURNING product_limit INTO capacity;
 IF NOT FOUND THEN RAISE EXCEPTION 'Business plan is not configured.' USING ERRCODE='23514'; END IF;
 IF capacity IS NULL THEN RETURN NEW; END IF;
 SELECT count(*) INTO used FROM public.products WHERE business_id=NEW.business_id;
 -- AFTER trigger counts the new row and the complete batch; rollback is atomic.
 IF used > capacity THEN RAISE EXCEPTION 'Business product limit reached.' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_product_capacity_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER product_capacity_guard AFTER INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.enforce_product_capacity_v1();
COMMIT;
