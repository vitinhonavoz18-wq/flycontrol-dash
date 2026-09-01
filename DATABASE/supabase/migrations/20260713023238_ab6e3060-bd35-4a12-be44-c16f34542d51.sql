ALTER TABLE public.pizzerias
  ADD COLUMN IF NOT EXISTS sf_restaurant_id text,
  ADD COLUMN IF NOT EXISTS menu_sync_token text,
  ADD COLUMN IF NOT EXISTS public_url text,
  ADD COLUMN IF NOT EXISTS provision_error text,
  ADD COLUMN IF NOT EXISTS provisioned_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS pizzerias_sf_restaurant_id_key
  ON public.pizzerias (sf_restaurant_id)
  WHERE sf_restaurant_id IS NOT NULL;