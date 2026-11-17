-- LOCAL TEST ONLY. Run in the disposable schema-restored database after synthetic seed.
SET row_security = on;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.business_memberships) <> 2 THEN RAISE EXCEPTION 'owner backfill'; END IF;
 IF (SELECT count(*) FROM public.business_entitlements) <> 0 THEN RAISE EXCEPTION 'unexpected paid limits'; END IF;
END $$;
INSERT INTO public.business_entitlements VALUES
 ('11111111-0000-4000-8000-000000000001','starter-proposal',1,250,now()),
 ('22222222-0000-4000-8000-000000000002','team-proposal',2,500,now());
INSERT INTO public.business_memberships(business_id,user_id,role) VALUES
 ('22222222-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','staff');
SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
DO $$ BEGIN
 IF (SELECT count(*) FROM public.business_memberships) <> 2 THEN RAISE EXCEPTION 'multi-business read'; END IF;
 IF (SELECT count(*) FROM public.business_entitlements) <> 2 THEN RAISE EXCEPTION 'entitlement membership read'; END IF;
 BEGIN
  UPDATE public.business_memberships SET role='owner';
  RAISE EXCEPTION 'self promotion accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE public.business_entitlements SET product_limit=NULL;
  RAISE EXCEPTION 'plan tampering accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.business_memberships(business_id,user_id,role)
  VALUES ('11111111-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','admin');
  RAISE EXCEPTION 'client invite accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.business_memberships SET status='revoked'
 WHERE business_id='22222222-0000-4000-8000-000000000002' AND user_id='11111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.business_memberships) <> 1 THEN RAISE EXCEPTION 'revoked membership visible'; END IF;
 IF (SELECT count(*) FROM public.business_entitlements) <> 1 THEN RAISE EXCEPTION 'revoked entitlement visible'; END IF;
END $$;
SET request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.business_memberships) OR EXISTS(SELECT 1 FROM public.business_entitlements)
 THEN RAISE EXCEPTION 'outsider access'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_table_privilege('anon','public.business_memberships','SELECT') THEN RAISE EXCEPTION 'anon grant'; END IF;
 BEGIN
  UPDATE public.business_entitlements SET member_limit=0;
  RAISE EXCEPTION 'zero member limit accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE public.business_entitlements SET product_limit=-1;
  RAISE EXCEPTION 'negative product limit accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF (SELECT count(*) FROM public.products) <> 3 THEN RAISE EXCEPTION 'products changed'; END IF;
 IF (SELECT sum(current_stock) FROM public.products) <> 24 THEN RAISE EXCEPTION 'counts changed'; END IF;
END $$;
SELECT 'PASS membership foundation: owner backfill, multi-business reads, isolation, revocation, API write denial, limits and unchanged products' AS result;