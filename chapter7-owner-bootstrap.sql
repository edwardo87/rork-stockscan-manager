-- PREPARED ONLY: requires Chapter7 foundation and member-capacity function.
-- Provision only the recorded business creator. No plan or staff permissions seeded.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE FUNCTION public.provision_business_owner_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.created_by IS NOT NULL THEN
  INSERT INTO public.business_memberships(business_id,user_id,role,status) VALUES(NEW.id,NEW.created_by,'owner','active');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.provision_business_owner_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER provision_business_owner AFTER INSERT ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.provision_business_owner_v1();
COMMIT;
