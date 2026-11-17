-- LOCAL SYNTHETIC TEST ONLY.
SET request.jwt.claim.role='service_role';
UPDATE public.business_entitlements SET member_limit=NULL WHERE business_id='11111111-0000-4000-8000-000000000001';
INSERT INTO public.business_memberships(business_id,user_id,role) VALUES
 ('11111111-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','staff');
SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
DO $$ BEGIN
 IF NOT public.business_can_v1('11111111-0000-4000-8000-000000000001','orders.share') THEN RAISE EXCEPTION 'owner lost access'; END IF;
 IF public.business_can_v1('11111111-0000-4000-8000-000000000001','invented') THEN RAISE EXCEPTION 'unknown capability allowed'; END IF;
 PERFORM public.set_business_role_permission_v1('11111111-0000-4000-8000-000000000001','staff','catalogue.read',true);
 BEGIN
  PERFORM public.set_business_role_permission_v1('22222222-0000-4000-8000-000000000002','staff','orders.share',true);
  RAISE EXCEPTION 'cross-business permission mutation';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.set_business_role_permission_v1('11111111-0000-4000-8000-000000000001','owner','orders.share',false);
  RAISE EXCEPTION 'owner permissions rewritten';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SET request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
DO $$ BEGIN
 IF NOT public.business_can_v1('11111111-0000-4000-8000-000000000001','catalogue.read') THEN RAISE EXCEPTION 'explicit permission ignored'; END IF;
 IF public.business_can_v1('11111111-0000-4000-8000-000000000001','orders.share') OR public.business_can_v1('11111111-0000-4000-8000-000000000001','costs.read') THEN RAISE EXCEPTION 'unspecified permission allowed'; END IF;
 BEGIN
  PERFORM public.set_business_role_permission_v1('11111111-0000-4000-8000-000000000001','staff','orders.share',true);
  RAISE EXCEPTION 'staff escalated permissions';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE public.business_role_permissions SET allowed=true;
  RAISE EXCEPTION 'direct permission writes accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
SELECT public.set_business_role_permission_v1('11111111-0000-4000-8000-000000000001','staff','catalogue.read',false);
SET request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
DO $$ BEGIN
 IF public.business_can_v1('11111111-0000-4000-8000-000000000001','catalogue.read') THEN RAISE EXCEPTION 'permission removal ignored'; END IF;
END $$;
RESET ROLE;
UPDATE public.business_memberships SET status='revoked' WHERE business_id='11111111-0000-4000-8000-000000000001' AND user_id='22222222-2222-4222-8222-222222222222';
SET ROLE authenticated;
DO $$ BEGIN
 IF public.business_can_v1('11111111-0000-4000-8000-000000000001','catalogue.read') OR EXISTS(SELECT 1 FROM public.business_role_permissions WHERE business_id='11111111-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'revoked member permission visibility'; END IF;
END $$;
SET request.jwt.claim.sub='66666666-6666-4666-8666-666666666666';
DO $$ BEGIN
 IF public.business_can_v1('11111111-0000-4000-8000-000000000001','catalogue.read') THEN RAISE EXCEPTION 'outsider access'; END IF;
END $$;
RESET ROLE;
SELECT 'PASS configurable permissions: owner access/configuration, explicit grants, default denial, role escalation blocked, cross-business isolation, revocation';
