\set ON_ERROR_STOP on
BEGIN;
SET LOCAL row_security = on;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
SELECT public.save_stocktake_v1('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '[{"productId":"00000000-0000-4000-8000-000000000001","expectedQuantity":99,"actualQuantity":7}]');
SELECT pg_sleep(1);
COMMIT;
