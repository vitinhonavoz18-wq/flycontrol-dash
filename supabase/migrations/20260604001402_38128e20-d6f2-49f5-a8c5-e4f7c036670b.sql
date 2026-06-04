-- Adiciona colunas para gestão de planos e assinaturas
ALTER TABLE public.pizzerias 
ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'test',
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '7 days'),
ADD COLUMN IF NOT EXISTS subscription_price NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- Comentários para documentação
COMMENT ON COLUMN public.pizzerias.subscription_plan IS 'Plano contratado: test, starter, pro, premium, custom';
COMMENT ON COLUMN public.pizzerias.subscription_status IS 'Status da assinatura: active, trial, expired, suspended, canceled';
COMMENT ON COLUMN public.pizzerias.subscription_expires_at IS 'Data de expiração da assinatura/teste';
COMMENT ON COLUMN public.pizzerias.internal_notes IS 'Observações internas exclusivas para o administrador';
