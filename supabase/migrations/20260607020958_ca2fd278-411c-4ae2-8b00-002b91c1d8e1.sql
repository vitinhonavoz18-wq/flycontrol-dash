-- Ensure restaurant_tables has the required structure
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurant_tables' AND column_name = 'restaurant_id') THEN
        ALTER TABLE public.restaurant_tables ADD COLUMN restaurant_id UUID REFERENCES public.pizzerias(id);
        -- Sync existing tenant_id to restaurant_id if any
        UPDATE public.restaurant_tables SET restaurant_id = tenant_id WHERE restaurant_id IS NULL AND tenant_id IS NOT NULL;
    END IF;
END $$;

-- Ensure necessary columns exist
ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS public_token TEXT DEFAULT gen_random_uuid()::text;
ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS table_name TEXT;

-- Create a function to generate default tables
CREATE OR REPLACE FUNCTION public.generate_default_tables()
RETURNS TRIGGER AS $$
DECLARE
    i INTEGER;
BEGIN
    FOR i IN 1..12 LOOP
        INSERT INTO public.restaurant_tables (
            restaurant_id, 
            tenant_id, 
            table_number, 
            table_name, 
            public_token, 
            is_active
        ) VALUES (
            NEW.id, 
            NEW.id, 
            LPAD(i::text, 2, '0'), 
            'Mesa ' || LPAD(i::text, 2, '0'), 
            encode(gen_random_bytes(16), 'hex'), 
            true
        );
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create tables when a new pizzeria (restaurant) is created
DROP TRIGGER IF EXISTS on_pizzeria_created_generate_tables ON public.pizzerias;
CREATE TRIGGER on_pizzeria_created_generate_tables
    AFTER INSERT ON public.pizzerias
    FOR EACH ROW
    EXECUTE FUNCTION public.generate_default_tables();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_tables TO authenticated;
GRANT ALL ON public.restaurant_tables TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.table_sessions TO authenticated;
GRANT ALL ON public.table_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.table_session_orders TO authenticated;
GRANT ALL ON public.table_session_orders TO service_role;

-- Ensure RLS is enabled and policies exist
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own restaurant tables" ON public.restaurant_tables
    FOR ALL USING (
        auth.uid() IN (SELECT owner_id FROM public.pizzerias WHERE id = restaurant_tables.restaurant_id OR id = restaurant_tables.tenant_id)
    ) WITH CHECK (
        auth.uid() IN (SELECT owner_id FROM public.pizzerias WHERE id = restaurant_tables.restaurant_id OR id = restaurant_tables.tenant_id)
    );

-- Backfill existing pizzerias that have 0 tables
DO $$
DECLARE
    piz_record RECORD;
BEGIN
    FOR piz_record IN SELECT id FROM public.pizzerias WHERE id NOT IN (SELECT DISTINCT COALESCE(restaurant_id, tenant_id) FROM public.restaurant_tables) LOOP
        -- Using the function logic manually for existing ones
        FOR i IN 1..12 LOOP
            INSERT INTO public.restaurant_tables (
                restaurant_id, 
                tenant_id, 
                table_number, 
                table_name, 
                public_token, 
                is_active
            ) VALUES (
                piz_record.id, 
                piz_record.id, 
                LPAD(i::text, 2, '0'), 
                'Mesa ' || LPAD(i::text, 2, '0'), 
                encode(gen_random_bytes(16), 'hex'), 
                true
            );
        END LOOP;
    END LOOP;
END $$;
