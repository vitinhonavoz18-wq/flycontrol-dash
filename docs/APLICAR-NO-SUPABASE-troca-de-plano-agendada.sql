-- =============================================================================
-- APLICAR NO SUPABASE (SQL Editor) — Troca de plano agendada
-- Projeto: knhenchgntttraaeewlj (FlyControl)
--
-- É a migration supabase/migrations/20261020120000_troca_de_plano_agendada.sql
-- numa transação ÚNICA, com fotografias antes (impressões digitais md5 guardadas
-- com set_config, sem tabela temporária) e conferências depois. Qualquer
-- conferência que falhe desfaz TUDO.
--
-- ORDEM: aplicar ANTES de publicar o código desta branch. Sem a tabela, o
-- código novo continua funcionando (a troca agendada só não aparece), mas o
-- botão de agendar daria erro.
--
-- Só cria uma tabela nova. Não altera nenhuma assinatura, ciclo, fatura nem
-- preço — e confere isso no fim. Pode rodar de novo (idempotente).
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '10s';

-- 1) Impressões digitais ANTES (valem só dentro desta transação).
SELECT set_config('fly.subs', coalesce((SELECT md5(string_agg(id::text||'|'||plan_id::text||'|'||plan_price_version_id::text||'|'||status, ',' ORDER BY id)) FROM public.subscriptions), 'vazio'), true);
SELECT set_config('fly.ciclos', coalesce((SELECT md5(string_agg(id::text||'|'||status||'|'||cycle_start::text||'|'||cycle_end::text, ',' ORDER BY id)) FROM public.billing_cycles), 'vazio'), true);
SELECT set_config('fly.faturas', coalesce((SELECT md5(string_agg(id::text||'|'||status||'|'||total_cents::text, ',' ORDER BY id)) FROM public.invoices), 'vazio'), true);
SELECT set_config('fly.precos', coalesce((SELECT md5(string_agg(id::text||'|'||monthly_fee_cents::text||'|'||is_active::text||'|'||billing_interval_months::text, ',' ORDER BY id)) FROM public.plan_price_versions), 'vazio'), true);

-- =========================== MIGRATION (início) ==============================
-- Troca de plano AGENDADA para a próxima renovação.
--
-- O QUE MUDA PARA O CLIENTE
--
-- Quem já paga o Premium (mensal, anual ou o antigo de R$ 375,00) pode
-- escolher no painel o outro plano. A troca NÃO cobra nada na hora: ela fica
-- marcada e vale a partir da próxima renovação — no fechamento do ciclo, o
-- robô abre o ciclo seguinte já no plano novo, e a fatura sai no valor novo.
-- Até lá, dá para desfazer.
--
-- É como a reserva de mesa para a semana que vem: fica anotada no caderno,
-- pode ser desmarcada até o dia, e não se cobra nada antes.
--
-- Assinatura com cobrança PAUSADA pela equipe (sem ciclo aberto — hoje, a
-- ADEGA): a escolha é gravada como "aguardando a equipe" e o robô NUNCA a
-- aplica sozinho. Aceitar a troca não reativa cobrança nenhuma.
--
-- Só cria uma tabela nova. Nada existente é alterado. Idempotente.

CREATE TABLE IF NOT EXISTS public.subscription_plan_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  from_plan_id UUID NOT NULL REFERENCES public.plans(id),
  from_price_version_id UUID NOT NULL REFERENCES public.plan_price_versions(id),
  to_plan_id UUID NOT NULL REFERENCES public.plans(id),
  to_price_version_id UUID NOT NULL REFERENCES public.plan_price_versions(id),
  -- scheduled     = vale na próxima renovação (o robô aplica);
  -- awaiting_team = cobrança pausada; só a equipe aplica, à mão;
  -- applied       = já valeu; canceled = o cliente (ou a equipe) desfez.
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'awaiting_team', 'applied', 'canceled')),
  -- customer_switch = troca mensal <-> anual; legacy_offer = aceite da oferta
  -- de preço novo por quem tinha uma versão antiga (ex.: R$ 375,00).
  source TEXT NOT NULL DEFAULT 'customer_switch'
    CHECK (source IN ('customer_switch', 'legacy_offer')),
  -- Fim do ciclo em que a troca foi pedida (só informativo, para a tela).
  effective_at TIMESTAMPTZ,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ,
  applied_cycle_id UUID REFERENCES public.billing_cycles(id) ON DELETE SET NULL,
  canceled_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (to_price_version_id <> from_price_version_id)
);

-- No máximo UMA troca pendente por assinatura: escolher de novo substitui.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_plan_changes_one_pending
  ON public.subscription_plan_changes(subscription_id)
  WHERE status IN ('scheduled', 'awaiting_team');

CREATE INDEX IF NOT EXISTS subscription_plan_changes_company_idx
  ON public.subscription_plan_changes(company_id, created_at DESC);

ALTER TABLE public.subscription_plan_changes ENABLE ROW LEVEL SECURITY;

-- O dono LÊ a própria troca; escrever, só o servidor (service role) ou o
-- administrador global. Policies criadas só se ainda não existirem.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'subscription_plan_changes'
       AND policyname = 'subscription_plan_changes_owner_read'
  ) THEN
    CREATE POLICY subscription_plan_changes_owner_read ON public.subscription_plan_changes
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.pizzerias pz
          WHERE pz.id = subscription_plan_changes.company_id AND pz.owner_id = auth.uid()
        )
        OR public.is_admin()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'subscription_plan_changes'
       AND policyname = 'subscription_plan_changes_admin_all'
  ) THEN
    CREATE POLICY subscription_plan_changes_admin_all ON public.subscription_plan_changes
      FOR ALL TO authenticated
      USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

COMMENT ON TABLE public.subscription_plan_changes IS
  'Troca de plano agendada para a próxima renovação. scheduled: o fechamento do ciclo aplica. awaiting_team: cobrança pausada, só a equipe aplica.';

-- ============================ MIGRATION (fim) ================================

-- 2) Conferências.
DO $pos$
DECLARE v_count INTEGER;
BEGIN
  IF to_regclass('public.subscription_plan_changes') IS NULL THEN
    RAISE EXCEPTION 'CONFERENCIA: tabela subscription_plan_changes nao foi criada';
  END IF;

  IF to_regclass('public.subscription_plan_changes_one_pending') IS NULL THEN
    RAISE EXCEPTION 'CONFERENCIA: indice de uma troca pendente por assinatura ausente';
  END IF;

  SELECT count(*) INTO v_count FROM pg_class
   WHERE oid = 'public.subscription_plan_changes'::regclass AND relrowsecurity;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'CONFERENCIA: RLS nao esta ligado na tabela nova';
  END IF;

  SELECT count(*) INTO v_count FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'subscription_plan_changes';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'CONFERENCIA: esperava 2 regras de acesso na tabela nova, achei %', v_count;
  END IF;

  IF coalesce((SELECT md5(string_agg(id::text||'|'||plan_id::text||'|'||plan_price_version_id::text||'|'||status, ',' ORDER BY id)) FROM public.subscriptions), 'vazio') <> current_setting('fly.subs') THEN
    RAISE EXCEPTION 'CONFERENCIA: assinaturas mudaram — nada deveria mudar';
  END IF;
  IF coalesce((SELECT md5(string_agg(id::text||'|'||status||'|'||cycle_start::text||'|'||cycle_end::text, ',' ORDER BY id)) FROM public.billing_cycles), 'vazio') <> current_setting('fly.ciclos') THEN
    RAISE EXCEPTION 'CONFERENCIA: ciclos mudaram — nada deveria mudar';
  END IF;
  IF coalesce((SELECT md5(string_agg(id::text||'|'||status||'|'||total_cents::text, ',' ORDER BY id)) FROM public.invoices), 'vazio') <> current_setting('fly.faturas') THEN
    RAISE EXCEPTION 'CONFERENCIA: faturas mudaram — nada deveria mudar';
  END IF;
  IF coalesce((SELECT md5(string_agg(id::text||'|'||monthly_fee_cents::text||'|'||is_active::text||'|'||billing_interval_months::text, ',' ORDER BY id)) FROM public.plan_price_versions), 'vazio') <> current_setting('fly.precos') THEN
    RAISE EXCEPTION 'CONFERENCIA: versoes de preco mudaram — nada deveria mudar';
  END IF;

  RAISE NOTICE 'OK: troca agendada instalada; assinaturas, ciclos, faturas e precos intactos.';
END $pos$;

COMMIT;

-- 3) Depois (só leitura): a tabela existe e está vazia na primeira aplicação.
SELECT status, count(*) FROM public.subscription_plan_changes GROUP BY status;
