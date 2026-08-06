-- ---------------------------------------------------------------------------
-- Intenções de checkout
--
-- O checkout da InfinityPay por link redireciona o cliente, depois de pagar,
-- para uma URL fixa configurada no painel dela. Essa URL é a mesma para todos
-- os clientes e fica visível no histórico do navegador — ou seja, ela não
-- prova pagamento nenhum. Quem digitar a URL chega na mesma página de quem
-- pagou.
--
-- Esta tabela é o que dá alguma amarração ao retorno. Antes de mandar o
-- cliente para o checkout, o servidor registra aqui uma intenção com um token
-- aleatório, guardado no navegador dele. No retorno, o token precisa existir,
-- estar dentro do prazo, não ter sido usado, e apontar para o mesmo plano da
-- URL de retorno.
--
-- Isso continua não sendo confirmação de pagamento — só a InfinityPay pode
-- dar essa informação. É por isso que o retorno registra "cliente voltou do
-- checkout", e não "cliente pagou".
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.checkout_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Só o hash. O token em claro existe no navegador do cliente; um vazamento
  -- desta tabela não deve entregar tokens utilizáveis.
  token_hash TEXT NOT NULL UNIQUE,

  company_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,

  plan_code TEXT NOT NULL,

  -- Valor que o servidor esperava cobrar quando criou a intenção. Guardado
  -- para conferência posterior contra o que a InfinityPay informar: o preço
  -- nunca vem do navegador.
  expected_amount_cents BIGINT NOT NULL CHECK (expected_amount_cents >= 0),

  -- Para onde o cliente foi mandado. Se a URL do checkout mudar, dá para
  -- saber qual estava valendo em cada cadastro.
  checkout_url TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'started'
    CHECK (status IN ('started', 'returned', 'confirmed', 'expired', 'canceled')),

  returned_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkout_intents_company_idx
  ON public.checkout_intents(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS checkout_intents_status_idx
  ON public.checkout_intents(status)
  WHERE status IN ('started', 'returned');

-- ---------------------------------------------------------------------------
-- RLS
--
-- Nenhuma policy. O token é credencial ao portador: um cliente autenticado
-- que conseguisse ler esta tabela leria as intenções de outros cadastros.
-- Todo acesso passa pelas funções de servidor, com a service role.
-- ---------------------------------------------------------------------------

ALTER TABLE public.checkout_intents ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Expiração
--
-- Uma intenção vencida não pode continuar aceitável só porque ninguém rodou
-- limpeza. A checagem de prazo é feita na consulta; esta função existe para
-- higiene do histórico e pode ser chamada pelo mesmo agendador do fechamento
-- de ciclos.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expire_stale_checkout_intents()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE public.checkout_intents
     SET status = 'expired',
         updated_at = now()
   WHERE status IN ('started', 'returned')
     AND expires_at < now();

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

COMMENT ON TABLE public.checkout_intents IS
  'Amarra o retorno do checkout por link ao cadastro que o iniciou. Não é prova de pagamento.';
