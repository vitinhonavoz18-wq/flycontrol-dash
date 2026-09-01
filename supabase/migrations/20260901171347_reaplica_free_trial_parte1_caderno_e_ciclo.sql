-- Reaplicação do período gratuito, parte 1: o caderno e o abridor de ciclo.
--
-- POR QUE ESTA MIGRAÇÃO EXISTE DUAS VEZES
--
-- A migração 20260820120000 estava marcada como aplicada, mas o SQL nunca
-- rodou: a tabela `trial_grants` não existia e `open_billing_cycle` ainda era
-- a versão antiga, de 4 parâmetros. Era o caderno da portaria dizer que a
-- reforma foi feita quando o pedreiro nunca apareceu.
--
-- Consequência: NENHUM cliente recebeu os 30 dias grátis desde então.
--
-- Tudo aqui é idempotente, então rodar de novo num banco correto não muda nada.

CREATE TABLE IF NOT EXISTS public.trial_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  owner_user_id UUID,
  -- Minusculas e sem espaco: "Joao@X.com " e "joao@x.com" sao a mesma pessoa.
  owner_email_normalized TEXT NOT NULL,
  -- Somente digitos do CNPJ/CPF. Vazio vira NULL para nao travar quem nao
  -- informou o documento.
  document_digits TEXT,
  trial_started_at TIMESTAMPTZ NOT NULL,
  trial_ends_at TIMESTAMPTZ NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (trial_ends_at > trial_started_at)
);

-- Uma concessao por estabelecimento.
CREATE UNIQUE INDEX IF NOT EXISTS trial_grants_company_uq
  ON public.trial_grants(company_id);

-- Uma concessao por e-mail do responsavel.
CREATE UNIQUE INDEX IF NOT EXISTS trial_grants_email_uq
  ON public.trial_grants(owner_email_normalized);

-- Uma concessao por CNPJ/CPF, quando informado.
CREATE UNIQUE INDEX IF NOT EXISTS trial_grants_document_uq
  ON public.trial_grants(document_digits)
  WHERE document_digits IS NOT NULL;

ALTER TABLE public.trial_grants ENABLE ROW LEVEL SECURITY;

-- Sem politica de leitura para o cliente: este caderno e da administracao.
-- A service role ignora RLS, entao o servidor continua enxergando tudo.
DROP POLICY IF EXISTS "trial_grants_no_client_access" ON public.trial_grants;

-- ---------------------------------------------------------------------------
-- 4. Abridor de ciclo: aprende "ciclo gratuito de 30 dias"
--
-- Os dois parametros novos entram no fim e com valor padrao, entao toda
-- chamada que ja existe continua funcionando exatamente como antes.
-- ---------------------------------------------------------------------------

-- A versao antiga tem 4 parametros. Sem apagar, o Postgres ficaria com DUAS
-- funcoes de mesmo nome, e uma chamada com 4 argumentos continuaria caindo na
-- antiga - que nao conhece ciclo gratuito. E como deixar o cardapio velho
-- pendurado ao lado do novo: alguem sempre pede pelo errado.
DROP FUNCTION IF EXISTS public.open_billing_cycle(UUID, TIMESTAMPTZ, BIGINT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.open_billing_cycle(
  p_subscription_id UUID,
  p_cycle_start TIMESTAMPTZ DEFAULT now(),
  p_unit_price_cents BIGINT DEFAULT NULL,
  p_qualified_from_previous BOOLEAN DEFAULT false,
  p_cycle_type TEXT DEFAULT 'usage',
  p_duration_days INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
  v_price RECORD;
  v_existing UUID;
  v_cycle_id UUID;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_anchor_day INTEGER;
  v_days_next_month INTEGER;
BEGIN
  SELECT * INTO v_sub FROM public.subscriptions WHERE id = p_subscription_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assinatura % nao encontrada', p_subscription_id;
  END IF;

  IF p_cycle_type NOT IN ('free_trial', 'usage') THEN
    RAISE EXCEPTION 'Tipo de ciclo invalido: %', p_cycle_type;
  END IF;

  SELECT id INTO v_existing
  FROM public.billing_cycles
  WHERE subscription_id = p_subscription_id AND status = 'open'
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_price
  FROM public.plan_price_versions
  WHERE id = v_sub.plan_price_version_id;

  v_start := p_cycle_start;

  IF p_duration_days IS NOT NULL AND p_duration_days > 0 THEN
    -- Duracao fixa em dias. E o que sustenta a promessa "30 dias gratis":
    -- 30 dias sao 30 dias, e nao "ate o mesmo dia do mes que vem", que daria
    -- 28 em fevereiro e 31 em marco.
    v_end := v_start + (p_duration_days || ' days')::INTERVAL - INTERVAL '1 microsecond';
  ELSE
    -- Fim do ciclo = instante anterior ao inicio do proximo. Quando o dia
    -- ancora nao existe no mes seguinte (31 caindo em fevereiro), o proximo
    -- ciclo comeca no dia 1 do mes subsequente, para nenhum dia ficar sem
    -- ciclo. Mesma regra de computeNextCycleStart no TypeScript.
    v_anchor_day := EXTRACT(DAY FROM v_start)::INTEGER;
    v_days_next_month := EXTRACT(
      DAY FROM (date_trunc('month', v_start) + INTERVAL '2 month' - INTERVAL '1 day')
    )::INTEGER;

    IF v_anchor_day > v_days_next_month THEN
      v_end := date_trunc('month', v_start) + INTERVAL '2 month' - INTERVAL '1 microsecond';
    ELSE
      v_end := v_start + INTERVAL '1 month' - INTERVAL '1 microsecond';
    END IF;
  END IF;

  INSERT INTO public.billing_cycles (
    subscription_id, company_id, cycle_start, cycle_end, status, cycle_type,
    unit_price_cents, promotion_threshold_orders, qualified_from_previous_cycle
  ) VALUES (
    p_subscription_id, v_sub.company_id, v_start, v_end, 'open', p_cycle_type,
    -- No ciclo gratuito o preco congelado e ZERO. Mesmo que um pedido seja
    -- contado, ele vale R$ 0,00: a gratuidade nao depende de ninguem lembrar
    -- de pular a cobranca depois.
    CASE
      WHEN p_cycle_type = 'free_trial' THEN 0
      ELSE coalesce(p_unit_price_cents, v_price.default_order_unit_price_cents)
    END,
    v_price.promotion_threshold_orders,
    p_qualified_from_previous
  )
  RETURNING id INTO v_cycle_id;

  UPDATE public.subscriptions
  SET current_cycle_id = v_cycle_id,
      billing_cycle_started_at = v_start,
      billing_cycle_ends_at = v_end,
      total_billable_orders = 0,
      current_order_rate = CASE
        WHEN p_cycle_type = 'free_trial' THEN 0
        ELSE coalesce(p_unit_price_cents, v_price.default_order_unit_price_cents)
      END,
      amount_due = 0,
      updated_at = now()
  WHERE id = p_subscription_id;

  RETURN v_cycle_id;
END;
$$;

-- ---------------------------------------------------------------------------
