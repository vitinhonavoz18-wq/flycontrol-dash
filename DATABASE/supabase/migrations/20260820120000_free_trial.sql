-- ---------------------------------------------------------------------------
-- Periodo gratuito de 30 dias (FREE_TRIAL) + ciclo de uso (USAGE_CYCLE)
--
-- Arquivo em ASCII puro de proposito: ele e colado no editor SQL do Supabase,
-- e acento colado de um lado e lido do outro com codificacao diferente vira
-- lixo na tela. Onde o texto com acento vira DADO, usamos escapes E'\uXXXX'.
--
-- Tudo aqui e re-executavel: rodar duas vezes nao quebra e nao duplica.
--
-- O que este arquivo faz:
--   1. Guarda no banco as datas e os numeros do periodo gratuito.
--   2. Marca cada ciclo como "gratuito" ou "de uso".
--   3. Cria o caderno de concessoes de trial, que impede a mesma pessoa
--      ganhar 30 dias gratis de novo so refazendo o cadastro.
--   4. Ensina o abridor de ciclo a abrir um ciclo gratuito de 30 dias.
--   5. Concentra a concessao do trial em UMA funcao no banco, para que o
--      navegador nao consiga conceder nada por conta propria.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Assinatura: datas e numeros do periodo gratuito
-- ---------------------------------------------------------------------------

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_cycle_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_cycle_ends_at TIMESTAMPTZ,
  -- Data prevista da PRIMEIRA cobranca. Previsao enquanto o ciclo esta aberto,
  -- fato depois do fechamento.
  ADD COLUMN IF NOT EXISTS first_charge_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_billable_orders INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_order_rate BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_due BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.subscriptions.trial_started_at IS
  'Inicio do periodo gratuito. Gravado pelo servidor, nunca pelo navegador.';
COMMENT ON COLUMN public.subscriptions.first_charge_at IS
  'Data prevista/efetiva da primeira cobranca. Nada e cobrado antes disso.';
COMMENT ON COLUMN public.subscriptions.total_billable_orders IS
  'Pedidos contabilizados no ciclo corrente. Espelho de billing_cycles, para leitura barata na tela.';

-- O periodo gratuito e um estado proprio da assinatura. Sem ele, "esta no
-- trial" viraria uma conta de datas espalhada por varios lugares do codigo -
-- e cada lugar poderia calcular diferente.
DO $$
BEGIN
  ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
  ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN (
      'pending_activation', 'pending_payment', 'free_trial', 'active',
      'past_due', 'suspended', 'canceled', 'expired'
    ));
END $$;

-- ---------------------------------------------------------------------------
-- 2. Ciclo: gratuito ou de uso
-- ---------------------------------------------------------------------------

ALTER TABLE public.billing_cycles
  ADD COLUMN IF NOT EXISTS cycle_type TEXT NOT NULL DEFAULT 'usage';

DO $$
BEGIN
  ALTER TABLE public.billing_cycles DROP CONSTRAINT IF EXISTS billing_cycles_cycle_type_check;
  ALTER TABLE public.billing_cycles ADD CONSTRAINT billing_cycles_cycle_type_check
    CHECK (cycle_type IN ('free_trial', 'usage'));
END $$;

COMMENT ON COLUMN public.billing_cycles.cycle_type IS
  'free_trial = 30 dias por nossa conta, fecha sem fatura. usage = ciclo cobrado.';

-- Ciclos ja existentes sao todos de uso: o padrao da coluna ja cuidou disso.

-- ---------------------------------------------------------------------------
-- 3. Caderno de concessoes do periodo gratuito
--
-- E o caderno de reservas do restaurante: um nome por mesa. Se alguem tentar
-- escrever o mesmo nome duas vezes, a caneta trava. Aqui a "caneta" e o indice
-- unico - e ele trava no banco, nao no aplicativo, entao nao adianta refazer o
-- login, limpar o navegador ou chamar a API na mao.
-- ---------------------------------------------------------------------------

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
-- 5. Contagem de pedidos durante o periodo gratuito
--
-- A assinatura em periodo gratuito passa a contar pedidos como qualquer
-- outra. Nao ha risco de cobrar por eles: o preco congelado do ciclo gratuito
-- e zero. O ganho e que o cliente ve, no proprio painel, quantos pedidos ja
-- fez - e nos temos a metrica sem inventar um contador paralelo.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_order_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
  v_cycle RECORD;
  v_was_billable BOOLEAN;
  v_is_billable BOOLEAN;
  v_key TEXT;
  v_inserted INTEGER;
BEGIN
  v_is_billable := public.is_billable_order_status(NEW.status)
    AND NOT public.is_ghost_order(NEW.total, NEW.items, NEW.customer_name);

  v_was_billable := TG_OP = 'UPDATE'
    AND public.is_billable_order_status(OLD.status)
    AND NOT public.is_ghost_order(OLD.total, OLD.items, OLD.customer_name);

  IF v_is_billable = v_was_billable THEN
    RETURN NEW;
  END IF;

  -- So planos por uso geram consumo. PREMIUM conta pedido como metrica, mas
  -- nao como faturamento. 'free_trial' entra na lista: conta, mas a R$ 0,00.
  SELECT s.* INTO v_sub
  FROM public.subscriptions s
  WHERE s.company_id = NEW.tenant_id
    AND s.status IN ('active', 'past_due', 'free_trial')
    AND s.billing_model = 'usage_per_order'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_cycle
  FROM public.billing_cycles
  WHERE subscription_id = v_sub.id AND status = 'open'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE WARNING '[billing] pedido % sem ciclo aberto na assinatura %', NEW.id, v_sub.id;
    RETURN NEW;
  END IF;

  IF v_is_billable THEN
    v_key := 'order_billable:' || v_cycle.id || ':' || NEW.id;

    INSERT INTO public.usage_events (
      company_id, subscription_id, billing_cycle_id, order_id,
      event_type, quantity, unit_price_cents, idempotency_key, metadata
    ) VALUES (
      NEW.tenant_id, v_sub.id, v_cycle.id, NEW.id,
      'order_billable', 1, v_cycle.unit_price_cents, v_key,
      jsonb_build_object('status', NEW.status, 'source', NEW.source,
                         'cycle_type', v_cycle.cycle_type)
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted > 0 THEN
      UPDATE public.billing_cycles
      SET billable_order_count = billable_order_count + 1, updated_at = now()
      WHERE id = v_cycle.id;

      -- Espelho na assinatura: a tela do cliente le uma linha so, em vez de
      -- somar eventos a cada abertura do painel.
      UPDATE public.subscriptions
      SET total_billable_orders = total_billable_orders + 1,
          amount_due = amount_due + v_cycle.unit_price_cents,
          updated_at = now()
      WHERE id = v_sub.id;
    END IF;

  ELSE
    v_key := 'order_reversal:' || v_cycle.id || ':' || NEW.id;

    IF EXISTS (
      SELECT 1 FROM public.usage_events
      WHERE billing_cycle_id = v_cycle.id
        AND order_id = NEW.id
        AND event_type = 'order_billable'
    ) THEN
      INSERT INTO public.usage_events (
        company_id, subscription_id, billing_cycle_id, order_id,
        event_type, quantity, unit_price_cents, idempotency_key, metadata
      ) VALUES (
        NEW.tenant_id, v_sub.id, v_cycle.id, NEW.id,
        'order_reversal', -1, v_cycle.unit_price_cents, v_key,
        jsonb_build_object('from_status', OLD.status, 'to_status', NEW.status)
      )
      ON CONFLICT (idempotency_key) DO NOTHING;

      GET DIAGNOSTICS v_inserted = ROW_COUNT;
      IF v_inserted > 0 THEN
        UPDATE public.billing_cycles
        SET billable_order_count = GREATEST(billable_order_count - 1, 0), updated_at = now()
        WHERE id = v_cycle.id;

        UPDATE public.subscriptions
        SET total_billable_orders = GREATEST(total_billable_orders - 1, 0),
            amount_due = GREATEST(amount_due - v_cycle.unit_price_cents, 0),
            updated_at = now()
        WHERE id = v_sub.id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[billing] falha ao registrar consumo do pedido %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Concessao do periodo gratuito - UMA porta, dentro do banco
--
-- Tudo acontece numa transacao so: escreve no caderno, muda o estado da
-- assinatura, marca a empresa e abre o ciclo gratuito. Se qualquer parte
-- falhar, nada fica pela metade.
--
-- Devolve JSON dizendo se concedeu e por que nao, quando nao concedeu.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_free_trial(
  p_subscription_id UUID,
  p_owner_email TEXT,
  p_document TEXT DEFAULT NULL,
  p_duration_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
  v_email TEXT;
  v_document TEXT;
  v_start TIMESTAMPTZ := now();
  v_end TIMESTAMPTZ;
  v_cycle_id UUID;
  v_existing RECORD;
  v_written INTEGER;
BEGIN
  IF p_duration_days IS NULL OR p_duration_days <= 0 THEN
    p_duration_days := 30;
  END IF;

  SELECT * INTO v_sub FROM public.subscriptions WHERE id = p_subscription_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'subscription_not_found');
  END IF;

  -- Ja esta no periodo gratuito: repetir a chamada devolve o mesmo estado em
  -- vez de comecar tudo de novo. Clique duplo e reenvio de formulario nao
  -- podem render 60 dias.
  IF v_sub.status = 'free_trial' AND v_sub.trial_ends_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'granted', true,
      'already_granted', true,
      'trial_started_at', v_sub.trial_started_at,
      'trial_ends_at', v_sub.trial_ends_at
    );
  END IF;

  -- Assinatura que ja passou do comeco nao volta para o gratuito.
  IF v_sub.status NOT IN ('pending_activation', 'pending_payment') THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'subscription_not_eligible');
  END IF;

  v_email := lower(btrim(coalesce(p_owner_email, '')));
  IF v_email = '' THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'missing_email');
  END IF;

  v_document := nullif(regexp_replace(coalesce(p_document, ''), '[^0-9]', '', 'g'), '');
  v_end := v_start + (p_duration_days || ' days')::INTERVAL;

  -- Escreve no caderno. O indice unico e quem decide: se este e-mail, este
  -- documento ou esta empresa ja ganharam 30 dias, a linha nao entra.
  BEGIN
    INSERT INTO public.trial_grants (
      company_id, subscription_id, owner_user_id, owner_email_normalized,
      document_digits, trial_started_at, trial_ends_at
    )
    SELECT v_sub.company_id, v_sub.id, pz.owner_id, v_email,
           v_document, v_start, v_end
    FROM public.pizzerias pz
    WHERE pz.id = v_sub.company_id;

    GET DIAGNOSTICS v_written = ROW_COUNT;
    IF v_written = 0 THEN
      -- Sem estabelecimento nao ha o que liberar. Melhor recusar do que
      -- conceder um trial sem registro no caderno.
      RETURN jsonb_build_object('granted', false, 'reason', 'company_not_found');
    END IF;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.trial_grants
    WHERE company_id = v_sub.company_id
       OR owner_email_normalized = v_email
       OR (v_document IS NOT NULL AND document_digits = v_document)
    LIMIT 1;

    RETURN jsonb_build_object(
      'granted', false,
      'reason', 'trial_already_used',
      'previous_trial_ends_at', v_existing.trial_ends_at
    );
  END;

  UPDATE public.subscriptions
  SET status = 'free_trial',
      activated_at = coalesce(activated_at, v_start),
      trial_started_at = v_start,
      trial_ends_at = v_end,
      billing_anchor_day = EXTRACT(DAY FROM v_end)::SMALLINT,
      -- Nada e cobrado no periodo gratuito. A primeira cobranca so aparece
      -- quando o ciclo de uso fechar, e essa data e escrita la.
      first_charge_at = NULL,
      updated_at = now()
  WHERE id = p_subscription_id;

  UPDATE public.pizzerias
  SET subscription_status = 'free_trial'
  WHERE id = v_sub.company_id;

  v_cycle_id := public.open_billing_cycle(
    p_subscription_id := p_subscription_id,
    p_cycle_start := v_start,
    p_unit_price_cents := 0,
    p_qualified_from_previous := false,
    p_cycle_type := 'free_trial',
    p_duration_days := p_duration_days
  );

  INSERT INTO public.subscription_events (
    subscription_id, company_id, event_type, previous_status, new_status, reason, metadata
  ) VALUES (
    p_subscription_id, v_sub.company_id, 'free_trial_started',
    v_sub.status, 'free_trial',
    'Periodo gratuito de ' || p_duration_days || ' dias concedido no cadastro',
    jsonb_build_object(
      'trial_started_at', v_start,
      'trial_ends_at', v_end,
      'billing_cycle_id', v_cycle_id,
      'duration_days', p_duration_days
    )
  );

  RETURN jsonb_build_object(
    'granted', true,
    'already_granted', false,
    'trial_started_at', v_start,
    'trial_ends_at', v_end,
    'billing_cycle_id', v_cycle_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_free_trial(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_free_trial(UUID, TEXT, TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.start_free_trial(UUID, TEXT, TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.start_free_trial(UUID, TEXT, TEXT, INTEGER) TO service_role;

-- O abridor de ciclo tambem nao e assunto do navegador.
REVOKE ALL ON FUNCTION public.open_billing_cycle(UUID, TIMESTAMPTZ, BIGINT, BOOLEAN, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_billing_cycle(UUID, TIMESTAMPTZ, BIGINT, BOOLEAN, TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.open_billing_cycle(UUID, TIMESTAMPTZ, BIGINT, BOOLEAN, TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.open_billing_cycle(UUID, TIMESTAMPTZ, BIGINT, BOOLEAN, TEXT, INTEGER) TO service_role;
