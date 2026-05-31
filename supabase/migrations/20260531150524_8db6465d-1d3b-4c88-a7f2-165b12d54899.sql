-- Adicionar colunas de configuração FIQON na tabela pizzerias
ALTER TABLE public.pizzerias 
ADD COLUMN IF NOT EXISTS fiqon_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS fiqon_webhook_url TEXT;

-- Criar tabela de logs da FIQON
CREATE TABLE IF NOT EXISTS public.flycontrol_fiqon_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES public.pizzerias(id),
    order_id UUID REFERENCES public.orders(id),
    fiqon_url TEXT,
    payload JSONB,
    status_http INTEGER,
    response_body TEXT,
    success BOOLEAN,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flycontrol_fiqon_logs TO authenticated;
GRANT ALL ON public.flycontrol_fiqon_logs TO service_role;

-- Habilitar RLS
ALTER TABLE public.flycontrol_fiqon_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para os donos de pizzaria verem apenas seus logs
CREATE POLICY "Users can view their own pizzeria's FIQON logs" 
ON public.flycontrol_fiqon_logs 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.pizzerias p 
        WHERE p.id = restaurant_id AND p.owner_id = auth.uid()
    )
);
