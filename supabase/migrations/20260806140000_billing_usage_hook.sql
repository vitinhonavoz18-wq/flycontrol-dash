-- Gancho que liga o fluxo de pedidos ao motor de cobrança.
--
-- Por que trigger no banco, e não código no frontend:
--
--   1. Um pedido vira faturável por vários caminhos — arraste no Kanban,
--      POST /api/orders vindo do SiteCreatorFly, portal do garçom,
--      sync-table-sessions. Um gancho na interface cobriria só o primeiro.
--   2. O cliente não tem policy de escrita em usage_events, de propósito.
--      Registrar consumo pelo navegador seria confiar no navegador para
--      dizer quanto ele mesmo deve.
--   3. O trigger roda com os privilégios do dono da tabela, então enxerga o
--      que o RLS esconde do cliente, sem abrir nada para ele.
--
-- Regra de ouro: um problema de cobrança NUNCA pode impedir o restaurante de
-- operar. Toda falha aqui é capturada e vira aviso — o UPDATE do pedido
-- segue adiante de qualquer jeito.

-- ---------------------------------------------------------------------------
-- Espelho SQL da definição de pedido faturável
-- ---------------------------------------------------------------------------

-- Esta lista precisa continuar idêntica a BILLABLE_STATUSES em
-- src/lib/billing/billingEngine.ts. Há um teste (billingHook.test.ts) que lê
-- este arquivo e compara os dois conjuntos, para que uma divergência quebre a
-- suíte em vez de cobrar errado em silêncio.
--
-- `novo` fica de fora: um pedido recém-chegado ainda pode ser recusado.
-- A contagem começa quando o estabelecimento aceita, em `preparando`.
CREATE OR REPLACE FUNCTION public.is_billable_order_status(p_status TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(coalesce(trim(p_status), '')) IN (
    'preparando', 'saiu', 'saiu_entrega', 'pronto', 'entregue', 'concluido',
    'ready', 'delivered', 'completed'
  );
$$;

COMMENT ON FUNCTION public.is_billable_order_status(TEXT) IS
  'Espelho de BILLABLE_STATUSES em src/lib/billing/billingEngine.ts. Alterar os dois juntos.';

-- Pedido-fantasma: o SiteCreatorFly cria um registro vazio ao abrir uma
-- sessão de mesa. Total zero, sem itens e sem cliente identificado não é
-- operação e não gera cobrança.
CREATE OR REPLACE FUNCTION public.is_ghost_order(
  p_total NUMERIC, p_items JSONB, p_customer_name TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_total, 0) = 0
     AND coalesce(jsonb_array_length(
           CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
         ), 0) = 0
     AND coalesce(nullif(trim(coalesce(p_customer_name, '')), 'Cliente Site'), '') = '';
$$;

-- ---------------------------------------------------------------------------
-- Abertura de ciclo
-- ---------------------------------------------------------------------------

-- Cria o ciclo inicial de uma assinatura, ancorado na data de ativação.
-- Idempotente: se já existe ciclo aberto, devolve o que existe.
CREATE OR REPLACE FUNCTION public.open_billing_cycle(
  p_subscription_id UUID,
  p_cycle_start TIMESTAMPTZ DEFAULT now(),
  p_unit_price_cents BIGINT DEFAULT NULL,
  p_qualified_from_previous BOOLEAN DEFAULT false
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
    RAISE EXCEPTION 'Assinatura % não encontrada', p_subscription_id;
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

  -- Fim do ciclo = instante anterior ao início do próximo. Quando o dia
  -- âncora não existe no mês seguinte (31 caindo em fevereiro), o próximo
  -- ciclo começa no dia 1º do mês subsequente, para nenhum dia ficar sem
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

  INSERT INTO public.billing_cycles (
    subscription_id, company_id, cycle_start, cycle_end, status,
    unit_price_cents, promotion_threshold_orders, qualified_from_previous_cycle
  ) VALUES (
    p_subscription_id, v_sub.company_id, v_start, v_end, 'open',
    coalesce(p_unit_price_cents, v_price.default_order_unit_price_cents),
    v_price.promotion_threshold_orders,
    p_qualified_from_previous
  )
  RETURNING id INTO v_cycle_id;

  UPDATE public.subscriptions
  SET current_cycle_id = v_cycle_id, updated_at = now()
  WHERE id = p_subscription_id;

  RETURN v_cycle_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Registro de consumo
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

  -- Nada mudou em termos de cobrança: sai cedo, sem tocar em nada.
  IF v_is_billable = v_was_billable THEN
    RETURN NEW;
  END IF;

  -- Só planos por uso geram consumo. PREMIUM conta pedido como métrica, mas
  -- não como faturamento.
  SELECT s.* INTO v_sub
  FROM public.subscriptions s
  WHERE s.company_id = NEW.tenant_id
    AND s.status IN ('active', 'past_due')
    AND s.billing_model = 'usage_per_order'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_cycle
  FROM public.billing_cycles
  WHERE subscription_id = v_sub.id AND status = 'open'
  LIMIT 1;

  -- Sem ciclo aberto não há onde lançar. Não abrimos um aqui de propósito:
  -- abrir ciclo é decisão de ativação/fechamento, e criar um por efeito
  -- colateral de um pedido geraria ciclos com data de início errada.
  IF NOT FOUND THEN
    RAISE WARNING '[billing] pedido % sem ciclo aberto na assinatura %', NEW.id, v_sub.id;
    RETURN NEW;
  END IF;

  IF v_is_billable THEN
    -- Mesma chave de usageIdempotencyKey() no TypeScript.
    v_key := 'order_billable:' || v_cycle.id || ':' || NEW.id;

    INSERT INTO public.usage_events (
      company_id, subscription_id, billing_cycle_id, order_id,
      event_type, quantity, unit_price_cents, idempotency_key, metadata
    ) VALUES (
      NEW.tenant_id, v_sub.id, v_cycle.id, NEW.id,
      'order_billable', 1, v_cycle.unit_price_cents, v_key,
      jsonb_build_object('status', NEW.status, 'source', NEW.source)
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    -- O contador só anda quando o evento foi realmente inserido. Em conflito
    -- (mesmo pedido reprocessado) nada muda — é aqui que a idempotência vira
    -- garantia de não cobrar duas vezes.
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted > 0 THEN
      UPDATE public.billing_cycles
      SET billable_order_count = billable_order_count + 1, updated_at = now()
      WHERE id = v_cycle.id;
    END IF;

  ELSE
    -- Deixou de ser faturável (cancelado, excluído, devolvido para "novo").
    -- O evento original não é apagado: lançamos um estorno, para a correção
    -- ficar auditável.
    v_key := 'order_reversal:' || v_cycle.id || ':' || NEW.id;

    -- Só estorna o que foi lançado NESTE ciclo. Ciclo fechado não é alterado.
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
      END IF;
    END IF;
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- A operação do restaurante vale mais que o registro de cobrança. Uma
  -- falha aqui vira aviso no log do Postgres e o pedido segue seu curso; o
  -- consumo perdido é reconciliável a partir de orders + usage_events.
  RAISE WARNING '[billing] falha ao registrar consumo do pedido %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_record_usage ON public.orders;
CREATE TRIGGER trg_orders_record_usage
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.record_order_usage();

COMMENT ON FUNCTION public.record_order_usage() IS
  'Lança consumo faturável quando o pedido entra no fluxo operacional. Nunca falha o UPDATE do pedido.';

-- ---------------------------------------------------------------------------
-- Reconciliação
-- ---------------------------------------------------------------------------

-- Contagem verdadeira de um ciclo, somando eventos em vez de ler o contador.
-- Serve para conferir billable_order_count e para o fechamento não depender
-- de um número que pode ter divergido.
CREATE OR REPLACE FUNCTION public.billing_cycle_true_count(p_cycle_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT GREATEST(coalesce(SUM(quantity), 0), 0)::INTEGER
  FROM public.usage_events
  WHERE billing_cycle_id = p_cycle_id;
$$;
