-- Add qr_code_url if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurant_tables' AND column_name = 'qr_code_url') THEN
    ALTER TABLE public.restaurant_tables ADD COLUMN qr_code_url TEXT;
  END IF;
END $$;

-- Ensure public_token is unique
ALTER TABLE public.restaurant_tables DROP CONSTRAINT IF EXISTS restaurant_tables_public_token_key;
ALTER TABLE public.restaurant_tables ADD CONSTRAINT restaurant_tables_public_token_key UNIQUE (public_token);

-- Function to generate default tables for a restaurant
CREATE OR REPLACE FUNCTION public.generate_default_restaurant_tables(p_restaurant_id UUID)
RETURNS VOID AS $$
DECLARE
    v_slug TEXT;
    v_token TEXT;
    i INT;
BEGIN
    SELECT slug INTO v_slug FROM public.pizzerias WHERE id = p_restaurant_id;
    
    FOR i IN 1..12 LOOP
        v_token := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
        INSERT INTO public.restaurant_tables (
            restaurant_id,
            tenant_id,
            table_number,
            table_name,
            public_token,
            qr_code_url,
            is_active
        ) VALUES (
            p_restaurant_id,
            p_restaurant_id,
            LPAD(i::text, 2, '0'),
            'Mesa ' || LPAD(i::text, 2, '0'),
            v_token,
            'https://conectfly.com.br/' || COALESCE(v_slug, 'restaurante') || '?mode=table&table_token=' || v_token,
            true
        ) ON CONFLICT DO NOTHING;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill existing pizzerias
DO $$
DECLARE
    p_rec RECORD;
BEGIN
    FOR p_rec IN SELECT id FROM public.pizzerias LOOP
        IF NOT EXISTS (SELECT 1 FROM public.restaurant_tables WHERE restaurant_id = p_rec.id) THEN
            PERFORM public.generate_default_restaurant_tables(p_rec.id);
        END IF;
    END LOOP;
END $$;

-- Trigger function to ensure qr_code_url and public_token are set
CREATE OR REPLACE FUNCTION public.handle_restaurant_table_defaults()
RETURNS TRIGGER AS $$
DECLARE
    v_slug TEXT;
BEGIN
    -- Ensure public_token
    IF NEW.public_token IS NULL OR NEW.public_token = '' THEN
        NEW.public_token := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    END IF;

    -- Update qr_code_url if slug is available
    SELECT slug INTO v_slug FROM public.pizzerias WHERE id = NEW.restaurant_id;
    IF v_slug IS NOT NULL THEN
        NEW.qr_code_url := 'https://conectfly.com.br/' || v_slug || '?mode=table&table_token=' || NEW.public_token;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS tr_restaurant_table_defaults ON public.restaurant_tables;
CREATE TRIGGER tr_restaurant_table_defaults
BEFORE INSERT OR UPDATE OF public_token, restaurant_id ON public.restaurant_tables
FOR EACH ROW EXECUTE FUNCTION public.handle_restaurant_table_defaults();
