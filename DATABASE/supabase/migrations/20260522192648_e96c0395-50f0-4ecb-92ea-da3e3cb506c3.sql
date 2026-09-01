-- Add is_active column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pizzerias' AND column_name = 'is_active') THEN
        ALTER TABLE public.pizzerias ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Update existing pizzerias to be active
UPDATE public.pizzerias SET is_active = true WHERE is_active IS NULL;

-- Note: RLS logic will be handled via user e-mail check in the code for now as requested, 
-- but adding a column is the first step.
