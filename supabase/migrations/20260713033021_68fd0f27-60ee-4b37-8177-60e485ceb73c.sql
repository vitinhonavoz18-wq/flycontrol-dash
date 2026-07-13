ALTER TABLE public.pizzerias
  ADD COLUMN IF NOT EXISTS provision_status text
  CHECK (provision_status IN ('provision_pending','provisioned','failed'));

UPDATE public.pizzerias
   SET provision_status = CASE
     WHEN sf_restaurant_id IS NOT NULL OR provisioned_at IS NOT NULL THEN 'provisioned'
     WHEN provision_error IS NOT NULL THEN 'failed'
     ELSE NULL
   END
 WHERE provision_status IS NULL;