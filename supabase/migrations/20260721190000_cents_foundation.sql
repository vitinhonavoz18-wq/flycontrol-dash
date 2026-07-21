-- CENTS Fase 1: Fundação de dados
-- Módulo de fidelização/gamificação do FlyControl. "Empresa/Cliente" (company_id)
-- mapeia para public.pizzerias(id), a mesma entidade de tenant já usada no restante do sistema.
-- Nenhuma tabela ou coluna existente do FlyControl é alterada por esta migration.

-- ============================================================
-- clubs: cadastro dos programas (permite múltiplos clubes no futuro)
-- ============================================================
CREATE TABLE public.clubs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================
-- club_benefits: catálogo de benefícios (Benefício Ouro, Voucher, Cashback futuro...)
-- ============================================================
CREATE TABLE public.club_benefits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  benefit_type TEXT NOT NULL CHECK (benefit_type IN ('price_per_order', 'voucher', 'cashback', 'free_months', 'custom')),
  benefit_value NUMERIC,
  activation_rule JSONB,
  expiration_rule JSONB,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- club_levels: Bronze / Prata / Ouro / Lenda (por clube)
-- ============================================================
CREATE TABLE public.club_levels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  priority INT NOT NULL DEFAULT 0,
  minimum_orders INT NOT NULL DEFAULT 0,
  maximum_orders INT,
  benefit_id UUID REFERENCES public.club_benefits(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, slug)
);

-- ============================================================
-- club_settings: configuração global por clube (nunca hardcode)
-- ============================================================
CREATE TABLE public.club_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  default_price_per_order NUMERIC NOT NULL DEFAULT 0.70,
  gold_price_per_order NUMERIC NOT NULL DEFAULT 0.40,
  goal_orders INT NOT NULL DEFAULT 800,
  challenge_days INT NOT NULL DEFAULT 7,
  voucher_months INT NOT NULL DEFAULT 3,
  legend_streak_required INT NOT NULL DEFAULT 12,
  enable_campaign BOOLEAN NOT NULL DEFAULT true,
  enable_notifications BOOLEAN NOT NULL DEFAULT true,
  enable_hall_of_fame BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id)
);

-- ============================================================
-- club_customer_status: situação atual de cada empresa no clube
-- ============================================================
CREATE TABLE public.club_customer_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  current_level UUID REFERENCES public.club_levels(id) ON DELETE SET NULL,
  current_streak INT NOT NULL DEFAULT 0,
  current_cycle INT NOT NULL DEFAULT 0,
  current_price NUMERIC,
  next_cycle_price NUMERIC,
  goal_reached BOOLEAN NOT NULL DEFAULT false,
  goal_date TIMESTAMPTZ,
  hall_of_fame BOOLEAN NOT NULL DEFAULT false,
  legend BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, club_id)
);

-- ============================================================
-- club_cycles: ciclo mensal individual de cada empresa (inicia na data de ativação, não no calendário)
-- ============================================================
CREATE TABLE public.club_cycles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  cycle_number INT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  orders INT NOT NULL DEFAULT 0,
  goal INT NOT NULL,
  goal_reached BOOLEAN NOT NULL DEFAULT false,
  price_per_order NUMERIC NOT NULL,
  next_cycle_price NUMERIC,
  estimated_amount NUMERIC,
  final_amount NUMERIC,
  status TEXT NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado', 'ativo', 'em_fechamento', 'fechado', 'faturado', 'pago', 'arquivado')),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, club_id, cycle_number)
);

-- ============================================================
-- club_history: histórico permanente de eventos (nunca editar/apagar)
-- ============================================================
CREATE TABLE public.club_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  cycle_id UUID REFERENCES public.club_cycles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- club_notifications
-- ============================================================
CREATE TABLE public.club_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  displayed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- club_rankings: snapshots de ranking por ciclo
-- ============================================================
CREATE TABLE public.club_rankings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  cycle INT NOT NULL,
  orders INT NOT NULL DEFAULT 0,
  level UUID REFERENCES public.club_levels(id) ON DELETE SET NULL,
  streak INT NOT NULL DEFAULT 0,
  score NUMERIC NOT NULL DEFAULT 0,
  position INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- club_vouchers: Voucher de Fidelidade (ex: LENDA CENTS)
-- ============================================================
CREATE TABLE public.club_vouchers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  voucher_type TEXT NOT NULL,
  months INT,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'active', 'used', 'expired')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ
);

-- ============================================================
-- club_campaigns
-- ============================================================
CREATE TABLE public.club_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  rule JSONB,
  reward JSONB,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'ended', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- club_audit_logs: auditoria administrativa (nunca editar/apagar)
-- ============================================================
CREATE TABLE public.club_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.pizzerias(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  ip TEXT,
  device TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Índices
-- ============================================================
CREATE INDEX idx_club_customer_status_company ON public.club_customer_status(company_id);
CREATE INDEX idx_club_customer_status_level ON public.club_customer_status(current_level);
CREATE INDEX idx_club_cycles_company ON public.club_cycles(company_id);
CREATE INDEX idx_club_cycles_status ON public.club_cycles(status);
CREATE INDEX idx_club_cycles_goal_reached ON public.club_cycles(goal_reached);
CREATE INDEX idx_club_history_company ON public.club_history(company_id);
CREATE INDEX idx_club_history_created_at ON public.club_history(created_at);
CREATE INDEX idx_club_notifications_company ON public.club_notifications(company_id);
CREATE INDEX idx_club_rankings_company ON public.club_rankings(company_id);
CREATE INDEX idx_club_rankings_cycle ON public.club_rankings(cycle);
CREATE INDEX idx_club_vouchers_company ON public.club_vouchers(company_id);
CREATE INDEX idx_club_audit_logs_company ON public.club_audit_logs(company_id);
CREATE INDEX idx_club_audit_logs_created_at ON public.club_audit_logs(created_at);

-- ============================================================
-- updated_at triggers (reaproveita a função já existente no projeto)
-- ============================================================
CREATE TRIGGER trg_clubs_updated_at BEFORE UPDATE ON public.clubs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_club_benefits_updated_at BEFORE UPDATE ON public.club_benefits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_club_levels_updated_at BEFORE UPDATE ON public.club_levels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_club_customer_status_updated_at BEFORE UPDATE ON public.club_customer_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_club_campaigns_updated_at BEFORE UPDATE ON public.club_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_benefits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_customer_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_audit_logs ENABLE ROW LEVEL SECURITY;

-- Tabelas de catálogo (clubs, levels, benefits, settings, campaigns): leitura pública para
-- empresas autenticadas (precisam ver o que podem conquistar), escrita só para admin.
CREATE POLICY "clubs_select_authenticated" ON public.clubs FOR SELECT TO authenticated USING (true);
CREATE POLICY "clubs_admin_all" ON public.clubs FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "club_benefits_select_authenticated" ON public.club_benefits FOR SELECT TO authenticated USING (true);
CREATE POLICY "club_benefits_admin_all" ON public.club_benefits FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "club_levels_select_authenticated" ON public.club_levels FOR SELECT TO authenticated USING (true);
CREATE POLICY "club_levels_admin_all" ON public.club_levels FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "club_settings_select_authenticated" ON public.club_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "club_settings_admin_all" ON public.club_settings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "club_campaigns_select_authenticated" ON public.club_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "club_campaigns_admin_all" ON public.club_campaigns FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Tabelas por empresa: dono da pizzaria vê só a própria empresa; admin vê tudo.
CREATE POLICY "club_customer_status_owner_select" ON public.club_customer_status FOR SELECT USING (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.pizzerias p WHERE p.id = company_id AND p.owner_id = auth.uid())
);
CREATE POLICY "club_customer_status_admin_write" ON public.club_customer_status FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "club_cycles_owner_select" ON public.club_cycles FOR SELECT USING (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.pizzerias p WHERE p.id = company_id AND p.owner_id = auth.uid())
);
CREATE POLICY "club_cycles_admin_write" ON public.club_cycles FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "club_history_owner_select" ON public.club_history FOR SELECT USING (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.pizzerias p WHERE p.id = company_id AND p.owner_id = auth.uid())
);
CREATE POLICY "club_history_admin_write" ON public.club_history FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "club_notifications_owner_select" ON public.club_notifications FOR SELECT USING (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.pizzerias p WHERE p.id = company_id AND p.owner_id = auth.uid())
);
CREATE POLICY "club_notifications_owner_update" ON public.club_notifications FOR UPDATE USING (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.pizzerias p WHERE p.id = company_id AND p.owner_id = auth.uid())
) WITH CHECK (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.pizzerias p WHERE p.id = company_id AND p.owner_id = auth.uid())
);
CREATE POLICY "club_notifications_admin_write" ON public.club_notifications FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "club_notifications_admin_delete" ON public.club_notifications FOR DELETE USING (public.is_admin());

-- Rankings: leitura autenticada (Hall da Fama depende de comparação entre empresas,
-- mas nunca expõe dados sensíveis, só métricas). Escrita só admin/sistema.
CREATE POLICY "club_rankings_select_authenticated" ON public.club_rankings FOR SELECT TO authenticated USING (true);
CREATE POLICY "club_rankings_admin_write" ON public.club_rankings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "club_vouchers_owner_select" ON public.club_vouchers FOR SELECT USING (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.pizzerias p WHERE p.id = company_id AND p.owner_id = auth.uid())
);
CREATE POLICY "club_vouchers_admin_write" ON public.club_vouchers FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Auditoria: só admin lê; nunca há política de DELETE (imutável por design).
CREATE POLICY "club_audit_logs_admin_select" ON public.club_audit_logs FOR SELECT USING (public.is_admin());
CREATE POLICY "club_audit_logs_insert" ON public.club_audit_logs FOR INSERT WITH CHECK (true);

-- ============================================================
-- Seed: cria o clube CENTS e seus níveis/configuração padrão
-- ============================================================
INSERT INTO public.clubs (id, name, description, status)
VALUES ('00000000-0000-0000-0000-0000000000c1', 'Clube CENTS', 'Programa de fidelização, gamificação e crescimento do FlyControl', 'active');

INSERT INTO public.club_settings (club_id, default_price_per_order, gold_price_per_order, goal_orders, challenge_days, voucher_months, legend_streak_required)
VALUES ('00000000-0000-0000-0000-0000000000c1', 0.70, 0.40, 800, 7, 3, 12);

INSERT INTO public.club_levels (club_id, name, slug, icon, color, priority, minimum_orders, maximum_orders)
VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'Bronze', 'bronze', '🥉', '#CD7F32', 1, 0, 399),
  ('00000000-0000-0000-0000-0000000000c1', 'Prata', 'prata', '🥈', '#C0C0C0', 2, 400, 799),
  ('00000000-0000-0000-0000-0000000000c1', 'Ouro', 'ouro', '🥇', '#FFD700', 3, 800, NULL);
