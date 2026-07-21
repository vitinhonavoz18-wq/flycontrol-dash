-- Controle de funcionalidades por plano: bloquear o módulo "Mesas" para
-- empresas do Plano CENTS mesmo em acesso direto ao banco (a página /tables
-- fala direto com restaurant_tables/table_sessions via supabase-js, sem
-- passar por uma API própria — então a barreira de UI sozinha não é
-- suficiente, precisa valer também no RLS).
--
-- Usa políticas RESTRICTIVE (que fazem AND com as políticas permissivas já
-- existentes) escopadas só a INSERT/UPDATE/DELETE, para não tocar nas
-- políticas de SELECT públicas usadas pelo fluxo de pedido do cliente via
-- QR code — aquele fluxo continua funcionando independente do plano.
--
-- Fonte da verdade do plano continua sendo pizzerias.plan_type (sem tabela
-- nova). Se amanhã "premium" virar mais granular, é só ajustar a condição
-- abaixo — a lógica de quais features cada plano tem já está centralizada
-- em src/lib/planPermissions.ts no client/servidor.

CREATE POLICY "restaurant_tables_plan_gate_insert" ON public.restaurant_tables
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.pizzerias p
      WHERE (p.id = restaurant_tables.restaurant_id OR p.id = restaurant_tables.tenant_id)
        AND p.plan_type = 'premium'
    )
  );

CREATE POLICY "restaurant_tables_plan_gate_update" ON public.restaurant_tables
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.pizzerias p
      WHERE (p.id = restaurant_tables.restaurant_id OR p.id = restaurant_tables.tenant_id)
        AND p.plan_type = 'premium'
    )
  );

CREATE POLICY "restaurant_tables_plan_gate_delete" ON public.restaurant_tables
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.pizzerias p
      WHERE (p.id = restaurant_tables.restaurant_id OR p.id = restaurant_tables.tenant_id)
        AND p.plan_type = 'premium'
    )
  );

CREATE POLICY "table_sessions_plan_gate_insert" ON public.table_sessions
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.pizzerias p
      WHERE p.id = table_sessions.restaurant_id AND p.plan_type = 'premium'
    )
  );

CREATE POLICY "table_sessions_plan_gate_update" ON public.table_sessions
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.pizzerias p
      WHERE p.id = table_sessions.restaurant_id AND p.plan_type = 'premium'
    )
  );

CREATE POLICY "table_sessions_plan_gate_delete" ON public.table_sessions
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.pizzerias p
      WHERE p.id = table_sessions.restaurant_id AND p.plan_type = 'premium'
    )
  );

-- waiters: RLS já cobre owner+admin via política "Owners manage own waiters"
-- (ALL). Aqui também restringimos a mutação por plano, sem tocar o SELECT
-- (mantém o admin/relatórios enxergando garçons já cadastrados mesmo que a
-- empresa tenha migrado para CENTS, só não deixa criar/editar/apagar).
CREATE POLICY "waiters_plan_gate_insert" ON public.waiters
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.pizzerias p
      WHERE p.id = waiters.tenant_id AND p.plan_type = 'premium'
    )
  );

CREATE POLICY "waiters_plan_gate_update" ON public.waiters
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.pizzerias p
      WHERE p.id = waiters.tenant_id AND p.plan_type = 'premium'
    )
  );

CREATE POLICY "waiters_plan_gate_delete" ON public.waiters
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.pizzerias p
      WHERE p.id = waiters.tenant_id AND p.plan_type = 'premium'
    )
  );
