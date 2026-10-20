-- =============================================================================
-- REVERTER (SQL Editor) — desfaz a migration 20261015120000_premium_mensal_e_anual
-- Projeto: knhenchgntttraaeewlj (FlyControl)
--
-- Volta a oferta para "Premium a R$ 375,00, sem plano anual". Não apaga NADA:
-- o plano anual e a versão de R$ 89,90 ficam guardados, só saem de circulação.
-- As colunas novas também ficam (vazias não atrapalham o código antigo).
--
-- ATENÇÃO — QUANDO NÃO REVERTER SÓ O BANCO
--
-- * Reverta o CÓDIGO junto (publicar de novo a versão anterior da `main`).
--   Mas cuidado: o código antigo cobra o valor do CATÁLOGO (R$ 375,00) de
--   toda assinatura Premium no fechamento do ciclo. Se alguém já tiver
--   contratado o Premium Mensal a R$ 89,90, o código antigo cobraria R$ 375,00
--   dessa pessoa na renovação. Por isso a trava abaixo recusa reverter se
--   houver qualquer assinatura na versão de R$ 89,90 ou no plano anual — nesse
--   caso, é preciso decidir caso a caso antes (fale com quem fez a mudança).
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '10s';

-- Trava: ninguém pode estar usando o que vai sair de circulação.
DO $trava$
DECLARE v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.subscriptions s
  JOIN public.plan_price_versions pv ON pv.id = s.plan_price_version_id
  JOIN public.plans p ON p.id = pv.plan_id
  WHERE (p.code = 'premium' AND pv.version >= 2) OR p.code = 'premium_anual';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'TRAVA: % assinatura(s) ja usam o Premium R$ 89,90 ou o Anual. Reverter cobraria o preco errado delas. Nada foi alterado.', v_count;
  END IF;
END $trava$;

-- 1. Premium volta a ser oferecido a R$ 375,00 (v1), v2 sai de circulação.
UPDATE public.plan_price_versions pv
SET is_active = false, effective_until = COALESCE(pv.effective_until, now())
FROM public.plans p
WHERE pv.plan_id = p.id AND p.code = 'premium' AND pv.version >= 2 AND pv.is_active;

UPDATE public.plan_price_versions pv
SET is_active = true, effective_until = NULL
FROM public.plans p
WHERE pv.plan_id = p.id AND p.code = 'premium' AND pv.version = 1;

UPDATE public.plans SET name = 'PREMIUM', updated_at = now() WHERE code = 'premium';

-- 2. Plano anual sai da vitrine (fica guardado, sem apagar).
UPDATE public.plans SET is_active = false, is_public = false, updated_at = now()
WHERE code = 'premium_anual';

-- 3. open_billing_cycle volta ao corpo anterior (sempre +1 mês).
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
  v_days_next_month INTEGER;
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

  v_start := p_cycle_start;

  IF p_duration_days IS NOT NULL AND p_duration_days > 0 THEN
    v_end := v_start + (p_duration_days || ' days')::INTERVAL - INTERVAL '1 microsecond';
  ELSE
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

-- Conferência: Premium com UMA versão ativa, a de R$ 375,00.
DO $pos$
DECLARE v_count INTEGER; v_fee BIGINT;
BEGIN
  SELECT count(*), max(pv.monthly_fee_cents) INTO v_count, v_fee
  FROM public.plan_price_versions pv JOIN public.plans p ON p.id = pv.plan_id
  WHERE p.code = 'premium' AND pv.is_active;
  IF v_count <> 1 OR v_fee <> 37500 THEN
    RAISE EXCEPTION 'CONFERENCIA: esperava 1 versao ativa a 37500, achei % x %', v_count, v_fee;
  END IF;
END $pos$;

COMMIT;

-- Opcional, só se tiver certeza de que nada novo usa: as colunas criadas
-- podem ficar. Remover colunas é destrutivo e não é necessário para o código
-- antigo funcionar — por isso NÃO está aqui.
