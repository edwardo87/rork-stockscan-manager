-- Disposable LOCAL database fixture only. Never execute against production.
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.products(id uuid PRIMARY KEY, user_id uuid NOT NULL, name text, barcode text, current_stock numeric);
CREATE TABLE public.stocktakes(id uuid PRIMARY KEY, user_id uuid NOT NULL, date timestamptz, status text);
CREATE TABLE public.stocktake_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), stocktake_id uuid REFERENCES public.stocktakes, product_id uuid REFERENCES public.products, name text, barcode text, expected_quantity numeric, actual_quantity numeric, discrepancy numeric);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocktakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocktake_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_products ON public.products TO authenticated USING(user_id = auth.uid()) WITH CHECK(user_id = auth.uid());
CREATE POLICY own_stocktakes ON public.stocktakes TO authenticated USING(user_id = auth.uid()) WITH CHECK(user_id = auth.uid());
CREATE POLICY own_lines ON public.stocktake_items TO authenticated USING(EXISTS(SELECT 1 FROM public.stocktakes s WHERE s.id=stocktake_id AND s.user_id=auth.uid())) WITH CHECK(EXISTS(SELECT 1 FROM public.stocktakes s WHERE s.id=stocktake_id AND s.user_id=auth.uid()));
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
INSERT INTO public.products VALUES
('00000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','First','001',10),
('00000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Second','002',5),
('00000000-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222','Other owner','003',9);
CREATE FUNCTION public.fail_test_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.current_stock = 13 THEN RAISE EXCEPTION 'Injected update failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER test_failure BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.fail_test_update();
