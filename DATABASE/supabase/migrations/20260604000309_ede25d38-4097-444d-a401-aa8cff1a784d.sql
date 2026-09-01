ALTER TABLE public.pizzerias ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT true;

-- Update existing records to true if they are currently null
UPDATE public.pizzerias SET is_open = true WHERE is_open IS NULL;
