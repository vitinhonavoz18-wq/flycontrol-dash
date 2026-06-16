
CREATE OR REPLACE FUNCTION public.sync_order_to_table_session_logic(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_order RECORD;
    v_order_type TEXT;
    v_table_number TEXT;
    v_session_id UUID;
    v_normalized_table TEXT;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

    v_order_type := COALESCE(v_order.order_type, v_order.service_mode, 'delivery');

    IF v_order_type != 'table' AND v_order_type != 'mesa' THEN
        RETURN;
    END IF;

    v_table_number := v_order.table_number;
    IF v_table_number IS NULL OR v_table_number = '' THEN
        RETURN;
    END IF;

    v_normalized_table := TRIM(LOWER(v_table_number));
    v_normalized_table := REPLACE(v_normalized_table, 'mesa', '');
    v_normalized_table := TRIM(v_normalized_table);
    IF v_normalized_table ~ '^\d$' THEN
        v_normalized_table := LPAD(v_normalized_table, 2, '0');
    END IF;

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

    IF v_session_id IS NULL THEN
        INSERT INTO public.table_sessions (
            restaurant_id, table_number, status, opened_at,
            service_fee_enabled, service_fee_percent
        ) VALUES (
            v_order.tenant_id, v_table_number, 'open', now(), false, 15
        ) RETURNING id INTO v_session_id;
    END IF;

    -- Link order; unique constraint is on order_id alone
    INSERT INTO public.table_session_orders (table_session_id, order_id)
    VALUES (v_session_id, v_order.id)
    ON CONFLICT (order_id) DO NOTHING;

    PERFORM public.recalculate_table_session_totals(v_session_id);
END;
$function$;
