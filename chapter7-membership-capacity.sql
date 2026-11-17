-- PREPARED ONLY. Apply only after membership foundation AND explicit plan provisioning.
-- No default plan/pricing. Missing entitlement blocks new active seats.
-- Does not grant invitation/role-management permissions or expose an RPC.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE FUNCTION public.enforce_membership_capacity_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public SET lock_timeout = '5s' AS $$
DECLARE capacity integer; used bigint;
BEGIN
  -- Revocation/deletion and same-business edits must remain possible over quota.
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'active' AND OLD.business_id = NEW.business_id THEN RETURN NEW; END IF;
  END IF;
  -- Every supported plan admits its first owner. No plan is selected implicitly.
  IF TG_OP='INSERT' AND NEW.role='owner'
    AND EXISTS(SELECT 1 FROM public.businesses b WHERE b.id=NEW.business_id AND b.created_by=NEW.user_id)
    AND NOT EXISTS(SELECT 1 FROM public.business_memberships m WHERE m.business_id=NEW.business_id)
  THEN RETURN NEW; END IF;
  -- An actual row update serializes seat additions and causes a serialization
  -- failure at repeatable-read rather than admitting a stale-snapshot extra seat.
  UPDATE public.business_entitlements SET updated_at = updated_at
    WHERE business_id = NEW.business_id RETURNING member_limit INTO capacity;
  IF NOT FOUND THEN RAISE EXCEPTION 'Business plan is not configured.' USING ERRCODE='23514'; END IF;
  IF capacity IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO used FROM public.business_memberships
    WHERE business_id = NEW.business_id AND status = 'active';
  IF used >= capacity THEN RAISE EXCEPTION 'Business member limit reached.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_membership_capacity_v1() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER membership_capacity_guard BEFORE INSERT OR UPDATE
ON public.business_memberships FOR EACH ROW EXECUTE FUNCTION public.enforce_membership_capacity_v1();
COMMIT;
