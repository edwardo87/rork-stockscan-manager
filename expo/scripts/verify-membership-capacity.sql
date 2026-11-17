-- LOCAL ONLY. Run after membership foundation test, then capacity migration.
SET request.jwt.claim.role = 'service_role';
INSERT INTO auth.users VALUES
 ('44444444-4444-4444-8444-444444444444'),('55555555-5555-4555-8555-555555555555');
DO $$ BEGIN
 BEGIN
  INSERT INTO public.business_memberships(business_id,user_id,role) VALUES
  ('11111111-0000-4000-8000-000000000001','44444444-4444-4444-8444-444444444444','staff');
  RAISE EXCEPTION '1-seat quota bypass';
 EXCEPTION WHEN check_violation THEN NULL; END;
 -- Existing owner can keep their seat when capacity is full.
 UPDATE public.business_memberships SET role='owner' WHERE business_id='11111111-0000-4000-8000-000000000001';
END $$;
-- Reactivation fills the second seat; adding a third must fail.
UPDATE public.business_memberships SET status='active' WHERE business_id='22222222-0000-4000-8000-000000000002' AND user_id='11111111-1111-4111-8111-111111111111';
DO $$ BEGIN
 BEGIN
  INSERT INTO public.business_memberships(business_id,user_id,role) VALUES
  ('22222222-0000-4000-8000-000000000002','44444444-4444-4444-8444-444444444444','staff');
  RAISE EXCEPTION '2-seat quota bypass';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
-- Downgrade preserves existing members and permits revocation, never deletion.
UPDATE public.business_entitlements SET member_limit=1 WHERE business_id='22222222-0000-4000-8000-000000000002';
UPDATE public.business_memberships SET status='revoked' WHERE business_id='22222222-0000-4000-8000-000000000002' AND user_id='11111111-1111-4111-8111-111111111111';
DO $$ BEGIN
 BEGIN
  UPDATE public.business_memberships SET status='active' WHERE business_id='22222222-0000-4000-8000-000000000002' AND user_id='11111111-1111-4111-8111-111111111111';
  RAISE EXCEPTION 'reactivation quota bypass';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
-- Explicit unlimited works; missing plan never becomes unlimited.
UPDATE public.business_entitlements SET member_limit=NULL WHERE business_id='22222222-0000-4000-8000-000000000002';
INSERT INTO public.business_memberships(business_id,user_id,role) VALUES
 ('22222222-0000-4000-8000-000000000002','44444444-4444-4444-8444-444444444444','staff');
-- A multi-row request must roll back completely if only one seat is free.
INSERT INTO auth.users VALUES ('66666666-6666-4666-8666-666666666666');
UPDATE public.business_entitlements SET member_limit=3 WHERE business_id='22222222-0000-4000-8000-000000000002';
DO $$ BEGIN
 BEGIN
  INSERT INTO public.business_memberships(business_id,user_id,role) VALUES
  ('22222222-0000-4000-8000-000000000002','55555555-5555-4555-8555-555555555555','staff'),
  ('22222222-0000-4000-8000-000000000002','66666666-6666-4666-8666-666666666666','staff');
  RAISE EXCEPTION 'multi-row quota bypass';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF (SELECT count(*) FROM public.business_memberships WHERE business_id='22222222-0000-4000-8000-000000000002' AND status='active') <> 2 THEN RAISE EXCEPTION 'partial batch inserted'; END IF;
END $$;
DELETE FROM public.business_entitlements WHERE business_id='11111111-0000-4000-8000-000000000001';
DO $$ BEGIN
 BEGIN
  INSERT INTO public.business_memberships(business_id,user_id,role) VALUES
  ('11111111-0000-4000-8000-000000000001','55555555-5555-4555-8555-555555555555','staff');
  RAISE EXCEPTION 'missing plan bypass';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF has_function_privilege('authenticated','public.enforce_membership_capacity_v1()','EXECUTE') THEN RAISE EXCEPTION 'RPC grant'; END IF;
 IF (SELECT count(*) FROM public.products) <> 3 THEN RAISE EXCEPTION 'products changed'; END IF;
END $$;
SELECT 'PASS server member caps: full seats, reactivation, downgrade preserves data, revocation, unlimited, missing plan and no RPC grant';
