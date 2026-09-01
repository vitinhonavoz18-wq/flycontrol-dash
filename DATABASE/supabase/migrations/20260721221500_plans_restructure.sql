-- Reestruturação do módulo de Planos: separa "tipo de plano" (plan_type) de
-- "modelo de cobrança" (billing_model). Mantém as colunas legadas
-- (subscription_plan/status/expires_at/price) intactas por compatibilidade —
-- nenhum leitor existente delas é alterado por esta migration.

ALTER TABLE public.pizzerias
  ADD COLUMN plan_type TEXT NOT NULL DEFAULT 'premium' CHECK (plan_type IN ('premium', 'cents')),
  ADD COLUMN billing_model TEXT NOT NULL DEFAULT 'fixed' CHECK (billing_model IN ('fixed', 'per_order'));

-- Trava a combinação válida hoje. Quando surgir um novo plan_type (Enterprise,
-- White Label etc.) com seu próprio billing_model, esta constraint é
-- substituída por uma tabela de mapeamento em vez de lógica espalhada no app.
ALTER TABLE public.pizzerias
  ADD CONSTRAINT pizzerias_plan_billing_pair_check CHECK (
    (plan_type = 'premium' AND billing_model = 'fixed') OR
    (plan_type = 'cents' AND billing_model = 'per_order')
  );

-- ============================================================
-- Matrícula imediata no Clube CENTS (reaproveita o motor financeiro já
-- existente: club_get_or_create_active_cycle + club_recalculate_level).
-- Idempotente — seguro chamar de novo para uma empresa já matriculada.
-- ============================================================
CREATE OR REPLACE FUNCTION public.enroll_company_in_cents(
  p_company_id UUID,
  p_club_id UUID DEFAULT '00000000-0000-0000-0000-0000000000c1'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.club_get_or_create_active_cycle(p_company_id, p_club_id);
  PERFORM public.club_recalculate_level(p_company_id, p_club_id);
END;
$$;

-- ============================================================
-- Migração dos dados existentes (mapeamento confirmado contra os valores
-- reais em produção: apenas 'free', 'starter', 'test' existem hoje).
-- ============================================================
UPDATE public.pizzerias
SET plan_type = 'premium', billing_model = 'fixed', subscription_price = 375.00
WHERE subscription_plan IN ('starter', 'test');

UPDATE public.pizzerias
SET plan_type = 'cents', billing_model = 'per_order'
WHERE subscription_plan = 'free';

-- Matricula no clube toda empresa que virou CENTS e ainda não tinha registro
-- (a que já tinha, via trigger lazy de pedido entregue, só recebe idempotente).
DO $$
DECLARE
  v_row RECORD;
BEGIN
  FOR v_row IN SELECT id FROM public.pizzerias WHERE plan_type = 'cents' LOOP
    PERFORM public.enroll_company_in_cents(v_row.id);
  END LOOP;
END;
$$;
