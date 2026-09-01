-- 1. Adicionar novos campos à tabela orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'delivery',
ADD COLUMN IF NOT EXISTS service_mode TEXT DEFAULT 'delivery',
ADD COLUMN IF NOT EXISTS table_number TEXT,
ADD COLUMN IF NOT EXISTS ticket_number TEXT,
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';

-- 2. Criar tabela table_sessions para controle futuro de mesas/comandas
CREATE TABLE IF NOT EXISTS public.table_sessions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
    table_number TEXT NOT NULL,
    customer_name TEXT,
    status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'closed'
    total_amount DECIMAL(10,2) DEFAULT 0,
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    closed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Criar tabela para vincular pedidos à sessão da mesa
CREATE TABLE IF NOT EXISTS public.table_session_orders (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    table_session_id UUID NOT NULL REFERENCES public.table_sessions(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Permissões
GRANT ALL ON public.table_sessions TO authenticated;
GRANT ALL ON public.table_sessions TO service_role;
GRANT ALL ON public.table_session_orders TO authenticated;
GRANT ALL ON public.table_session_orders TO service_role;

-- 5. Habilitar RLS
ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_session_orders ENABLE ROW LEVEL SECURITY;

-- 6. Políticas (usando is_admin da tabela profiles)
CREATE POLICY "Users can manage sessions of their pizzerias" ON public.table_sessions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.pizzerias p
            WHERE p.id = restaurant_id AND (p.owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
        )
    );

CREATE POLICY "Users can manage session orders" ON public.table_session_orders
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.table_sessions ts
            JOIN public.pizzerias p ON p.id = ts.restaurant_id
            WHERE ts.id = table_session_id AND (p.owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
        )
    );

-- 7. Trigger para updated_at em table_sessions
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_table_sessions_updated_at') THEN
        CREATE TRIGGER update_table_sessions_updated_at
        BEFORE UPDATE ON public.table_sessions
        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;