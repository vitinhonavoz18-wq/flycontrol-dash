-- Pedido cancelado e depois restaurado precisa voltar a contar.
--
-- O PROBLEMA, EM LINGUAGEM DE RESTAURANTE
--
-- O caderno de consumo anota uma linha por pedido, com uma etiqueta única
-- formada por "ciclo + pedido". A etiqueta única existe para o mesmo pedido
-- nunca ser cobrado duas vezes: se o aviso chegar repetido, a caneta trava.
--
-- Só que ela travava demais. Quando um pedido era cancelado, o sistema
-- lançava um estorno ao lado (a linha original nunca é apagada, para dar para
-- conferir depois). Se o pedido voltasse — cancelamento por engano, ou o
-- gerente arrastando o cartão para trás e para a frente no quadro de pedidos —
-- o sistema tentava anotar de novo com a MESMA etiqueta, a caneta travava, e
-- o pedido ficava para sempre estornado.
--
-- Resultado prático: o pedido voltou para a operação, foi preparado, foi
-- entregue, o cliente pagou — e o restaurante não era cobrado por ele. A
-- contagem da tela e a da fatura ficavam menores do que a realidade.
--
-- Com as faixas do CENTS isso ficou pior: como o preço depende de quantos
-- pedidos já foram feitos no mês, um pedido perdido pode atrasar a chegada da
-- tarifa mais barata para todos os pedidos seguintes.
--
-- A CORREÇÃO
--
-- A etiqueta passa a levar também quantas idas e voltas aquele pedido já
-- teve. É como o talão de comanda: a primeira via é "mesa 5", a segunda via
-- do mesmo pedido reaberto é "mesa 5 - 2ª via". Uma não anula a outra, e
-- mandar a mesma via duas vezes continua travando.
--
--   1ª cobrança  ->  order_billable:<ciclo>:<pedido>
--   1º estorno   ->  order_reversal:<ciclo>:<pedido>
--   2ª cobrança  ->  order_billable:<ciclo>:<pedido>:1
--   2º estorno   ->  order_reversal:<ciclo>:<pedido>:1
--   3ª cobrança  ->  order_billable:<ciclo>:<pedido>:2
--
-- As duas primeiras etiquetas continuam exatamente com o formato de antes, de
-- propósito: tudo que já está gravado segue valendo, e nada precisa ser
-- reescrito.
--
-- E a proteção contra cobrança dobrada continua inteira. Dois avisos do mesmo
-- pedido, no mesmo estado, calculam a mesma etiqueta — e a segunda trava,
-- como antes.
--
-- SEGURANÇA EXTRA
--
-- Além da etiqueta, agora o gatilho confere o saldo daquele pedido no caderno
-- antes de escrever: só cobra se o saldo estiver zerado, e só estorna se o
-- saldo estiver em um. Assim, mesmo que dois avisos cheguem no mesmo instante,
-- nenhum pedido é cobrado duas vezes nem estornado duas vezes.

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
  v_reversals INTEGER;
  v_saldo INTEGER;
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

  -- Quantas idas e voltas este pedido já teve neste ciclo, e qual o saldo
  -- dele hoje (1 = está cobrado, 0 = não está).
  SELECT
    COUNT(*) FILTER (WHERE event_type = 'order_reversal'),
    COALESCE(SUM(quantity), 0)
  INTO v_reversals, v_saldo
  FROM public.usage_events
  WHERE billing_cycle_id = v_cycle.id
    AND order_id = NEW.id
    AND event_type IN ('order_billable', 'order_reversal');

  IF v_is_billable THEN
    -- Já está cobrado: não cobra de novo. Vale para o aviso repetido e para
    -- dois avisos que cheguem no mesmo instante.
    IF v_saldo > 0 THEN
      RETURN NEW;
    END IF;

    -- A primeira cobrança mantém o formato antigo de etiqueta.
    v_key := 'order_billable:' || v_cycle.id || ':' || NEW.id;
    IF v_reversals > 0 THEN
      v_key := v_key || ':' || v_reversals;
    END IF;

    INSERT INTO public.usage_events (
      company_id, subscription_id, billing_cycle_id, order_id,
      event_type, quantity, unit_price_cents, idempotency_key, metadata
    ) VALUES (
      NEW.tenant_id, v_sub.id, v_cycle.id, NEW.id,
      'order_billable', 1, v_cycle.unit_price_cents, v_key,
      jsonb_build_object('status', NEW.status, 'source', NEW.source, 'retomada', v_reversals)
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
    --
    -- Só estorna o que está cobrado NESTE ciclo. Ciclo fechado não é alterado,
    -- e pedido que nunca chegou a contar não gera estorno.
    IF v_saldo > 0 THEN
      v_key := 'order_reversal:' || v_cycle.id || ':' || NEW.id;
      IF v_reversals > 0 THEN
        v_key := v_key || ':' || v_reversals;
      END IF;

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

COMMENT ON FUNCTION public.record_order_usage() IS
  'Anota o consumo de cada pedido faturável no ciclo aberto. Etiqueta única por ida e volta do pedido: cobra uma vez, estorna quando cancela e volta a cobrar quando o pedido é restaurado.';
