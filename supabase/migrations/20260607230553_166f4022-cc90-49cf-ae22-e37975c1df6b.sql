-- REFORÇO DE SEGURANÇA E RLS NO FLYCONTROL

-- 1. Funções de auxílio para RLS (caso não existam ou precisem de SECURITY DEFINER seguro)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN (
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Atualiza a função mantendo os nomes dos parâmetros originais (_user_id, _pizzeria_id)
-- para evitar erros de dependência e mudança de assinatura.
CREATE OR REPLACE FUNCTION public.owns_pizzeria(_user_id uuid, _pizzeria_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN (
    SELECT EXISTS (
      SELECT 1 FROM public.pizzerias
      WHERE id = _pizzeria_id AND owner_id = _user_id
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Ajuste RLS para PIZZERIAS
ALTER TABLE public.pizzerias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pizzerias_select_policy" ON public.pizzerias;
CREATE POLICY "pizzerias_select_policy" ON public.pizzerias
FOR SELECT USING (owner_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "pizzerias_public_select" ON public.pizzerias;
CREATE POLICY "pizzerias_public_select" ON public.pizzerias
FOR SELECT TO anon USING (status = 'active');

-- 3. Ajuste RLS para ORDERS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
CREATE POLICY "orders_select_policy" ON public.orders
FOR SELECT USING (
  is_admin() OR 
  EXISTS (
    SELECT 1 FROM public.pizzerias p
    WHERE p.id = orders.tenant_id AND p.owner_id = auth.uid()
  )
);

-- Permite inserção anônima (do SiteCreatorFly)
DROP POLICY IF EXISTS "orders_anon_insert_policy" ON public.orders;
CREATE POLICY "orders_anon_insert_policy" ON public.orders
FOR INSERT TO anon WITH CHECK (true);

-- 4. Ajuste RLS para RESTAURANT_TABLES
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tables_select_policy" ON public.restaurant_tables;
CREATE POLICY "tables_select_policy" ON public.restaurant_tables
FOR SELECT USING (
  is_admin() OR 
  EXISTS (
    SELECT 1 FROM public.pizzerias p
    WHERE p.id = restaurant_tables.restaurant_id AND p.owner_id = auth.uid()
  )
);

-- Permite leitura anônima de mesa específica pelo token (QR Code)
DROP POLICY IF EXISTS "tables_anon_select_by_token" ON public.restaurant_tables;
CREATE POLICY "tables_anon_select_by_token" ON public.restaurant_tables
FOR SELECT TO anon USING (is_active = true);

-- 5. Ajuste RLS para TABLE_SESSIONS
ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sessions_select_policy" ON public.table_sessions;
CREATE POLICY "sessions_select_policy" ON public.table_sessions
FOR SELECT USING (
  is_admin() OR 
  EXISTS (
    SELECT 1 FROM public.pizzerias p
    WHERE p.id = table_sessions.restaurant_id AND p.owner_id = auth.uid()
  )
);

-- 6. Garantir permissões básicas para service_role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
