-- PREPARED ONLY: additive Chapter7 foundation, NOT production deployment.
-- Does not change existing business data policies, role guards or app behavior.
-- Plan values are deliberately not seeded: SME tier sizes/prices remain provisional.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE public.business_memberships (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner','admin','manager','staff')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id,user_id)
);
CREATE INDEX business_memberships_user_idx ON public.business_memberships(user_id,business_id) WHERE status='active';
ALTER TABLE public.business_memberships ENABLE ROW LEVEL SECURITY;
-- A user can discover only their own active memberships. No recursive policies.
CREATE POLICY membership_self_read ON public.business_memberships FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND status = 'active');
REVOKE ALL ON public.business_memberships FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.business_memberships TO authenticated;
-- Authoritative creator only. Never infer owner from an arbitrary users.role value.
INSERT INTO public.business_memberships(business_id,user_id,role)
SELECT b.id,b.created_by,'owner' FROM public.businesses b WHERE b.created_by IS NOT NULL;

CREATE TABLE public.business_entitlements (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE RESTRICT,
  plan_code text NOT NULL CHECK (length(btrim(plan_code)) BETWEEN 1 AND 64),
  member_limit integer CHECK (member_limit IS NULL OR member_limit >= 1),
  product_limit integer CHECK (product_limit IS NULL OR product_limit >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.business_entitlements IS
'No row means unconfigured, never unlimited. Null limit explicitly means unlimited. No pricing or billing integration.';
ALTER TABLE public.business_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY entitlement_member_read ON public.business_entitlements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.business_memberships m
    WHERE m.business_id = business_entitlements.business_id AND m.user_id = (SELECT auth.uid()) AND m.status='active'));
REVOKE ALL ON public.business_entitlements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.business_entitlements TO authenticated;
-- No API writes, invitation acceptance, billing mutation or broad data grants here.
-- Those require separately tested server functions and permission policy decisions.
COMMIT;