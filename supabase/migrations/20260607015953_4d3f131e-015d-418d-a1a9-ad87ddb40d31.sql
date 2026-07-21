-- Create restaurant_tables table
CREATE TABLE IF NOT EXISTS public.restaurant_tables (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
    table_number TEXT NOT NULL,
    table_name TEXT,
    public_token TEXT NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(12), 'hex'),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, table_number)
);

-- Ensure table_sessions has the correct structure
-- If it already exists, we might need to add table_id if it's missing
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='table_sessions' AND column_name='table_id') THEN
        ALTER TABLE public.table_sessions ADD COLUMN table_id UUID REFERENCES public.restaurant_tables(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Enable RLS
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_tables TO authenticated;
GRANT ALL ON public.restaurant_tables TO service_role;
GRANT SELECT ON public.restaurant_tables TO anon;

-- Policies for restaurant_tables
CREATE POLICY "Users can manage tables of their pizzerias" ON public.restaurant_tables
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.pizzerias 
            WHERE pizzerias.id = restaurant_tables.tenant_id 
            AND (pizzerias.owner_id = auth.uid() OR auth.jwt()->>'email' = 'vitinhonavoz18@gmail.com')
        )
    );

CREATE POLICY "Anyone can view active tables" ON public.restaurant_tables
    FOR SELECT USING (is_active = true);

-- Update existing table_sessions/table_session_orders RLS and Grants just in case
ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.table_sessions TO authenticated;
GRANT ALL ON public.table_sessions TO service_role;
GRANT SELECT ON public.table_sessions TO anon;

ALTER TABLE public.table_session_orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.table_session_orders TO authenticated;
GRANT ALL ON public.table_session_orders TO service_role;
GRANT SELECT ON public.table_session_orders TO anon;

-- Trigger for updated_at on restaurant_tables
CREATE TRIGGER update_restaurant_tables_updated_at BEFORE UPDATE ON public.restaurant_tables FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
