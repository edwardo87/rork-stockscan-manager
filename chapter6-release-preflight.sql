-- READ ONLY release readiness inspection. Run only against the intended database.
-- This file does not apply migrations, change rows, or prove hosted auth/device acceptance.
BEGIN READ ONLY;
SELECT current_database() AS database_name, current_user AS database_role;
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND (
 (table_name = 'products' AND column_name IN ('desired_stock_enabled','desired_stock_quantity')) OR
 (table_name = 'stocktakes' AND column_name = 'submission_payload'))
ORDER BY table_name, column_name;
SELECT p.oid::regprocedure AS function_signature, p.prosecdef AS security_definer,
       p.proconfig AS function_settings,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anonymous_can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'save_stocktake_v1';
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('products','stocktakes','stocktake_items');
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public'
AND tablename IN ('products','stocktakes','stocktake_items') ORDER BY tablename, policyname;
ROLLBACK;