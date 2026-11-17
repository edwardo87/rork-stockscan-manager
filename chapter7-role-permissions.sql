-- PREPARED ONLY: configurable permissions, no staff defaults and no existing RLS changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE public.business_role_permissions (
 business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
 role text NOT NULL CHECK(role IN ('admin','manager','staff')),
 capability text NOT NULL CHECK(capability IN ('catalogue.read','catalogue.edit','costs.read','stocktake.save','orders.create','orders.share','members.manage','business.edit')),
 allowed boolean NOT NULL,
 PRIMARY KEY(business_id,role,capability)
);
ALTER TABLE public.business_role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY permission_member_read ON public.business_role_permissions FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.business_memberships m WHERE m.business_id=business_role_permissions.business_id AND m.user_id=(SELECT auth.uid()) AND m.status='active' AND (m.role='owner' OR m.role=business_role_permissions.role)));
REVOKE ALL ON public.business_role_permissions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.business_role_permissions TO authenticated;
CREATE FUNCTION public.business_can_v1(p_business_id uuid,p_capability text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE member_role text;
BEGIN
 IF p_capability IS NULL OR p_capability NOT IN ('catalogue.read','catalogue.edit','costs.read','stocktake.save','orders.create','orders.share','members.manage','business.edit') THEN RETURN false; END IF;
 SELECT role INTO member_role FROM public.business_memberships WHERE business_id=p_business_id AND user_id=auth.uid() AND status='active';
 IF member_role IS NULL THEN RETURN false; END IF;
 IF member_role='owner' THEN RETURN true; END IF;
 RETURN coalesce((SELECT allowed FROM public.business_role_permissions WHERE business_id=p_business_id AND role=member_role AND capability=p_capability),false);
END $$;
CREATE FUNCTION public.set_business_role_permission_v1(p_business_id uuid,p_role text,p_capability text,p_allowed boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' AS $$
BEGIN
 -- Lock the authorizing membership until commit so revocation cannot race a change.
 PERFORM 1 FROM public.business_memberships WHERE business_id=p_business_id AND user_id=auth.uid() AND status='active' AND role='owner' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only an active business owner can configure role permissions.' USING ERRCODE='42501'; END IF;
 -- Table constraints whitelist roles/capabilities and reject null inputs.
 INSERT INTO public.business_role_permissions(business_id,role,capability,allowed)
 VALUES(p_business_id,p_role,p_capability,p_allowed)
 ON CONFLICT(business_id,role,capability) DO UPDATE SET allowed=EXCLUDED.allowed;
END $$;
REVOKE ALL ON FUNCTION public.business_can_v1(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.set_business_role_permission_v1(uuid,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_can_v1(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_business_role_permission_v1(uuid,text,text,boolean) TO authenticated;
COMMIT;
