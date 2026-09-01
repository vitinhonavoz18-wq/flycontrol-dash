ALTER TABLE public.pizzerias 
ADD COLUMN IF NOT EXISTS instagram_url TEXT,
ADD COLUMN IF NOT EXISTS neighborhood TEXT,
ADD COLUMN IF NOT EXISTS average_delivery_time TEXT,
ADD COLUMN IF NOT EXISTS payment_methods JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS short_message TEXT;

-- Update RLS policies to ensure owners can update their own data
-- (Assuming RLS is already enabled and policies exist, we just ensure these columns are accessible)
-- Usually GRANT ALL ON public.pizzerias TO authenticated; is already done if they can see it.
