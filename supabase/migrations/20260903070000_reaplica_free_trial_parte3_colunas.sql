-- Reaplica o pedaço do período grátis que sumiu do banco.
--
-- O QUE ACONTECEU
--
-- A migração `20260820120000_free_trial` está marcada como aplicada, mas
-- parte do que ela cria não existe no banco. Já reapliquei antes o caderno de
-- concessões (`trial_grants`) e a função que concede o período grátis; faltou
-- este bloco, que é o das COLUNAS.
--
-- É a reforma que consta como concluída na papelada, mas em que faltou
-- instalar metade das tomadas: o interruptor está na parede, e não acende.
--
-- O QUE ISSO ESTAVA QUEBRANDO, NA PRÁTICA
--
-- 1. NINGUÉM RECEBIA OS 30 DIAS GRÁTIS. A função que concede grava a data de
--    início nestas colunas. Sem elas, a gravação falha. Conferido: zero
--    concessões registradas desde sempre.
--
-- 2. O BANCO NEM ACEITAVA O ESTADO "no período grátis". A lista de estados
--    permitidos da assinatura não tinha `free_trial`.
--
-- 3. NENHUM CICLO FECHAVA, LOGO NENHUMA FATURA ERA EMITIDA. O fechamento lê
--    `billing_cycles.cycle_type` para saber se aquele mês é o gratuito ou o
--    cobrado. Lendo uma coluna que não existe, a consulta falha e o
--    fechamento morre antes de começar — para todas as lojas.
--
-- Como nenhum ciclo tinha vencido ainda, isso não gerou cobrança errada nem
-- cobrança perdida. Mas o primeiro vencimento estava chegando.
--
-- Os valores padrão preservam o passado: todo ciclo que já existe é de uso
-- (`usage`), que é exatamente o que eles sempre foram.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_cycle_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_cycle_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_charge_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_billable_orders INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_order_rate BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_due BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.subscriptions.trial_started_at IS
  'Inicio do periodo gratuito. Gravado pelo servidor, nunca pelo navegador.';
COMMENT ON COLUMN public.subscriptions.first_charge_at IS
  'Data prevista/efetiva da primeira cobranca. Nada e cobrado antes disso.';
COMMENT ON COLUMN public.subscriptions.total_billable_orders IS
  'Pedidos contabilizados no ciclo corrente. Espelho de billing_cycles, para leitura barata na tela.';

DO $$
BEGIN
  ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
  ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN (
      'pending_activation', 'pending_payment', 'free_trial', 'active',
      'past_due', 'suspended', 'canceled', 'expired'
    ));
END $$;

ALTER TABLE public.billing_cycles
  ADD COLUMN IF NOT EXISTS cycle_type TEXT NOT NULL DEFAULT 'usage';

DO $$
BEGIN
  ALTER TABLE public.billing_cycles DROP CONSTRAINT IF EXISTS billing_cycles_cycle_type_check;
  ALTER TABLE public.billing_cycles ADD CONSTRAINT billing_cycles_cycle_type_check
    CHECK (cycle_type IN ('free_trial', 'usage'));
END $$;

COMMENT ON COLUMN public.billing_cycles.cycle_type IS
  'free_trial = 30 dias por nossa conta, fecha sem fatura. usage = ciclo cobrado.';
