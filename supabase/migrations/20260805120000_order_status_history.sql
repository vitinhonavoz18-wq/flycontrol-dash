-- Histórico de mudanças de status dos pedidos.
--
-- Até aqui o FlyControl não guardava nenhum rastro de quem moveu um pedido,
-- quando, nem de onde. O quadro Kanban passa a gravar cada transição.
--
-- A aplicação degrada com elegância se esta migration ainda não tiver sido
-- aplicada: a gravação do histórico falha com 42P01, é registrada no console e
-- a mudança de status acontece normalmente.

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  -- Empresa dona do pedido. Redundante com orders.tenant_id de propósito:
  -- mantém o histórico consultável por empresa sem join, e é o que a RLS usa.
  tenant_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  -- Quem alterou. NULL quando a origem é automação/integração sem usuário.
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Origem da alteração: 'dashboard_kanban', 'api', 'waiter_portal'…
  source TEXT NOT NULL DEFAULT 'dashboard_kanban',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Consulta natural: linha do tempo de um pedido, do mais recente ao mais antigo.
CREATE INDEX IF NOT EXISTS order_status_history_order_idx
  ON public.order_status_history(order_id, created_at DESC);

-- Consulta de auditoria por empresa e período.
CREATE INDEX IF NOT EXISTS order_status_history_tenant_idx
  ON public.order_status_history(tenant_id, created_at DESC);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

-- Leitura: dono da pizzaria ou super admin. Mesmo critério de orders_select_policy.
DROP POLICY IF EXISTS "order_status_history_select_policy" ON public.order_status_history;
CREATE POLICY "order_status_history_select_policy"
  ON public.order_status_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pizzerias
      WHERE pizzerias.id = order_status_history.tenant_id
        AND pizzerias.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

-- Escrita: só é possível registrar histórico de pedidos da própria empresa, e
-- o autor precisa ser o próprio usuário autenticado. Isso impede que alguém
-- forje uma entrada em nome de outro operador ou de outra empresa.
DROP POLICY IF EXISTS "order_status_history_insert_policy" ON public.order_status_history;
CREATE POLICY "order_status_history_insert_policy"
  ON public.order_status_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (changed_by IS NULL OR changed_by = auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM public.pizzerias
        WHERE pizzerias.id = order_status_history.tenant_id
          AND pizzerias.owner_id = auth.uid()
      )
      OR public.is_admin()
    )
  );

-- Histórico é registro de auditoria: não se edita nem se apaga.
-- A ausência de policies de UPDATE e DELETE já bloqueia ambos sob RLS.

COMMENT ON TABLE public.order_status_history IS
  'Auditoria de transições de status de pedidos. Append-only sob RLS.';
