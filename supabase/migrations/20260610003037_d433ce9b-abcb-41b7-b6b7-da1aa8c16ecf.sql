-- 1. Garantir que as colunas existam em table_sessions
ALTER TABLE public.table_sessions ADD COLUMN IF NOT EXISTS subtotal_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.table_sessions ADD COLUMN IF NOT EXISTS service_fee_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.table_sessions ADD COLUMN IF NOT EXISTS service_fee_percent DECIMAL(5,2) DEFAULT 15;
ALTER TABLE public.table_sessions ADD COLUMN IF NOT EXISTS service_fee_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.table_sessions ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.table_sessions ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP WITH TIME ZONE DEFAULT now();
ALTER TABLE public.table_sessions ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE;

-- 2. Garantir que a tabela de vínculo exista
CREATE TABLE IF NOT EXISTS public.table_session_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_session_id UUID NOT NULL REFERENCES public.table_sessions(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(table_session_id, order_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.table_session_orders TO authenticated;
GRANT ALL ON public.table_session_orders TO service_role;

-- 3. Função para recalcular totais da sessão
CREATE OR REPLACE FUNCTION public.recalculate_table_session_totals(p_session_id UUID)
RETURNS void AS $$
DECLARE
    v_subtotal DECIMAL(10,2);
    v_fee_enabled BOOLEAN;
    v_fee_percent DECIMAL(5,2);
    v_fee_amount DECIMAL(10,2);
BEGIN
    -- Pegar configurações da sessão
    SELECT service_fee_enabled, service_fee_percent 
    INTO v_fee_enabled, v_fee_percent
    FROM public.table_sessions
    WHERE id = p_session_id;

    -- Calcular subtotal (soma de todos os pedidos vinculados)
    SELECT COALESCE(SUM(total), 0)
    INTO v_subtotal
    FROM public.orders o
    JOIN public.table_session_orders tso ON tso.order_id = o.id
    WHERE tso.table_session_id = p_session_id
    AND o.status != 'cancelado' 
    AND o.status != 'deleted';

    -- Calcular taxa e total
    IF v_fee_enabled THEN
        v_fee_amount := v_subtotal * (v_fee_percent / 100);
    ELSE
        v_fee_amount := 0;
    END IF;

    -- Atualizar sessão
    UPDATE public.table_sessions
    SET 
        subtotal_amount = v_subtotal,
        service_fee_amount = v_fee_amount,
        total_amount = v_subtotal + v_fee_amount,
        updated_at = now()
    WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Função principal de lógica de sincronização
CREATE OR REPLACE FUNCTION public.sync_order_to_table_session_logic(p_order_id UUID)
RETURNS void AS $$
DECLARE
    v_order RECORD;
    v_order_type TEXT;
    v_table_number TEXT;
    v_session_id UUID;
    v_normalized_table TEXT;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    
    v_order_type := COALESCE(
        v_order.order_type, 
        v_order.service_mode,
        'delivery'
    );

    IF v_order_type != 'table' AND v_order_type != 'mesa' THEN
        RETURN;
    END IF;

    v_table_number := v_order.table_number;
    
    IF v_table_number IS NULL OR v_table_number = '' THEN
        RETURN;
    END IF;

    -- Normalização básica
    v_normalized_table := TRIM(LOWER(v_table_number));
    v_normalized_table := REPLACE(v_normalized_table, 'mesa', '');
    v_normalized_table := TRIM(v_normalized_table);
    IF v_normalized_table ~ '^\d$' THEN
        v_normalized_table := LPAD(v_normalized_table, 2, '0');
    END IF;

    -- Buscar sessão aberta
    SELECT id INTO v_session_id
    FROM public.table_sessions
    WHERE restaurant_id = v_order.tenant_id
    AND (
        TRIM(LOWER(REPLACE(REPLACE(table_number, 'mesa', ''), ' ', ''))) = v_normalized_table
        OR table_number = v_table_number
    )
    AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;

    -- Se não existir, criar nova sessão
    IF v_session_id IS NULL THEN
        INSERT INTO public.table_sessions (
            restaurant_id,
            table_number,
            status,
            opened_at,
            service_fee_enabled,
            service_fee_percent
        ) VALUES (
            v_order.tenant_id,
            v_table_number,
            'open',
            now(),
            false,
            15
        ) RETURNING id INTO v_session_id;
    END IF;

    -- Vincular pedido
    INSERT INTO public.table_session_orders (table_session_id, order_id)
    VALUES (v_session_id, v_order.id)
    ON CONFLICT (table_session_id, order_id) DO NOTHING;

    -- Recalcular
    PERFORM public.recalculate_table_session_totals(v_session_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger
CREATE OR REPLACE FUNCTION public.on_order_created_sync_table_session_trigger()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.sync_order_to_table_session_logic(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_order_sync_table_session ON public.orders;
CREATE TRIGGER tr_order_sync_table_session
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.on_order_created_sync_table_session_trigger();

-- 6. Backfill
DO $$
DECLARE
    v_order_id UUID;
BEGIN
    FOR v_order_id IN 
        SELECT id
        FROM public.orders 
        WHERE (order_type IN ('table', 'mesa') OR service_mode = 'mesa')
        AND status NOT IN ('cancelado', 'deleted')
        AND id NOT IN (SELECT order_id FROM public.table_session_orders)
    LOOP
        PERFORM public.sync_order_to_table_session_logic(v_order_id);
    END LOOP;
END;
$$;