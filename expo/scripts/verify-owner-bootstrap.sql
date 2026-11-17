-- LOCAL SYNTHETIC ONLY.
SET request.jwt.claim.role='service_role';
INSERT INTO auth.users VALUES ('77777777-7777-4777-8777-777777777777');
INSERT INTO public.businesses(id,name,created_by) VALUES
 ('77777777-0000-4000-8000-000000000007','New synthetic business','77777777-7777-4777-8777-777777777777');
DO $$ BEGIN
 IF (SELECT count(*) FROM public.business_memberships WHERE business_id='77777777-0000-4000-8000-000000000007' AND user_id='77777777-7777-4777-8777-777777777777' AND role='owner' AND status='active') <> 1 THEN RAISE EXCEPTION 'owner not provisioned'; END IF;
 IF EXISTS(SELECT 1 FROM public.business_entitlements WHERE business_id='77777777-0000-4000-8000-000000000007') THEN RAISE EXCEPTION 'plan invented'; END IF;
 BEGIN
  INSERT INTO public.business_memberships(business_id,user_id,role) VALUES
  ('77777777-0000-4000-8000-000000000007','11111111-1111-4111-8111-111111111111','owner');
  RAISE EXCEPTION 'extra owner bypassed unconfigured plan';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SET ROLE authenticated;
SET request.jwt.claim.sub='77777777-7777-4777-8777-777777777777';
DO $$ BEGIN
 IF NOT public.business_can_v1('77777777-0000-4000-8000-000000000007','business.edit') THEN RAISE EXCEPTION 'new owner cannot resolve access'; END IF;
 IF (SELECT count(*) FROM public.business_memberships) <> 1 THEN RAISE EXCEPTION 'new owner sees other businesses'; END IF;
END $$;
RESET ROLE;
-- Missing creators are preserved for explicit recovery, never assigned to caller.
INSERT INTO public.businesses(id,name,created_by) VALUES ('88888888-0000-4000-8000-000000000008','Unclaimed synthetic',NULL);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.business_memberships WHERE business_id='88888888-0000-4000-8000-000000000008') THEN RAISE EXCEPTION 'fabricated owner'; END IF;
 IF has_function_privilege('authenticated','public.provision_business_owner_v1()','EXECUTE') THEN RAISE EXCEPTION 'bootstrap exposed'; END IF;
END $$;
SELECT 'PASS owner bootstrap: creator membership, no invented plan, extra-owner denial, tenant isolation and unclaimed business preservation';
