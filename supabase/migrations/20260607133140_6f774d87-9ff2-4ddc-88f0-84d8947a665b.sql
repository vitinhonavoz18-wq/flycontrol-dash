-- 1. Criar índice único parcial para garantir apenas uma sessão 'open' por restaurante + mesa
-- Primeiro removemos se já existir para evitar erros em re-runs
DROP INDEX IF EXISTS idx_unique_open_table_session;
CREATE UNIQUE INDEX idx_unique_open_table_session 
ON public.table_sessions (restaurant_id, table_number) 
WHERE status = 'open';

-- 2. Rotina de correção de duplicatas existentes
DO $$
DECLARE
    dup RECORD;
    main_session_id UUID;
BEGIN
    -- Identificar grupos de sessões abertas duplicadas (mesmo restaurante e mesa)
    FOR dup IN 
        SELECT restaurant_id, table_number, count(*)
        FROM public.table_sessions
        WHERE status = 'open'
        GROUP BY restaurant_id, table_number
        HAVING count(*) > 1
    LOOP
        -- Eleger a sessão mais antiga como a "principal"
        SELECT id INTO main_session_id
        FROM public.table_sessions
        WHERE restaurant_id = dup.restaurant_id 
        AND table_number = dup.table_number 
        AND status = 'open'
        ORDER BY opened_at ASC
        LIMIT 1;

        -- Mover pedidos das sessões duplicadas para a sessão principal
        UPDATE public.table_session_orders
        SET table_session_id = main_session_id
        WHERE table_session_id IN (
            SELECT id 
            FROM public.table_sessions 
            WHERE restaurant_id = dup.restaurant_id 
            AND table_number = dup.table_number 
            AND status = 'open'
            AND id != main_session_id
        );

        -- Fechar as sessões duplicadas que sobraram (marcar como 'closed' ou 'canceled')
        UPDATE public.table_sessions
        SET status = 'closed', 
            closed_at = now(),
            notes = COALESCE(notes, '') || ' [Auto-fechada por duplicidade]'
        WHERE restaurant_id = dup.restaurant_id 
        AND table_number = dup.table_number 
        AND status = 'open'
        AND id != main_session_id;

        -- Recalcular a sessão principal para garantir que os totais estão corretos após a migração de pedidos
        UPDATE public.table_sessions ts
        SET 
            subtotal_amount = (
                SELECT COALESCE(SUM(o.total), 0)
                FROM public.table_session_orders tso
                JOIN public.orders o ON o.id = tso.order_id
                WHERE tso.table_session_id = ts.id
            ),
            updated_at = now()
        WHERE id = main_session_id;

        -- Recalcular total com taxa se habilitada
        UPDATE public.table_sessions
        SET 
            service_fee_amount = CASE WHEN service_fee_enabled THEN subtotal_amount * (service_fee_percent / 100.0) ELSE 0 END,
            total_amount = subtotal_amount + (CASE WHEN service_fee_enabled THEN subtotal_amount * (service_fee_percent / 100.0) ELSE 0 END)
        WHERE id = main_session_id;
        
        RAISE NOTICE 'Corrigida duplicidade para restaurante % mesa % -> Mantida sessão %', dup.restaurant_id, dup.table_number, main_session_id;
    END LOOP;
END $$;
