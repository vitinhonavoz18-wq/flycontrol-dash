-- CENTS Fase 2: Motor Financeiro / Ciclos
-- "Pedido concluído" = orders.status = 'entregue' (único status terminal de sucesso
-- observado em produção; 'cancelado' e 'deleted' são explicitamente excluídos).
-- Faturamento/cobrança real (faturado/pago) não existe ainda neste sistema — os
-- estados de ciclo cobrem essa possibilidade futura no CHECK constraint, mas o
-- motor aqui implementado só transiciona ativo → fechado → (novo) ativo.

-- ============================================================
-- Resolve ou cria o ciclo ativo de uma empresa
-- ============================================================
CREATE OR REPLACE FUNCTION public.club_get_or_create_active_cycle(
  p_company_id UUID,
  p_club_id UUID DEFAULT '00000000-0000-0000-0000-0000000000c1'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cycle_id UUID;
  v_settings RECORD;
  v_last_cycle RECORD;
  v_started_at TIMESTAMPTZ;
  v_next_number INT;
  v_price NUMERIC;
BEGIN
  SELECT id INTO v_cycle_id FROM public.club_cycles
  WHERE company_id = p_company_id AND club_id = p_club_id AND status = 'ativo'
  LIMIT 1;
  IF v_cycle_id IS NOT NULL THEN RETURN v_cycle_id; END IF;

  SELECT * INTO v_settings FROM public.club_settings WHERE club_id = p_club_id;

  SELECT * INTO v_last_cycle FROM public.club_cycles
  WHERE company_id = p_company_id AND club_id = p_club_id
  ORDER BY cycle_number DESC LIMIT 1;

  IF v_last_cycle IS NULL THEN
    v_started_at := now();
    v_next_number := 1;
    v_price := v_settings.default_price_per_order;
  ELSE
    v_started_at := v_last_cycle.ends_at;
    v_next_number := v_last_cycle.cycle_number + 1;
    v_price := COALESCE(v_last_cycle.next_cycle_price, v_settings.default_price_per_order);
  END IF;

  INSERT INTO public.club_cycles (company_id, club_id, cycle_number, started_at, ends_at, goal, price_per_order, status)
  VALUES (p_company_id, p_club_id, v_next_number, v_started_at, v_started_at + interval '1 month', v_settings.goal_orders, v_price, 'ativo')
  RETURNING id INTO v_cycle_id;

  INSERT INTO public.club_customer_status (company_id, club_id, current_cycle, current_price, next_cycle_price)
  VALUES (p_company_id, p_club_id, v_next_number, v_price, v_price)
  ON CONFLICT (company_id, club_id) DO UPDATE
    SET current_cycle = v_next_number, current_price = v_price, goal_reached = false, goal_date = NULL, updated_at = now();

  INSERT INTO public.club_history (company_id, cycle_id, event_type, title, description)
  VALUES (p_company_id, v_cycle_id, 'cycle_started', 'Novo ciclo iniciado', format('Ciclo %s iniciado com preço R$%s por pedido.', v_next_number, v_price));

  RETURN v_cycle_id;
END;
$$;

-- ============================================================
-- Resolve o preço vigente (prioridade: Campanha > Voucher > Benefício Ouro > Padrão)
-- ============================================================
CREATE OR REPLACE FUNCTION public.club_resolve_price(
  p_company_id UUID,
  p_club_id UUID DEFAULT '00000000-0000-0000-0000-0000000000c1'
) RETURNS TABLE(price NUMERIC, source TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_settings RECORD;
  v_campaign_price NUMERIC;
  v_has_voucher BOOLEAN;
  v_status RECORD;
BEGIN
  SELECT * INTO v_settings FROM public.club_settings WHERE club_id = p_club_id;

  SELECT (reward->>'price_per_order')::numeric INTO v_campaign_price
  FROM public.club_campaigns
  WHERE status = 'active'
    AND (start_date IS NULL OR start_date <= now())
    AND (end_date IS NULL OR end_date >= now())
    AND reward ? 'price_per_order'
  ORDER BY start_date DESC NULLS LAST
  LIMIT 1;
  IF v_campaign_price IS NOT NULL THEN
    RETURN QUERY SELECT v_campaign_price, 'campaign'::text;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.club_vouchers
    WHERE company_id = p_company_id AND status = 'active' AND (expires_at IS NULL OR expires_at > now())
  ) INTO v_has_voucher;
  IF v_has_voucher THEN
    RETURN QUERY SELECT 0::numeric, 'voucher'::text;
    RETURN;
  END IF;

  SELECT * INTO v_status FROM public.club_customer_status WHERE company_id = p_company_id AND club_id = p_club_id;
  IF v_status IS NOT NULL AND v_status.goal_reached THEN
    RETURN QUERY SELECT COALESCE(v_settings.gold_price_per_order, v_settings.default_price_per_order), 'gold_benefit'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_settings.default_price_per_order, 'standard'::text;
END;
$$;

-- ============================================================
-- Contabiliza pedido concluído no ciclo ativo + notificações de marco
-- ============================================================
CREATE OR REPLACE FUNCTION public.club_on_order_delivered()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cycle_id UUID;
  v_cycle RECORD;
  v_settings RECORD;
  v_pct NUMERIC;
  v_remaining INT;
BEGIN
  IF NEW.status IS DISTINCT FROM 'entregue' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'entregue' THEN RETURN NEW; END IF;
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;

  v_cycle_id := public.club_get_or_create_active_cycle(NEW.tenant_id);
  SELECT * INTO v_cycle FROM public.club_cycles WHERE id = v_cycle_id;
  SELECT * INTO v_settings FROM public.club_settings WHERE club_id = v_cycle.club_id;

  UPDATE public.club_cycles
  SET orders = orders + 1,
      estimated_amount = (orders + 1) * price_per_order
  WHERE id = v_cycle_id
  RETURNING * INTO v_cycle;

  IF NOT v_cycle.goal_reached AND v_cycle.orders >= v_cycle.goal THEN
    UPDATE public.club_cycles
    SET goal_reached = true, next_cycle_price = v_settings.gold_price_per_order
    WHERE id = v_cycle_id;

    UPDATE public.club_customer_status
    SET goal_reached = true, goal_date = now(), next_cycle_price = v_settings.gold_price_per_order, updated_at = now()
    WHERE company_id = NEW.tenant_id AND club_id = v_cycle.club_id;

    INSERT INTO public.club_history (company_id, cycle_id, event_type, title, description)
    VALUES (NEW.tenant_id, v_cycle_id, 'goal_reached', 'Meta do ciclo atingida', 'Benefício Ouro desbloqueado para o próximo ciclo.');

    INSERT INTO public.club_notifications (company_id, notification_type, title, message)
    VALUES (NEW.tenant_id, 'goal_reached', '🥇 Meta concluída!', 'Você conquistou o Benefício Ouro do Clube CENTS para o próximo ciclo.');
  ELSE
    v_pct := v_cycle.orders::numeric / NULLIF(v_cycle.goal, 0);
    v_remaining := v_cycle.goal - v_cycle.orders;

    IF v_cycle.orders = GREATEST(ROUND(v_cycle.goal * 0.25), 1) THEN
      INSERT INTO public.club_notifications (company_id, notification_type, title, message)
      VALUES (NEW.tenant_id, 'progress_25', '25% da meta', 'Você começou muito bem. 25% da meta do ciclo concluída.');
    ELSIF v_cycle.orders = ROUND(v_cycle.goal * 0.50) THEN
      INSERT INTO public.club_notifications (company_id, notification_type, title, message)
      VALUES (NEW.tenant_id, 'progress_50', '50% da meta', 'Metade da meta concluída. Continue assim.');
    ELSIF v_cycle.orders = ROUND(v_cycle.goal * 0.75) THEN
      INSERT INTO public.club_notifications (company_id, notification_type, title, message)
      VALUES (NEW.tenant_id, 'progress_75', '75% da meta', 'Agora falta pouco.');
    ELSIF v_remaining = 100 THEN
      INSERT INTO public.club_notifications (company_id, notification_type, title, message)
      VALUES (NEW.tenant_id, 'progress_100_left', '100 pedidos restantes', 'Faltam apenas 100 pedidos para o Benefício Ouro. Você consegue.');
    ELSIF v_remaining = 50 THEN
      INSERT INTO public.club_notifications (company_id, notification_type, title, message)
      VALUES (NEW.tenant_id, 'progress_50_left', '50 pedidos restantes', 'Quase lá. Faltam apenas 50 pedidos.');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_club_on_order_delivered
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.club_on_order_delivered();

-- ============================================================
-- Fechamento de ciclo: congela, gera snapshot, calcula streak, abre o próximo
-- ============================================================
CREATE OR REPLACE FUNCTION public.club_close_cycle(p_cycle_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cycle RECORD;
  v_settings RECORD;
  v_next_price NUMERIC;
  v_new_streak INT;
BEGIN
  SELECT * INTO v_cycle FROM public.club_cycles WHERE id = p_cycle_id AND status = 'ativo';
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_settings FROM public.club_settings WHERE club_id = v_cycle.club_id;

  UPDATE public.club_cycles
  SET status = 'fechado', final_amount = orders * price_per_order, closed_at = now()
  WHERE id = p_cycle_id;

  IF v_cycle.goal_reached THEN
    UPDATE public.club_customer_status
    SET current_streak = current_streak + 1
    WHERE company_id = v_cycle.company_id AND club_id = v_cycle.club_id
    RETURNING current_streak INTO v_new_streak;
    v_next_price := v_settings.gold_price_per_order;
  ELSE
    UPDATE public.club_customer_status
    SET current_streak = 0, goal_reached = false, goal_date = NULL
    WHERE company_id = v_cycle.company_id AND club_id = v_cycle.club_id;
    v_new_streak := 0;
    v_next_price := v_settings.default_price_per_order;
  END IF;

  INSERT INTO public.club_history (company_id, cycle_id, event_type, title, description, payload_json)
  VALUES (
    v_cycle.company_id, p_cycle_id, 'cycle_closed', 'Ciclo encerrado',
    format('Ciclo %s encerrado com %s pedidos.', v_cycle.cycle_number, v_cycle.orders),
    jsonb_build_object('orders', v_cycle.orders, 'goal', v_cycle.goal, 'goal_reached', v_cycle.goal_reached, 'final_amount', v_cycle.orders * v_cycle.price_per_order)
  );

  INSERT INTO public.club_notifications (company_id, notification_type, title, message)
  VALUES (v_cycle.company_id, 'cycle_closed', 'Ciclo encerrado', format('Seu ciclo foi encerrado com %s pedidos.', v_cycle.orders));

  INSERT INTO public.club_rankings (company_id, cycle, orders, level, streak, score)
  SELECT v_cycle.company_id, v_cycle.cycle_number, v_cycle.orders, current_level, v_new_streak, v_cycle.orders::numeric
  FROM public.club_customer_status WHERE company_id = v_cycle.company_id AND club_id = v_cycle.club_id;

  PERFORM public.club_get_or_create_active_cycle(v_cycle.company_id, v_cycle.club_id);

  UPDATE public.club_cycles SET price_per_order = v_next_price
  WHERE company_id = v_cycle.company_id AND club_id = v_cycle.club_id AND status = 'ativo' AND cycle_number = v_cycle.cycle_number + 1;

  UPDATE public.club_customer_status SET current_price = v_next_price
  WHERE company_id = v_cycle.company_id AND club_id = v_cycle.club_id;

  IF v_cycle.goal_reached AND v_new_streak >= v_settings.legend_streak_required THEN
    UPDATE public.club_customer_status
    SET legend = true, hall_of_fame = true
    WHERE company_id = v_cycle.company_id AND club_id = v_cycle.club_id AND NOT legend;

    IF FOUND THEN
      INSERT INTO public.club_vouchers (company_id, voucher_type, months, status, expires_at)
      VALUES (v_cycle.company_id, 'fidelidade', v_settings.voucher_months, 'issued', now() + (v_settings.voucher_months || ' months')::interval);

      INSERT INTO public.club_history (company_id, cycle_id, event_type, title, description)
      VALUES (v_cycle.company_id, p_cycle_id, 'legend_achieved', '👑 LENDA CENTS', 'A empresa entrou para a história do FlyControl como LENDA CENTS.');

      INSERT INTO public.club_notifications (company_id, notification_type, title, message)
      VALUES (v_cycle.company_id, 'legend', '👑 LENDA CENTS', 'Você conquistou o título vitalício de LENDA CENTS e recebeu um Voucher de Fidelidade.');
    END IF;
  END IF;
END;
$$;

-- ============================================================
-- Fecha todos os ciclos vencidos (chamada pelo cron / Edge Function close-cycle)
-- ============================================================
CREATE OR REPLACE FUNCTION public.club_close_due_cycles()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row RECORD;
  v_count INT := 0;
BEGIN
  FOR v_row IN SELECT id FROM public.club_cycles WHERE status = 'ativo' AND ends_at <= now() LOOP
    PERFORM public.club_close_cycle(v_row.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ============================================================
-- Cron Job diário (03:00 UTC): fecha ciclos vencidos automaticamente
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'club-close-due-cycles') THEN
    PERFORM cron.schedule('club-close-due-cycles', '0 3 * * *', $cron$SELECT public.club_close_due_cycles();$cron$);
  END IF;
END;
$$;
