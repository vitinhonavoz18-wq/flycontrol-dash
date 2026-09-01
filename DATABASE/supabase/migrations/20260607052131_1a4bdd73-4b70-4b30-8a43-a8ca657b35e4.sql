CREATE OR REPLACE FUNCTION public.generate_restaurant_table_qr_url()
RETURNS TRIGGER AS $$
DECLARE
    v_slug TEXT;
BEGIN
    -- Busca o slug do restaurante
    SELECT slug INTO v_slug FROM public.pizzerias WHERE id = NEW.restaurant_id;
    
    -- Se encontrou o slug, gera a URL no novo formato
    IF v_slug IS NOT NULL THEN
        NEW.qr_code_url := 'https://conectfly.com.br/' || v_slug || '?mode=table&table_number=' || NEW.table_number || '&table_token=' || NEW.public_token;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Garante que o trigger existe e usa a função atualizada
-- Nota: O trigger handle_restaurant_table_qr_url já deve existir na tabela restaurant_tables
-- Caso não exista ou precise ser recriado:
DROP TRIGGER IF EXISTS tr_generate_table_qr_url ON public.restaurant_tables;
CREATE TRIGGER tr_generate_table_qr_url
BEFORE INSERT OR UPDATE OF table_number, public_token ON public.restaurant_tables
FOR EACH ROW EXECUTE FUNCTION public.generate_restaurant_table_qr_url();

-- Atualiza as URLs existentes para o novo formato
UPDATE public.restaurant_tables rt
SET qr_code_url = 'https://conectfly.com.br/' || p.slug || '?mode=table&table_number=' || rt.table_number || '&table_token=' || rt.public_token
FROM public.pizzerias p
WHERE rt.restaurant_id = p.id;