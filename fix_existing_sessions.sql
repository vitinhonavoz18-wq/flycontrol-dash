
-- 1. Buscar pedidos de mesa que ainda não estão vinculados a sessões abertas
DO $$
DECLARE
    order_rec RECORD;
    session_id UUID;
BEGIN
    FOR order_rec IN 
        SELECT o.id, o.tenant_id, o.table_number, o.total, o.table_id
        FROM public.orders o
        LEFT JOIN public.table_session_orders tso ON o.id = tso.order_id
        WHERE (o.order_type = 'table' OR o.service_mode = 'mesa')
        AND tso.order_id IS NULL
        AND o.table_number IS NOT NULL
        AND o.status != 'cancelado'
    LOOP
        -- Tentar encontrar uma sessão aberta para essa mesa
        SELECT id INTO session_id 
        FROM public.table_sessions 
        WHERE restaurant_id = order_rec.tenant_id 
        AND table_number = order_rec.table_number 
        AND status = 'open'
        LIMIT 1;

        IF session_id IS NOT NULL THEN
            -- Vincular
            INSERT INTO public.table_session_orders (table_session_id, order_id)
            VALUES (session_id, order_rec.id);
            
            -- Recalcular a sessão
            UPDATE public.table_sessions
            SET 
                subtotal_amount = (
                    SELECT COALESCE(SUM(o.total), 0)
                    FROM public.table_session_orders tso
                    JOIN public.orders o ON o.id = tso.order_id
                    WHERE tso.table_session_id = session_id
                ),
                updated_at = now()
            WHERE id = session_id;
            
            -- Recalcular total com taxa se habilitada
            UPDATE public.table_sessions
            SET 
                service_fee_amount = CASE WHEN service_fee_enabled THEN subtotal_amount * (service_fee_percent / 100.0) ELSE 0 END,
                total_amount = subtotal_amount + (CASE WHEN service_fee_enabled THEN subtotal_amount * (service_fee_percent / 100.0) ELSE 0 END)
            WHERE id = session_id;
            
            RAISE NOTICE 'Vinculado pedido % à sessão %', order_rec.id, session_id;
        END IF;
    END LOOP;
END $$;
