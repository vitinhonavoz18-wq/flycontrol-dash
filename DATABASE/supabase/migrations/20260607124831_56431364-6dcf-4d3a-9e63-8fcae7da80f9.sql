-- Migration to ensure table_sessions and table_session_orders have all required columns for "Comandas Abertas"

-- table_sessions updates
ALTER TABLE public.table_sessions ADD COLUMN IF NOT EXISTS service_fee_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.table_sessions ADD COLUMN IF NOT EXISTS service_fee_percent NUMERIC DEFAULT 15;
ALTER TABLE public.table_sessions ADD COLUMN IF NOT EXISTS service_fee_amount NUMERIC DEFAULT 0;
ALTER TABLE public.table_sessions ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC DEFAULT 0;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.table_sessions TO authenticated;
GRANT ALL ON public.table_sessions TO service_role;

-- table_session_orders unique constraint
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'table_session_orders_unique_order') THEN
        ALTER TABLE public.table_session_orders ADD CONSTRAINT table_session_orders_unique_order UNIQUE (order_id);
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.table_session_orders TO authenticated;
GRANT ALL ON public.table_session_orders TO service_role;

-- Backfill routine: Link existing table orders to sessions
DO $$
DECLARE
    order_rec RECORD;
    v_session_id UUID;
BEGIN
    FOR order_rec IN 
        SELECT id, tenant_id, table_id, table_number, total, created_at 
        FROM public.orders 
        WHERE (order_type = 'table' OR service_mode = 'mesa')
        AND id NOT IN (SELECT order_id FROM public.table_session_orders)
    LOOP
        -- Find or create open session
        SELECT id INTO v_session_id 
        FROM public.table_sessions 
        WHERE restaurant_id = order_rec.tenant_id 
        AND table_number = order_rec.table_number 
        AND status = 'open'
        LIMIT 1;

        IF v_session_id IS NULL THEN
            INSERT INTO public.table_sessions (
                restaurant_id, 
                table_id, 
                table_number, 
                status, 
                total_amount, 
                subtotal_amount,
                opened_at,
                created_at,
                updated_at
            ) VALUES (
                order_rec.tenant_id,
                order_rec.table_id,
                order_rec.table_number,
                'open',
                order_rec.total,
                order_rec.total,
                order_rec.created_at,
                now(),
                now()
            ) RETURNING id INTO v_session_id;
        ELSE
            -- Link order
            INSERT INTO public.table_session_orders (table_session_id, order_id)
            VALUES (v_session_id, order_rec.id)
            ON CONFLICT (order_id) DO NOTHING;

            -- Update session totals (subtotal only, as service fee logic might be manual)
            UPDATE public.table_sessions 
            SET subtotal_amount = subtotal_amount + order_rec.total,
                total_amount = total_amount + order_rec.total,
                updated_at = now()
            WHERE id = v_session_id;
        END IF;
        
        -- Link order if session was just created and we didn't insert into table_session_orders yet
        IF v_session_id IS NOT NULL THEN
             INSERT INTO public.table_session_orders (table_session_id, order_id)
             VALUES (v_session_id, order_rec.id)
             ON CONFLICT (order_id) DO NOTHING;
        END IF;
    END LOOP;
END $$;