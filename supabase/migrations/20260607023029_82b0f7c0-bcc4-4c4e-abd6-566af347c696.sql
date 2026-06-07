CREATE OR REPLACE FUNCTION public.handle_restaurant_table_defaults()
RETURNS TRIGGER AS $$
DECLARE
    v_slug TEXT;
BEGIN
    -- Sync tenant_id and restaurant_id
    IF NEW.restaurant_id IS NOT NULL AND NEW.tenant_id IS NULL THEN
        NEW.tenant_id := NEW.restaurant_id;
    ELSIF NEW.tenant_id IS NOT NULL AND NEW.restaurant_id IS NULL THEN
        NEW.restaurant_id := NEW.tenant_id;
    END IF;

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
