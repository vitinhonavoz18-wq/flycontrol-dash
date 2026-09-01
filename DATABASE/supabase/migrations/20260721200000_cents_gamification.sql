-- CENTS Fase 3: Gamificação básica
-- Níveis (Bronze/Prata/Ouro), conquistas com raridade, badges e Desafio dos 7 Dias.

-- ============================================================
-- Contador vitalício de pedidos (necessário para conquistas como "1000 Pedidos")
-- ============================================================
ALTER TABLE public.club_customer_status
  ADD COLUMN IF NOT EXISTS lifetime_orders INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gold_cycles_total INT NOT NULL DEFAULT 0;

-- ============================================================
-- club_achievements: catálogo de conquistas (Volume 5 + checklist do Volume 10)
-- ============================================================
CREATE TABLE public.club_achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  rarity TEXT NOT NULL DEFAULT 'comum' CHECK (rarity IN ('comum', 'incomum', 'rara', 'epica', 'lendaria', 'mitica')),
  criteria_type TEXT NOT NULL CHECK (criteria_type IN (
    'first_order', 'lifetime_orders', 'goal_reached_count', 'streak_count', 'legend'
  )),
  criteria_value INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, slug)
);

-- ============================================================
-- club_customer_achievements: conquistas desbloqueadas por empresa (permanentes, nunca perdidas)
-- ============================================================
CREATE TABLE public.club_customer_achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.club_achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, achievement_id)
);

CREATE INDEX idx_club_customer_achievements_company ON public.club_customer_achievements(company_id);

ALTER TABLE public.club_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_customer_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "club_achievements_select_authenticated" ON public.club_achievements FOR SELECT TO authenticated USING (true);
CREATE POLICY "club_achievements_admin_all" ON public.club_achievements FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "club_customer_achievements_owner_select" ON public.club_customer_achievements FOR SELECT USING (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.pizzerias p WHERE p.id = company_id AND p.owner_id = auth.uid())
);
CREATE POLICY "club_customer_achievements_admin_write" ON public.club_customer_achievements FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- Seed: conquistas oficiais do Volume 5
-- ============================================================
INSERT INTO public.club_achievements (club_id, slug, name, description, icon, rarity, criteria_type, criteria_value) VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'primeiro-pedido', 'Primeiro Pedido', 'Você recebeu seu primeiro pedido pelo FlyControl.', '🎉', 'comum', 'first_order', 1),
  ('00000000-0000-0000-0000-0000000000c1', '100-pedidos', 'Primeiros 100 Pedidos', 'Sua empresa alcançou 100 pedidos.', '💯', 'incomum', 'lifetime_orders', 100),
  ('00000000-0000-0000-0000-0000000000c1', '500-pedidos', '500 Pedidos', 'Sua empresa alcançou 500 pedidos.', '🚀', 'rara', 'lifetime_orders', 500),
  ('00000000-0000-0000-0000-0000000000c1', '1000-pedidos', '1000 Pedidos', 'Sua empresa alcançou 1.000 pedidos.', '🏅', 'rara', 'lifetime_orders', 1000),
  ('00000000-0000-0000-0000-0000000000c1', '10000-pedidos', '10000 Pedidos', 'Sua empresa alcançou 10.000 pedidos.', '🏆', 'epica', 'lifetime_orders', 10000),
  ('00000000-0000-0000-0000-0000000000c1', '50000-pedidos', '50000 Pedidos', 'Sua empresa alcançou 50.000 pedidos.', '🌟', 'lendaria', 'lifetime_orders', 50000),
  ('00000000-0000-0000-0000-0000000000c1', '100000-pedidos', '100000 Pedidos', 'Sua empresa alcançou 100.000 pedidos.', '💎', 'mitica', 'lifetime_orders', 100000),
  ('00000000-0000-0000-0000-0000000000c1', 'primeira-meta', 'Primeira Meta', 'Você atingiu sua primeira meta de ciclo.', '🎯', 'comum', 'goal_reached_count', 1),
  ('00000000-0000-0000-0000-0000000000c1', 'primeiro-benefico-ouro', 'Primeiro Benefício Ouro', 'Você conquistou seu primeiro Benefício Ouro.', '🥇', 'incomum', 'goal_reached_count', 1),
  ('00000000-0000-0000-0000-0000000000c1', 'primeira-sequencia-ouro', 'Primeira Sequência Ouro', 'Você atingiu a meta em 2 ciclos consecutivos.', '🔥', 'incomum', 'streak_count', 2),
  ('00000000-0000-0000-0000-0000000000c1', '3-sequencias-ouro', '3 Sequências Ouro', 'Consistência de 3 ciclos consecutivos.', '🔥🔥', 'rara', 'streak_count', 3),
  ('00000000-0000-0000-0000-0000000000c1', '6-sequencias-ouro', '6 Sequências Ouro', 'Você está construindo uma história.', '🔥🔥🔥', 'epica', 'streak_count', 6),
  ('00000000-0000-0000-0000-0000000000c1', '12-sequencias-ouro', '12 Sequências Ouro', 'Falta muito pouco para entrar na história.', '🔥🔥🔥🔥', 'lendaria', 'streak_count', 12),
  ('00000000-0000-0000-0000-0000000000c1', 'lenda-cents', 'LENDA CENTS', 'Você entrou para a história do FlyControl.', '👑', 'mitica', 'legend', 1)
ON CONFLICT (club_id, slug) DO NOTHING;

-- ============================================================
-- Recalcula o nível (Bronze/Prata/Ouro) de acordo com os pedidos do ciclo ativo
-- ============================================================
CREATE OR REPLACE FUNCTION public.club_recalculate_level(p_company_id UUID, p_club_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_orders INT;
  v_level_id UUID;
BEGIN
  SELECT orders INTO v_orders FROM public.club_cycles
  WHERE company_id = p_company_id AND club_id = p_club_id AND status = 'ativo';

  IF v_orders IS NULL THEN RETURN; END IF;

  SELECT id INTO v_level_id FROM public.club_levels
  WHERE club_id = p_club_id AND status = 'active'
    AND minimum_orders <= v_orders
    AND (maximum_orders IS NULL OR maximum_orders >= v_orders)
  ORDER BY priority DESC
  LIMIT 1;

  IF v_level_id IS NOT NULL THEN
    UPDATE public.club_customer_status
    SET current_level = v_level_id, updated_at = now()
    WHERE company_id = p_company_id AND club_id = p_club_id AND current_level IS DISTINCT FROM v_level_id;
  END IF;
END;
$$;

-- ============================================================
-- Verifica e desbloqueia conquistas elegíveis (idempotente: ON CONFLICT DO NOTHING)
-- ============================================================
CREATE OR REPLACE FUNCTION public.club_check_achievements(p_company_id UUID, p_club_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status RECORD;
  v_achievement RECORD;
  v_eligible BOOLEAN;
BEGIN
  SELECT * INTO v_status FROM public.club_customer_status WHERE company_id = p_company_id AND club_id = p_club_id;
  IF v_status IS NULL THEN RETURN; END IF;

  FOR v_achievement IN
    SELECT a.* FROM public.club_achievements a
    WHERE a.club_id = p_club_id AND a.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.club_customer_achievements ca
        WHERE ca.company_id = p_company_id AND ca.achievement_id = a.id
      )
  LOOP
    v_eligible := CASE v_achievement.criteria_type
      WHEN 'first_order' THEN v_status.lifetime_orders >= 1
      WHEN 'lifetime_orders' THEN v_status.lifetime_orders >= v_achievement.criteria_value
      WHEN 'goal_reached_count' THEN v_status.gold_cycles_total >= v_achievement.criteria_value
      WHEN 'streak_count' THEN v_status.current_streak >= v_achievement.criteria_value
      WHEN 'legend' THEN v_status.legend
      ELSE false
    END;

    IF v_eligible THEN
      INSERT INTO public.club_customer_achievements (company_id, achievement_id)
      VALUES (p_company_id, v_achievement.id)
      ON CONFLICT (company_id, achievement_id) DO NOTHING;

      INSERT INTO public.club_history (company_id, event_type, title, description)
      VALUES (p_company_id, 'achievement_unlocked', v_achievement.name, v_achievement.description);

      INSERT INTO public.club_notifications (company_id, notification_type, title, message)
      VALUES (p_company_id, 'achievement_unlocked', format('%s %s', v_achievement.icon, v_achievement.name), COALESCE(v_achievement.description, ''));
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- Desafio dos 7 Dias: verdadeiro quando faltam poucos dias, meta não batida
-- e ainda é matematicamente possível bater (ritmo médio necessário cabe nos dias restantes)
-- ============================================================
CREATE OR REPLACE FUNCTION public.club_is_challenge_active(p_cycle_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_cycle RECORD;
  v_settings RECORD;
  v_days_left NUMERIC;
BEGIN
  SELECT * INTO v_cycle FROM public.club_cycles WHERE id = p_cycle_id;
  IF v_cycle IS NULL OR v_cycle.status != 'ativo' OR v_cycle.goal_reached THEN RETURN false; END IF;

  SELECT * INTO v_settings FROM public.club_settings WHERE club_id = v_cycle.club_id;
  v_days_left := EXTRACT(EPOCH FROM (v_cycle.ends_at - now())) / 86400.0;

  IF v_days_left < 0 OR v_days_left > v_settings.challenge_days THEN RETURN false; END IF;

  -- ainda matematicamente possível: pedidos restantes cabem em pelo menos 1 pedido/dia
  RETURN (v_cycle.goal - v_cycle.orders) <= GREATEST(v_days_left, 0.1) * 1000; -- sem limite realista de pedidos/dia; só garante dias > 0
END;
$$;

-- ============================================================
-- Estende o trigger de pedido entregue: contador vitalício + nível + conquistas
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

  UPDATE public.club_customer_status
  SET lifetime_orders = lifetime_orders + 1, updated_at = now()
  WHERE company_id = NEW.tenant_id AND club_id = v_cycle.club_id;

  IF NOT v_cycle.goal_reached AND v_cycle.orders >= v_cycle.goal THEN
    UPDATE public.club_cycles
    SET goal_reached = true, next_cycle_price = v_settings.gold_price_per_order
    WHERE id = v_cycle_id;

    UPDATE public.club_customer_status
    SET goal_reached = true, goal_date = now(), next_cycle_price = v_settings.gold_price_per_order,
        gold_cycles_total = gold_cycles_total + 1, updated_at = now()
    WHERE company_id = NEW.tenant_id AND club_id = v_cycle.club_id;

    INSERT INTO public.club_history (company_id, cycle_id, event_type, title, description)
    VALUES (NEW.tenant_id, v_cycle_id, 'goal_reached', 'Meta do ciclo atingida', 'Benefício Ouro desbloqueado para o próximo ciclo.');

    INSERT INTO public.club_notifications (company_id, notification_type, title, message)
    VALUES (NEW.tenant_id, 'goal_reached', '🥇 Meta concluída!', 'Você conquistou o Benefício Ouro do Clube CENTS para o próximo ciclo.');
  ELSE
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

  PERFORM public.club_recalculate_level(NEW.tenant_id, v_cycle.club_id);
  PERFORM public.club_check_achievements(NEW.tenant_id, v_cycle.club_id);

  RETURN NEW;
END;
$$;

-- ============================================================
-- Também verifica conquistas de streak/legend no fechamento de ciclo
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

  PERFORM public.club_check_achievements(v_cycle.company_id, v_cycle.club_id);
END;
$$;
