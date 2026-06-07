-- Add missing columns to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES public.restaurant_tables(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS table_name TEXT;

-- Add missing column to table_sessions table
ALTER TABLE public.table_sessions ADD COLUMN IF NOT EXISTS table_name TEXT;

-- Grant permissions (though they should already be there for the table, being explicit is safer for new columns in some cases)
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.table_sessions TO authenticated;
GRANT ALL ON public.table_sessions TO service_role;

-- Update schema cache hint (not a real command, but useful for the agent to know)
-- Supabase types will be regenerated after this.
