-- Fundação de planos, assinaturas e cobrança por uso da FlyControl.
--
-- Princípios que a estrutura precisa garantir:
--   1. Todo dinheiro é BIGINT em centavos. Nunca NUMERIC com casas decimais,
--      nunca FLOAT.
--   2. Preço tem versão. Alterar o preço de um plano não pode reescrever
--      cobranças históricas — por isso a assinatura aponta para a versão que
--      contratou.
--   3. Consumo é evento auditável, não contador mutável. A restrição UNIQUE
--      em usage_events é o que impede cobrar o mesmo pedido duas vezes.
--   4. O cliente nunca escreve em nada financeiro. Toda escrita é do servidor
--      (service role) ou de administrador global.
--
-- Esta migration NÃO altera pizzerias, orders nem nenhuma tabela existente:
-- só acrescenta. Clientes atuais continuam funcionando exatamente como estão.

-- ---------------------------------------------------------------------------
-- Planos e versões de preço
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  billing_model TEXT NOT NULL CHECK (billing_model IN ('monthly_fixed', 'usage_per_order')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- `is_public = false` é o que mantém o acesso legado fora da página
  -- comercial: ele existe como plano interno, mas não é contratável.
  is_public BOOLEAN NOT NULL DEFAULT true,
  currency TEXT NOT NULL DEFAULT 'BRL',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plan_price_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  setup_fee_cents BIGINT NOT NULL DEFAULT 0 CHECK (setup_fee_cents >= 0),
  monthly_fee_cents BIGINT NOT NULL DEFAULT 0 CHECK (monthly_fee_cents >= 0),
  default_order_unit_price_cents BIGINT NOT NULL DEFAULT 0 CHECK (default_order_unit_price_cents >= 0),
  promotional_order_unit_price_cents BIGINT NOT NULL DEFAULT 0 CHECK (promotional_order_unit_price_cents >= 0),
  promotion_threshold_orders INTEGER NOT NULL DEFAULT 0 CHECK (promotion_threshold_orders >= 0),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Rastro de quem mudou o preço e por quê.
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, version)
);

CREATE TABLE IF NOT EXISTS public.plan_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  -- NULL = sem limite numérico. Preparado para features com cota.
  limit_value INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, feature_key)
);

-- ---------------------------------------------------------------------------
-- Assinaturas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  plan_price_version_id UUID NOT NULL REFERENCES public.plan_price_versions(id),
  status TEXT NOT NULL DEFAULT 'pending_activation'
    CHECK (status IN (
      'pending_activation', 'pending_payment', 'active',
      'past_due', 'suspended', 'canceled', 'expired'
    )),
  billing_model TEXT NOT NULL CHECK (billing_model IN ('monthly_fixed', 'usage_per_order')),
  -- Dia do mês que ancora o ciclo. Deriva da ativação.
  billing_anchor_day SMALLINT CHECK (billing_anchor_day BETWEEN 1 AND 31),
  -- Fuso da empresa: determina quando o dia vira para efeito de ciclo.
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  current_cycle_id UUID,
  activated_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  -- Nulo por padrão: não há período gratuito definido comercialmente.
  trial_ends_at TIMESTAMPTZ,
  payment_provider TEXT NOT NULL DEFAULT 'manual',
  external_customer_id TEXT,
  external_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uma empresa tem no máximo uma assinatura viva por vez. Assinaturas
-- canceladas/expiradas ficam no histórico e não bloqueiam uma nova.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_live_per_company
  ON public.subscriptions(company_id)
  WHERE status NOT IN ('canceled', 'expired');

CREATE INDEX IF NOT EXISTS subscriptions_company_idx ON public.subscriptions(company_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON public.subscriptions(status);

-- ---------------------------------------------------------------------------
-- Ciclos de cobrança
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.billing_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  cycle_start TIMESTAMPTZ NOT NULL,
  cycle_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'calculating', 'closed', 'invoiced', 'paid', 'overdue', 'canceled')),
  -- Preço CONGELADO na abertura. É o que impede alteração retroativa: fechar
  -- o ciclo nunca recalcula este valor.
  unit_price_cents BIGINT NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
  promotion_threshold_orders INTEGER NOT NULL DEFAULT 0,
  -- Este ciclo herdou o preço promocional do ciclo anterior?
  qualified_from_previous_cycle BOOLEAN NOT NULL DEFAULT false,
  billable_order_count INTEGER NOT NULL DEFAULT 0 CHECK (billable_order_count >= 0),
  gross_usage_amount_cents BIGINT NOT NULL DEFAULT 0,
  setup_fee_amount_cents BIGINT NOT NULL DEFAULT 0,
  monthly_fee_amount_cents BIGINT NOT NULL DEFAULT 0,
  discount_amount_cents BIGINT NOT NULL DEFAULT 0,
  total_amount_cents BIGINT NOT NULL DEFAULT 0,
  -- Atingiu a meta? Define o preço do PRÓXIMO ciclo, nunca deste.
  qualified_for_next_cycle BOOLEAN NOT NULL DEFAULT false,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (cycle_end > cycle_start)
);

-- Impede dois ciclos abertos para a mesma assinatura: sem isso, um pedido
-- poderia ser atribuído a dois ciclos.
CREATE UNIQUE INDEX IF NOT EXISTS billing_cycles_one_open_per_subscription
  ON public.billing_cycles(subscription_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS billing_cycles_company_idx ON public.billing_cycles(company_id, cycle_start DESC);

-- A referência ao ciclo corrente só pode ser criada depois que billing_cycles
-- existe, por isso ela vem aqui e não junto da tabela.
--
-- ADD CONSTRAINT não aceita IF NOT EXISTS, então a checagem é explícita. Sem
-- ela, rodar esta migration uma segunda vez aborta em "constraint já existe"
-- e tudo que vem depois deixa de ser aplicado.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'subscriptions_current_cycle_fkey'
       AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_current_cycle_fkey
      FOREIGN KEY (current_cycle_id) REFERENCES public.billing_cycles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Eventos de uso
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  billing_cycle_id UUID NOT NULL REFERENCES public.billing_cycles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL DEFAULT 'order_billable'
    CHECK (event_type IN ('order_billable', 'order_reversal', 'manual_adjustment')),
  -- Negativo em estorno. É assim que uma correção fica auditável em vez de
  -- apagar o evento original.
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents >= 0),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A trava real contra cobrança duplicada.
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_events_cycle_idx ON public.usage_events(billing_cycle_id);
CREATE INDEX IF NOT EXISTS usage_events_company_idx ON public.usage_events(company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_order_idx ON public.usage_events(order_id);

-- ---------------------------------------------------------------------------
-- Faturas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  billing_cycle_id UUID NOT NULL REFERENCES public.billing_cycles(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('draft', 'pending', 'processing', 'paid', 'overdue', 'canceled')),
  subtotal_cents BIGINT NOT NULL DEFAULT 0,
  discount_cents BIGINT NOT NULL DEFAULT 0,
  total_cents BIGINT NOT NULL DEFAULT 0,
  due_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  payment_provider TEXT NOT NULL DEFAULT 'manual',
  external_invoice_id TEXT,
  external_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Um ciclo gera no máximo uma fatura viva. Fechar o ciclo duas vezes não pode
-- cobrar o cliente duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_per_cycle
  ON public.invoices(billing_cycle_id)
  WHERE status <> 'canceled';

CREATE INDEX IF NOT EXISTS invoices_company_idx ON public.invoices(company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('monthly_fee', 'setup_fee', 'usage', 'discount', 'adjustment')),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_amount_cents BIGINT NOT NULL,
  total_amount_cents BIGINT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON public.invoice_items(invoice_id);

-- A taxa de cadastro é cobrada uma única vez por assinatura. Esta view é o
-- que o motor consulta para decidir — mais confiável que contar ciclos, que
-- podem ser reprocessados.
CREATE OR REPLACE VIEW public.subscription_setup_fee_charged AS
  SELECT i.subscription_id, MIN(i.created_at) AS charged_at
  FROM public.invoices i
  JOIN public.invoice_items ii ON ii.invoice_id = i.id
  WHERE ii.item_type = 'setup_fee' AND i.status <> 'canceled'
  GROUP BY i.subscription_id;

-- ---------------------------------------------------------------------------
-- Pagamentos (estrutura para o gateway futuro — nada é preenchido agora)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'manual',
  external_transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'expired', 'refunded', 'canceled')),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  payment_method TEXT,
  pix_copy_paste TEXT,
  qr_code_reference TEXT,
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  raw_provider_status JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_external_idx
  ON public.payment_transactions(provider, external_transaction_id)
  WHERE external_transaction_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Auditoria da assinatura
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_events_subscription_idx
  ON public.subscription_events(subscription_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Semente dos planos
-- ---------------------------------------------------------------------------

INSERT INTO public.plans (code, name, description, billing_model, is_public, sort_order)
VALUES
  ('premium', 'PREMIUM',
   'Gestão completa para operações que precisam de mais controle, equipe e recursos avançados.',
   'monthly_fixed', true, 1),
  ('cents', 'CENTS',
   'Pague de acordo com o volume de pedidos e reduza o valor por pedido ao atingir a meta mensal.',
   'usage_per_order', true, 2),
  -- Plano interno para os clientes que já existiam antes da cobrança. Nunca
  -- aparece na página comercial porque is_public = false.
  ('legacy_full_access', 'Acesso legado',
   'Clientes anteriores ao modelo de assinatura. Mantêm acesso completo até migração administrativa.',
   'monthly_fixed', false, 99)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.plan_price_versions (
  plan_id, version, setup_fee_cents, monthly_fee_cents,
  default_order_unit_price_cents, promotional_order_unit_price_cents,
  promotion_threshold_orders, change_reason
)
SELECT p.id, 1, v.setup, v.monthly, v.unit, v.promo, v.threshold, 'Versão inicial'
FROM public.plans p
JOIN (VALUES
  ('premium',            0::BIGINT, 37500::BIGINT,  0::BIGINT,  0::BIGINT,   0),
  ('cents',           2500::BIGINT,     0::BIGINT, 70::BIGINT, 45::BIGINT, 500),
  ('legacy_full_access', 0::BIGINT,     0::BIGINT,  0::BIGINT,  0::BIGINT,   0)
) AS v(code, setup, monthly, unit, promo, threshold) ON v.code = p.code
WHERE NOT EXISTS (
  SELECT 1 FROM public.plan_price_versions pv WHERE pv.plan_id = p.id AND pv.version = 1
);

-- Funcionalidades restritas. O que não estiver listado é liberado para todos.
INSERT INTO public.plan_features (plan_id, feature_key, is_enabled)
SELECT p.id, f.feature_key, f.is_enabled
FROM public.plans p
JOIN (VALUES
  ('premium', 'tables', true),  ('premium', 'waiters', true),  ('premium', 'commissions', true),
  ('cents',   'tables', false), ('cents',   'waiters', false), ('cents',   'commissions', false),
  ('legacy_full_access', 'tables', true),
  ('legacy_full_access', 'waiters', true),
  ('legacy_full_access', 'commissions', true)
) AS f(code, feature_key, is_enabled) ON f.code = p.code
ON CONFLICT (plan_id, feature_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_price_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- Catálogo comercial: leitura pública apenas dos planos contratáveis.
DROP POLICY IF EXISTS "plans_public_read" ON public.plans;
CREATE POLICY "plans_public_read" ON public.plans
  FOR SELECT TO public USING (is_public = true AND is_active = true);

DROP POLICY IF EXISTS "plans_admin_read" ON public.plans;
CREATE POLICY "plans_admin_read" ON public.plans
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "plan_price_versions_read" ON public.plan_price_versions;
CREATE POLICY "plan_price_versions_read" ON public.plan_price_versions
  FOR SELECT TO public USING (
    EXISTS (SELECT 1 FROM public.plans p WHERE p.id = plan_id AND p.is_public AND p.is_active)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "plan_features_read" ON public.plan_features;
CREATE POLICY "plan_features_read" ON public.plan_features
  FOR SELECT TO public USING (
    EXISTS (SELECT 1 FROM public.plans p WHERE p.id = plan_id AND p.is_public AND p.is_active)
    OR public.is_admin()
  );

-- Só administradores globais mexem no catálogo e nos preços.
DROP POLICY IF EXISTS "plans_admin_write" ON public.plans;
CREATE POLICY "plans_admin_write" ON public.plans
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "plan_price_versions_admin_write" ON public.plan_price_versions;
CREATE POLICY "plan_price_versions_admin_write" ON public.plan_price_versions
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "plan_features_admin_write" ON public.plan_features;
CREATE POLICY "plan_features_admin_write" ON public.plan_features
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Dados financeiros da empresa: o dono LÊ, e só. Nenhuma policy de escrita é
-- criada para o cliente — a ausência delas é o bloqueio. Toda escrita passa
-- pela service role no servidor ou por administrador global.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['subscriptions', 'billing_cycles', 'usage_events', 'invoices', 'subscription_events']
  LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS %1$I ON public.%2$I;
      CREATE POLICY %1$I ON public.%2$I
        FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.pizzerias pz
            WHERE pz.id = %2$I.company_id AND pz.owner_id = auth.uid()
          )
          OR public.is_admin()
        );
    $f$, t || '_owner_read', t);

    EXECUTE format($f$
      DROP POLICY IF EXISTS %1$I ON public.%2$I;
      CREATE POLICY %1$I ON public.%2$I
        FOR ALL TO authenticated
        USING (public.is_admin()) WITH CHECK (public.is_admin());
    $f$, t || '_admin_all', t);
  END LOOP;
END $$;

-- Itens de fatura e transações herdam o acesso da fatura.
DROP POLICY IF EXISTS "invoice_items_owner_read" ON public.invoice_items;
CREATE POLICY "invoice_items_owner_read" ON public.invoice_items
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.pizzerias pz ON pz.id = i.company_id
      WHERE i.id = invoice_id AND (pz.owner_id = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "invoice_items_admin_all" ON public.invoice_items;
CREATE POLICY "invoice_items_admin_all" ON public.invoice_items
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Transações de pagamento: nem o dono lê. Contêm dados do gateway e, no
-- futuro, códigos PIX. Somente servidor e administrador global.
DROP POLICY IF EXISTS "payment_transactions_admin_all" ON public.payment_transactions;
CREATE POLICY "payment_transactions_admin_all" ON public.payment_transactions
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.usage_events IS
  'Consumo faturável, append-only. idempotency_key impede contar o mesmo pedido duas vezes.';
COMMENT ON TABLE public.billing_cycles IS
  'unit_price_cents é congelado na abertura: fechar o ciclo nunca o recalcula.';
