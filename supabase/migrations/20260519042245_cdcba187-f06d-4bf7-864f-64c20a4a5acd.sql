ALTER TABLE public.pizzerias 
ADD COLUMN sync_endpoint TEXT;

COMMENT ON COLUMN public.pizzerias.sync_endpoint IS 'URL base da Edge Function de sincronização do SiteCreatorFly';