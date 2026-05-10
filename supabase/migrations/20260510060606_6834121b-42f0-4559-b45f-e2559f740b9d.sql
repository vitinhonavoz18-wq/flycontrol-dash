-- 1. Assegurar que os roles existam (se não existirem)
-- O tipo enum 'role' já parece existir pelo erro no read_query anterior, mas vamos garantir

-- 2. Garantir que o admin principal tenha o cargo correto
DO $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'vitinhonavoz18@gmail.com';
    
    IF v_user_id IS NOT NULL THEN
        -- Remove roles existentes para este user para evitar duplicatas
        DELETE FROM public.user_roles WHERE user_id = v_user_id;
        
        -- Insere como super_admin
        INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'super_admin');
    END IF;
END $$;

-- 3. Habilitar RLS em todas as tabelas relevantes
ALTER TABLE public.pizzerias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Funções auxiliares para políticas
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Políticas para 'pizzerias'
DROP POLICY IF EXISTS "Admins can do everything on pizzerias" ON public.pizzerias;
CREATE POLICY "Admins can do everything on pizzerias"
ON public.pizzerias FOR ALL
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Owners can view their own pizzerias" ON public.pizzerias;
CREATE POLICY "Owners can view their own pizzerias"
ON public.pizzerias FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners can update their own pizzerias" ON public.pizzerias;
CREATE POLICY "Owners can update their own pizzerias"
ON public.pizzerias FOR UPDATE
TO authenticated
USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners can insert one pizzeria if they have none" ON public.pizzerias;
CREATE POLICY "Owners can insert one pizzeria if they have none"
ON public.pizzerias FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = owner_id AND
  NOT EXISTS (
    SELECT 1 FROM public.pizzerias WHERE owner_id = auth.uid()
  )
);

-- 6. Políticas para 'orders'
DROP POLICY IF EXISTS "Admins can do everything on orders" ON public.orders;
CREATE POLICY "Admins can do everything on orders"
ON public.orders FOR ALL
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Owners can view orders of their pizzerias" ON public.orders;
CREATE POLICY "Owners can view orders of their pizzerias"
ON public.orders FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pizzerias
    WHERE id = orders.tenant_id AND owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Owners can update status of their orders" ON public.orders;
CREATE POLICY "Owners can update status of their orders"
ON public.orders FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pizzerias
    WHERE id = orders.tenant_id AND owner_id = auth.uid()
  )
);

-- 7. Políticas para 'order_items'
DROP POLICY IF EXISTS "Admins can do everything on order_items" ON public.order_items;
CREATE POLICY "Admins can do everything on order_items"
ON public.order_items FOR ALL
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Owners can view order_items of their pizzerias" ON public.order_items;
CREATE POLICY "Owners can view order_items of their pizzerias"
ON public.order_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.pizzerias p ON p.id = o.tenant_id
    WHERE o.id = order_items.order_id AND p.owner_id = auth.uid()
  )
);

-- 8. Políticas para 'user_roles'
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.is_admin());
