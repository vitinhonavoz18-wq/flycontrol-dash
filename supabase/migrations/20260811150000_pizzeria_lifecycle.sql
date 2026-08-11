-- Descadastro/reativação/exclusão definitiva de lojas (admin).
--
-- 1) Três tabelas referenciam pizzerias(id) sem "ON DELETE CASCADE": se uma
--    loja tiver qualquer mesa cadastrada, log de integração FIQON, ou item
--    de pedido com pizzeria_id preenchido, um DELETE na pizzeria falharia
--    (é como jogar fora a geladeira sem antes esvaziá-la). Corrige as três
--    para cascatear como o resto do esquema já faz.
ALTER TABLE public.restaurant_tables
  DROP CONSTRAINT IF EXISTS restaurant_tables_restaurant_id_fkey,
  ADD CONSTRAINT restaurant_tables_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES public.pizzerias(id) ON DELETE CASCADE;

ALTER TABLE public.flycontrol_fiqon_logs
  DROP CONSTRAINT IF EXISTS flycontrol_fiqon_logs_restaurant_id_fkey,
  ADD CONSTRAINT flycontrol_fiqon_logs_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES public.pizzerias(id) ON DELETE CASCADE;

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_pizzeria_id_fkey,
  ADD CONSTRAINT order_items_pizzeria_id_fkey
    FOREIGN KEY (pizzeria_id) REFERENCES public.pizzerias(id) ON DELETE CASCADE;

-- 2) Log de auditoria das ações administrativas sobre lojas. Não reaproveita
--    club_audit_logs porque aquela tabela é do módulo de fidelidade (CENTS)
--    — mesmo padrão de desenho, tabela própria para não misturar assuntos.
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_store_id UUID,
  target_user_id UUID,
  status TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_audit_logs_admin_select" ON public.admin_audit_logs;
CREATE POLICY "admin_audit_logs_admin_select" ON public.admin_audit_logs
  FOR SELECT TO authenticated USING (public.is_admin());

GRANT SELECT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;
