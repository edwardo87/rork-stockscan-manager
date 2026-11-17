-- READ ONLY: inspect Chapter7 deployment prerequisites; never deploys/enables features.
BEGIN READ ONLY;
SELECT current_database() AS database_name, current_user AS database_role;
WITH expected(name) AS (VALUES ('business_memberships'),('business_entitlements'),('business_role_permissions'))
SELECT e.name, c.oid IS NOT NULL AS present, c.relrowsecurity AS rls_enabled,
 CASE WHEN c.oid IS NOT NULL THEN has_table_privilege('authenticated',c.oid,'SELECT') END AS member_select,
 CASE WHEN c.oid IS NOT NULL THEN has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') END AS unexpected_direct_write,
 CASE WHEN c.oid IS NOT NULL THEN has_table_privilege('anon',c.oid,'SELECT') END AS unexpected_anon_select
FROM expected e LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||e.name);
WITH expected(signature,client_callable) AS (VALUES
 ('public.business_can_v1(uuid,text)',true),
 ('public.set_business_role_permission_v1(uuid,text,text,boolean)',true),
 ('public.enforce_membership_capacity_v1()',false),
 ('public.enforce_product_capacity_v1()',false),
 ('public.provision_business_owner_v1()',false))
SELECT e.signature,e.client_callable,p.oid IS NOT NULL AS present,p.prosecdef AS security_definer,p.proconfig AS function_settings,
 CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('authenticated',p.oid,'EXECUTE') END AS client_execute,
 CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('anon',p.oid,'EXECUTE') END AS unexpected_anon_execute
FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature);
SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN ('business_memberships','business_entitlements','business_role_permissions') ORDER BY tablename,policyname;
SELECT c.relname AS table_name,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
WHERE t.tgname IN ('membership_capacity_guard','product_capacity_guard','provision_business_owner') AND NOT t.tgisinternal;
ROLLBACK;
