-- =============================================================================
-- APLICAR NO SUPABASE (SQL Editor) — Premium Mensal R$ 89,90 + Premium Anual
-- Projeto: knhenchgntttraaeewlj (FlyControl)
--
-- Este arquivo é a migration
--   supabase/migrations/20261015120000_premium_mensal_e_anual.sql
-- embrulhada em uma transação ÚNICA, com travas antes e conferências depois.
-- Se qualquer conferência falhar, o próprio script dá erro e NADA fica
-- gravado (ROLLBACK automático da transação).
--
-- ORDEM: aplicar este SQL ANTES de publicar o código desta branch. O código
-- novo lê a coluna billing_interval_months; publicado antes, a tela de
-- cobrança do lojista e o painel financeiro dariam erro de coluna.
--
-- Pode rodar de novo: é idempotente.
-- =============================================================================

-- 0) Fotografia ANTES (só leitura) — guarde o resultado para comparar.
SELECT s.id, pz.name, p.code AS plano, pv.version, pv.monthly_fee_cents, s.status
FROM public.subscriptions s
JOIN public.pizzerias pz ON pz.id = s.company_id
JOIN public.plans p ON p.id = s.plan_id
JOIN public.plan_price_versions pv ON pv.id = s.plan_price_version_id
ORDER BY pz.name;

BEGIN;

-- Trava contra ficar esperando outra escrita nos preços por muito tempo.
SET LOCAL lock_timeout = '10s';

-- 1) Impressão digital das assinaturas ANTES. Nenhuma assinatura pode mudar
--    de plano, versão de preço ou status por causa deste script.
CREATE TEMP TABLE _assinaturas_antes ON COMMIT DROP AS
SELECT id, plan_id, plan_price_version_id, status FROM public.subscriptions;

CREATE TEMP TABLE _ciclos_antes ON COMMIT DROP AS
SELECT id, status, cycle_start, cycle_end FROM public.billing_cycles;

-- 2) Pré-condição: o Premium v1 (R$ 375,00) existe — é a versão que a ADEGA
--    contratou e ela não pode sumir nem mudar.
DO $pre$
DECLARE v_ok BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.plan_price_versions pv JOIN public.plans p ON p.id = pv.plan_id
    WHERE p.code = 'premium' AND pv.version = 1 AND pv.monthly_fee_cents = 37500
  ) INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'TRAVA: Premium v1 a R$ 375,00 nao encontrado. Pare e confira antes de aplicar.';
  END IF;
END $pre$;

-- =========================== MIGRATION (início) ==============================
-- Premium Mensal a R$ 89,90 e Premium Anual a R$ 598,80 (12 meses).
--
-- O QUE MUDA PARA O CLIENTE
--
-- * Quem contratar o Premium a partir de agora paga R$ 89,90 por mês
--   (Premium Mensal) ou R$ 598,80 de uma vez, valendo 12 meses (Premium
--   Anual — equivale a R$ 49,90/mês, mas NUNCA é cobrado mês a mês).
-- * Quem JÁ é assinante não muda nada: continua com o preço e o período que
--   contratou. A assinatura aponta para a versão de preço que contratou, e
--   essa versão não é alterada aqui — só deixa de ser oferecida a novos
--   clientes. É o caderno de preços: escreve-se o preço novo na linha de
--   baixo e risca-se o antigo para quem chega; quem já pediu paga o da
--   comanda.
--
-- O QUE ESTA MIGRATION FAZ (tudo aditivo; nada é apagado)
--
--   1. plan_price_versions ganha `billing_interval_months` (1 ou 12). Todas
--      as versões existentes ficam com 1 — o mensal de sempre.
--   2. checkout_intents ganha colunas para a contratação feita DE DENTRO do
--      painel (upgrade) e para guardar o comprovante do pagamento (valor
--      pago, identificador da transação na InfinityPay, forma de pagamento).
--   3. Cria o plano `premium_anual` e a versão 1 dele (R$ 598,80 / 12 meses).
--   4. Premium: versão 2 a R$ 89,90/mês; a versão 1 (R$ 375,00) sai de
--      circulação para NOVAS contratações, sem tocar em quem a usa.
--   5. open_billing_cycle passa a respeitar a duração do ciclo da versão
--      contratada (1 ou 12 meses). Para versões mensais a conta é idêntica à
--      de antes, linha por linha.
--
-- Idempotente: pode rodar mais de uma vez sem duplicar nada.

-- ---------------------------------------------------------------------------
-- 1. Duração do ciclo na versão de preço
-- ---------------------------------------------------------------------------

ALTER TABLE public.plan_price_versions
  ADD COLUMN IF NOT EXISTS billing_interval_months SMALLINT NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'plan_price_versions_billing_interval_months_check'
       AND conrelid = 'public.plan_price_versions'::regclass
  ) THEN
    ALTER TABLE public.plan_price_versions
      ADD CONSTRAINT plan_price_versions_billing_interval_months_check
      CHECK (billing_interval_months IN (1, 12));
  END IF;
END $$;

COMMENT ON COLUMN public.plan_price_versions.billing_interval_months IS
  'Duração do ciclo em meses (1 = mensal, 12 = anual). monthly_fee_cents é o valor cobrado POR CICLO: no anual, R$ 598,80 de uma vez.';

-- ---------------------------------------------------------------------------
-- 2. Intenções de checkout: contratação pelo painel + comprovante
-- ---------------------------------------------------------------------------

ALTER TABLE public.checkout_intents
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'signup',
  ADD COLUMN IF NOT EXISTS plan_price_version_id UUID REFERENCES public.plan_price_versions(id),
  ADD COLUMN IF NOT EXISTS previous_plan_code TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_amount_cents BIGINT,
  ADD COLUMN IF NOT EXISTS transaction_nsu TEXT,
  ADD COLUMN IF NOT EXISTS capture_method TEXT,
  ADD COLUMN IF NOT EXISTS activation_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'checkout_intents_kind_check'
       AND conrelid = 'public.checkout_intents'::regclass
  ) THEN
    ALTER TABLE public.checkout_intents
      ADD CONSTRAINT checkout_intents_kind_check CHECK (kind IN ('signup', 'upgrade'));
  END IF;
END $$;

-- Uma transação da InfinityPay só pode confirmar UMA contratação. É o
-- carimbo de "pago" na comanda: a mesma nota não quita duas mesas.
CREATE UNIQUE INDEX IF NOT EXISTS checkout_intents_transaction_nsu_uniq
  ON public.checkout_intents(transaction_nsu)
  WHERE transaction_nsu IS NOT NULL;

-- O robô procura contratações pagas cujo aviso não chegou.
CREATE INDEX IF NOT EXISTS checkout_intents_open_idx
  ON public.checkout_intents(status, created_at)
  WHERE status IN ('started', 'returned');

-- ---------------------------------------------------------------------------
-- 3. Plano Premium Anual
-- ---------------------------------------------------------------------------

INSERT INTO public.plans (code, name, description, billing_model, is_public, sort_order)
VALUES (
  'premium_anual', 'Premium Anual',
  'Os mesmos recursos do Premium Mensal, com um único pagamento por ano e o menor custo mensal.',
  -- 'monthly_fixed' aqui quer dizer "valor fixo por ciclo" (não por pedido).
  -- A duração do ciclo (12 meses) mora na versão de preço.
  'monthly_fixed', true, 1
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.plan_price_versions (
  plan_id, version, setup_fee_cents, monthly_fee_cents,
  default_order_unit_price_cents, promotional_order_unit_price_cents,
  promotion_threshold_orders, billing_interval_months, change_reason
)
SELECT p.id, 1, 0, 59880, 0, 0, 0, 12,
       'Premium Anual: R$ 598,80 por 12 meses (equivale a R$ 49,90/mês)'
FROM public.plans p
WHERE p.code = 'premium_anual'
  AND NOT EXISTS (
    SELECT 1 FROM public.plan_price_versions pv WHERE pv.plan_id = p.id AND pv.version = 1
  );

-- Mesmos recursos do Premium: copia o que o Premium libera.
INSERT INTO public.plan_features (plan_id, feature_key, is_enabled, limit_value)
SELECT pa.id, pf.feature_key, pf.is_enabled, pf.limit_value
FROM public.plans pa
JOIN public.plans pm ON pm.code = 'premium'
JOIN public.plan_features pf ON pf.plan_id = pm.id
WHERE pa.code = 'premium_anual'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Premium Mensal: versão 2 a R$ 89,90
-- ---------------------------------------------------------------------------
--
-- A versão 1 (R$ 375,00) só sai de circulação para quem chega. Assinaturas
-- que apontam para ela continuam apontando — e o fechamento do ciclo lê o
-- preço pela versão da assinatura. Nenhum UPDATE em `subscriptions` aqui.
--
-- O cadastro procura a versão ativa e espera exatamente UMA; por isso as
-- duas operações abaixo andam juntas (aplicar dentro de BEGIN/COMMIT). Rodar
-- de novo — inclusive depois de uma reversão — volta ao mesmo estado.

INSERT INTO public.plan_price_versions (
  plan_id, version, setup_fee_cents, monthly_fee_cents,
  default_order_unit_price_cents, promotional_order_unit_price_cents,
  promotion_threshold_orders, billing_interval_months, is_active, change_reason
)
SELECT p.id, 2, 0, 8990, 0, 0, 0, 1, true,
       'Premium Mensal: R$ 89,90/mês para novas contratações. Assinaturas existentes mantêm a versão contratada.'
FROM public.plans p
WHERE p.code = 'premium'
  AND NOT EXISTS (
    SELECT 1 FROM public.plan_price_versions pv WHERE pv.plan_id = p.id AND pv.version = 2
  );

-- Garante a v2 (R$ 89,90) como a oferecida…
UPDATE public.plan_price_versions pv
SET is_active = true, effective_until = NULL
FROM public.plans p
WHERE pv.plan_id = p.id AND p.code = 'premium' AND pv.version = 2
  AND pv.monthly_fee_cents = 8990 AND NOT pv.is_active;

-- …e tira de circulação qualquer outra versão do Premium (a v1 de R$ 375,00).
UPDATE public.plan_price_versions pv
SET is_active = false,
    effective_until = COALESCE(pv.effective_until, now())
FROM public.plans p
WHERE pv.plan_id = p.id
  AND p.code = 'premium'
  AND pv.version <> 2
  AND pv.is_active;

-- Plano anual à venda (também depois de uma reversão).
UPDATE public.plans
SET is_active = true, is_public = true, updated_at = now()
WHERE code = 'premium_anual' AND (NOT is_active OR NOT is_public);

UPDATE public.plans
SET name = 'Premium Mensal', updated_at = now()
WHERE code = 'premium' AND name <> 'Premium Mensal';

-- ---------------------------------------------------------------------------
-- 5. Abertura de ciclo respeitando 1 ou 12 meses
-- ---------------------------------------------------------------------------
--
-- Mesma assinatura (mesmos parâmetros e padrões) da versão em produção —
-- CREATE OR REPLACE substitui o corpo sem criar uma segunda função. A única
-- mudança: em vez de "+1 mês" fixo, soma a duração da versão contratada.
-- Com duração 1 a conta é exatamente a anterior.

CREATE OR REPLACE FUNCTION public.open_billing_cycle(
  p_subscription_id uuid,
  p_cycle_start timestamp with time zone DEFAULT now(),
  p_unit_price_cents bigint DEFAULT NULL::bigint,
  p_qualified_from_previous boolean DEFAULT false,
  p_cycle_type text DEFAULT 'usage'::text,
  p_duration_days integer DEFAULT NULL::integer,
  p_cents_policy text DEFAULT 'cents_v1'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sub RECORD;
  v_price RECORD;
  v_existing UUID;
  v_cycle_id UUID;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_anchor_day INTEGER;
  v_days_target_month INTEGER;
  v_months INTEGER;
BEGIN
  SELECT * INTO v_sub FROM public.subscriptions WHERE id = p_subscription_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assinatura % nao encontrada', p_subscription_id;
  END IF;

  IF p_cycle_type NOT IN ('free_trial', 'usage') THEN
    RAISE EXCEPTION 'Tipo de ciclo invalido: %', p_cycle_type;
  END IF;

  IF p_cents_policy IS NULL OR p_cents_policy NOT IN ('cents_v1', 'cents_v2') THEN
    -- Na duvida, a tabela antiga: preco cheio. Inventar um desconto que
    -- ninguem contratou e pior do que cobrar o de sempre.
    p_cents_policy := 'cents_v1';
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

  -- Duracao do ciclo contratado. Periodo gratis segue sendo medido em dias.
  v_months := COALESCE(v_price.billing_interval_months, 1);
  IF v_months NOT IN (1, 12) THEN
    v_months := 1;
  END IF;

  v_start := p_cycle_start;

  IF p_duration_days IS NOT NULL AND p_duration_days > 0 THEN
    v_end := v_start + (p_duration_days || ' days')::INTERVAL - INTERVAL '1 microsecond';
  ELSE
    -- Mesma regra do mensal, generalizada para N meses: se o dia ancora nao
    -- existe no mes de destino (31 -> fevereiro, 29/02 -> ano nao bissexto),
    -- o ciclo vai ate o fim daquele mes e o seguinte comeca no dia 1. Nunca
    -- encurta: um dia sem ciclo seria um dia sem cobranca nem acesso.
    v_anchor_day := EXTRACT(DAY FROM v_start)::INTEGER;
    v_days_target_month := EXTRACT(
      DAY FROM (date_trunc('month', v_start) + make_interval(months => v_months + 1) - INTERVAL '1 day')
    )::INTEGER;

    IF v_anchor_day > v_days_target_month THEN
      v_end := date_trunc('month', v_start) + make_interval(months => v_months + 1) - INTERVAL '1 microsecond';
    ELSE
      v_end := v_start + make_interval(months => v_months) - INTERVAL '1 microsecond';
    END IF;
  END IF;

  INSERT INTO public.billing_cycles (
    subscription_id, company_id, cycle_start, cycle_end, status, cycle_type,
    unit_price_cents, promotion_threshold_orders, qualified_from_previous_cycle,
    cents_policy
  ) VALUES (
    p_subscription_id, v_sub.company_id, v_start, v_end, 'open', p_cycle_type,
    CASE
      WHEN p_cycle_type = 'free_trial' THEN 0
      ELSE coalesce(p_unit_price_cents, v_price.default_order_unit_price_cents)
    END,
    v_price.promotion_threshold_orders,
    p_qualified_from_previous,
    p_cents_policy
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
$function$;

-- ============================ MIGRATION (fim) ================================

-- 3) Conferências. Qualquer RAISE aqui desfaz TUDO.
DO $pos$
DECLARE
  v_count INTEGER;
  v_fee BIGINT;
  v_int INTEGER;
BEGIN
  -- Premium Mensal: exatamente UMA versão ativa, R$ 89,90 / 1 mês.
  SELECT count(*), max(pv.monthly_fee_cents), max(pv.billing_interval_months)
    INTO v_count, v_fee, v_int
  FROM public.plan_price_versions pv JOIN public.plans p ON p.id = pv.plan_id
  WHERE p.code = 'premium' AND pv.is_active;
  IF v_count <> 1 OR v_fee <> 8990 OR v_int <> 1 THEN
    RAISE EXCEPTION 'CONFERENCIA: Premium Mensal ativo esperado 1x 8990/1 mes, achei % x %/%', v_count, v_fee, v_int;
  END IF;

  -- Premium Anual: exatamente UMA versão ativa, R$ 598,80 / 12 meses.
  SELECT count(*), max(pv.monthly_fee_cents), max(pv.billing_interval_months)
    INTO v_count, v_fee, v_int
  FROM public.plan_price_versions pv JOIN public.plans p ON p.id = pv.plan_id
  WHERE p.code = 'premium_anual' AND pv.is_active AND p.is_active AND p.is_public;
  IF v_count <> 1 OR v_fee <> 59880 OR v_int <> 12 THEN
    RAISE EXCEPTION 'CONFERENCIA: Premium Anual ativo esperado 1x 59880/12 meses, achei % x %/%', v_count, v_fee, v_int;
  END IF;

  -- A versão antiga (R$ 375,00) continua existindo, com o mesmo valor.
  SELECT count(*) INTO v_count
  FROM public.plan_price_versions pv JOIN public.plans p ON p.id = pv.plan_id
  WHERE p.code = 'premium' AND pv.version = 1 AND pv.monthly_fee_cents = 37500;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'CONFERENCIA: a versao antiga do Premium (R$ 375,00) mudou ou sumiu';
  END IF;

  -- Toda versão antiga continua mensal.
  SELECT count(*) INTO v_count
  FROM public.plan_price_versions pv JOIN public.plans p ON p.id = pv.plan_id
  WHERE p.code <> 'premium_anual' AND pv.billing_interval_months <> 1;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'CONFERENCIA: % versao(oes) antiga(s) deixaram de ser mensais', v_count;
  END IF;

  -- NENHUMA assinatura mudou (plano, versão de preço, status).
  SELECT count(*) INTO v_count FROM (
    (SELECT id, plan_id, plan_price_version_id, status FROM public.subscriptions
     EXCEPT SELECT * FROM _assinaturas_antes)
    UNION ALL
    (SELECT * FROM _assinaturas_antes
     EXCEPT SELECT id, plan_id, plan_price_version_id, status FROM public.subscriptions)
  ) d;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'CONFERENCIA: % assinatura(s) mudaram — nada deveria mudar', v_count;
  END IF;

  -- NENHUM ciclo mudou (inclui o ciclo cancelado da ADEGA, que segue pausado).
  SELECT count(*) INTO v_count FROM (
    (SELECT id, status, cycle_start, cycle_end FROM public.billing_cycles
     EXCEPT SELECT * FROM _ciclos_antes)
    UNION ALL
    (SELECT * FROM _ciclos_antes
     EXCEPT SELECT id, status, cycle_start, cycle_end FROM public.billing_cycles)
  ) d;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'CONFERENCIA: % ciclo(s) mudaram — nada deveria mudar', v_count;
  END IF;

  -- Uma única função open_billing_cycle (sem sobrecarga duplicada).
  SELECT count(*) INTO v_count
  FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
  WHERE n.nspname = 'public' AND pr.proname = 'open_billing_cycle';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'CONFERENCIA: esperava 1 funcao open_billing_cycle, achei %', v_count;
  END IF;

  RAISE NOTICE 'OK: Premium Mensal 8990/1, Premium Anual 59880/12, nenhuma assinatura nem ciclo alterado.';
END $pos$;

COMMIT;

-- 4) Fotografia DEPOIS (só leitura) — deve ser idêntica à do passo 0.
SELECT s.id, pz.name, p.code AS plano, pv.version, pv.monthly_fee_cents, s.status
FROM public.subscriptions s
JOIN public.pizzerias pz ON pz.id = s.company_id
JOIN public.plans p ON p.id = s.plan_id
JOIN public.plan_price_versions pv ON pv.id = s.plan_price_version_id
ORDER BY pz.name;

SELECT p.code, pv.version, pv.monthly_fee_cents, pv.billing_interval_months, pv.is_active
FROM public.plan_price_versions pv JOIN public.plans p ON p.id = pv.plan_id
ORDER BY p.code, pv.version;
