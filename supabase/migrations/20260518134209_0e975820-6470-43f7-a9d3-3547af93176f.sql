ALTER TABLE public.pizzerias ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 0;
ALTER TABLE public.pizzerias ADD COLUMN IF NOT EXISTS opening_hours JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.pizzerias ADD COLUMN IF NOT EXISTS description TEXT;
