-- Cada ciclo passa a guardar QUAL tabela de preço usou.
--
-- O QUE MUDA NA PRÁTICA
--
-- O CENTS passa a cobrar por faixa: os primeiros 100 pedidos do mês a R$ 0,70,
-- os seguintes a R$ 0,60, depois R$ 0,50 e, a partir do pedido 501, R$ 0,40.
-- Quem vende mais paga menos por pedido, e a conta é feita por pedaços — como
-- a conta de luz, onde os primeiros quilowatts custam um valor e os de cima
-- custam outro. Não é "chegou a 500, tudo fica mais barato": é "o pedido 501
-- em diante custa mais barato".
--
-- O PROBLEMA QUE ISTO RESOLVE
--
-- Até aqui, a tabela de preços de um ciclo era decidida na hora de FECHAR a
-- conta, olhando uma configuração do servidor. Ou seja: mudar essa
-- configuração mudava o preço de meses que o cliente já tinha vendido. É o
-- cardápio da parede sendo reescrito depois que o cliente comeu.
--
-- Agora a tabela de preço é CARIMBADA quando o ciclo abre e fica gravada na
-- linha do ciclo. O fechamento lê o carimbo, não a configuração de hoje. O
-- preço que valia quando o pedido entrou é o preço que vai na fatura, e nada
-- que se mexa amanhã reescreve a conta de ontem.
--
-- QUEM MUDA E QUEM NÃO MUDA
--
-- Todos os ciclos que já existem — inclusive os ABERTOS agora — ficam com a
-- tabela antiga (preço único de R$ 0,70). Trocar a regra no meio do mês seria
-- mudar o combinado depois de o cliente já ter vendido. As faixas valem para
-- os ciclos que abrirem daqui para a frente.

-- ---------------------------------------------------------------------------
-- 1. A coluna do carimbo
-- ---------------------------------------------------------------------------

ALTER TABLE public.billing_cycles
  ADD COLUMN IF NOT EXISTS cents_policy TEXT NOT NULL DEFAULT 'cents_v1';

COMMENT ON COLUMN public.billing_cycles.cents_policy IS
  'Qual tabela de preços do CENTS este ciclo usou. Carimbada na abertura e nunca reescrita: é o que garante que mudar o preço hoje não muda a fatura de ontem.';

-- Só aceita versão que o sistema conhece. Um valor digitado errado aqui
-- viraria uma fatura calculada por uma tabela que não existe.
ALTER TABLE public.billing_cycles
  DROP CONSTRAINT IF EXISTS billing_cycles_cents_policy_check;

ALTER TABLE public.billing_cycles
  ADD CONSTRAINT billing_cycles_cents_policy_check
  CHECK (cents_policy IN ('cents_v1', 'cents_v2'));

-- As linhas que já existiam nasceram sob a tabela antiga. O DEFAULT acima já
-- resolve as novas; esta linha é para deixar explícito o que valeu no passado.
UPDATE public.billing_cycles
SET cents_policy = 'cents_v1'
WHERE cents_policy IS NULL;

-- ---------------------------------------------------------------------------
-- 2. O abridor de ciclo aprende a carimbar
--
-- O parâmetro entra no fim e com valor padrão, então toda chamada que já
-- existe continua funcionando exatamente como antes — e continua carimbando a
-- tabela antiga, que é o comportamento seguro para quem não pediu nada.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.open_billing_cycle(
  p_subscription_id UUID,
  p_cycle_start TIMESTAMPTZ DEFAULT now(),
  p_unit_price_cents BIGINT DEFAULT NULL,
  p_qualified_from_previous BOOLEAN DEFAULT false,
  p_cycle_type TEXT DEFAULT 'usage',
  p_duration_days INTEGER DEFAULT NULL,
  p_cents_policy TEXT DEFAULT 'cents_v1'
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
    unit_price_cents, promotion_threshold_orders, qualified_from_previous_cycle,
    cents_policy
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
$$;

-- A versao de 6 parametros sai de cena: com as duas no ar, uma chamada antiga
-- continuaria caindo na que nao carimba nada.
DROP FUNCTION IF EXISTS public.open_billing_cycle(UUID, TIMESTAMPTZ, BIGINT, BOOLEAN, TEXT, INTEGER);

REVOKE ALL ON FUNCTION public.open_billing_cycle(UUID, TIMESTAMPTZ, BIGINT, BOOLEAN, TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_billing_cycle(UUID, TIMESTAMPTZ, BIGINT, BOOLEAN, TEXT, INTEGER, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.open_billing_cycle(UUID, TIMESTAMPTZ, BIGINT, BOOLEAN, TEXT, INTEGER, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.open_billing_cycle(UUID, TIMESTAMPTZ, BIGINT, BOOLEAN, TEXT, INTEGER, TEXT) TO service_role;
