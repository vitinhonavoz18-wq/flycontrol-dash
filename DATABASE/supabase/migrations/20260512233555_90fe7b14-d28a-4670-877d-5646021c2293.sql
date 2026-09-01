-- First, drop the problematic policies that cause recursion
DROP POLICY IF EXISTS "Owners can insert one pizzeria if they have none" ON public.pizzerias;
DROP POLICY IF EXISTS "Admins can do everything on pizzerias" ON public.pizzerias;
DROP POLICY IF EXISTS "Admins can view all pizzerias" ON public.pizzerias;
DROP POLICY IF EXISTS "Owners can view their own pizzerias" ON public.pizzerias;
DROP POLICY IF EXISTS "Owners can update their own pizzerias" ON public.pizzerias;
DROP POLICY IF EXISTS "Users can insert their own pizzerias" ON public.pizzerias;
DROP POLICY IF EXISTS "Users can update their own pizzerias" ON public.pizzerias;
DROP POLICY IF EXISTS "Users can view their own pizzerias" ON public.pizzerias;
DROP POLICY IF EXISTS "pizzerias owner select" ON public.pizzerias;
DROP POLICY IF EXISTS "pizzerias owner update" ON public.pizzerias;
DROP POLICY IF EXISTS "pizzerias admin delete" ON public.pizzerias;
DROP POLICY IF EXISTS "pizzerias admin insert" ON public.pizzerias;

-- Drop problematic policies on orders
DROP POLICY IF EXISTS "Admins can do everything on orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Owners can update status of their orders" ON public.orders;
DROP POLICY IF EXISTS "Owners can view orders of their pizzerias" ON public.orders;
DROP POLICY IF EXISTS "Owners can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "orders owner delete" ON public.orders;
DROP POLICY IF EXISTS "orders owner select" ON public.orders;
DROP POLICY IF EXISTS "orders owner update" ON public.orders;

-- Drop functions using CASCADE to handle dependencies automatically
DROP FUNCTION IF EXISTS public.owns_pizzeria(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, text) CASCADE;

-- Re-implement helper functions to be more robust
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.owns_pizzeria(_user_id uuid, _pizzeria_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.pizzerias
    WHERE id = _pizzeria_id AND owner_id = _user_id
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Create clean policies for pizzerias
CREATE POLICY "pizzerias_select_policy" ON public.pizzerias FOR SELECT TO public USING ((owner_id = auth.uid()) OR is_admin());
CREATE POLICY "pizzerias_insert_policy" ON public.pizzerias FOR INSERT TO authenticated WITH CHECK ((owner_id = auth.uid()) OR is_admin());
CREATE POLICY "pizzerias_update_policy" ON public.pizzerias FOR UPDATE TO authenticated USING ((owner_id = auth.uid()) OR is_admin()) WITH CHECK ((owner_id = auth.uid()) OR is_admin());
CREATE POLICY "pizzerias_delete_policy" ON public.pizzerias FOR DELETE TO authenticated USING (is_admin());

-- Create clean policies for orders
CREATE POLICY "orders_select_policy" ON public.orders FOR SELECT TO public USING (EXISTS (SELECT 1 FROM public.pizzerias WHERE pizzerias.id = orders.tenant_id AND pizzerias.owner_id = auth.uid()) OR is_admin());
CREATE POLICY "orders_insert_policy" ON public.orders FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "orders_update_policy" ON public.orders FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.pizzerias WHERE pizzerias.id = orders.tenant_id AND pizzerias.owner_id = auth.uid()) OR is_admin()) WITH CHECK (EXISTS (SELECT 1 FROM public.pizzerias WHERE pizzerias.id = orders.tenant_id AND pizzerias.owner_id = auth.uid()) OR is_admin());

-- Re-create policies that were dropped by CASCADE (based on error message details)
-- user_roles dependencies
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (is_admin() OR user_id = auth.uid());

-- order_items dependencies
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN
        CREATE POLICY "Admins can do everything on order_items" ON public.order_items FOR ALL TO authenticated USING (is_admin());
        CREATE POLICY "Users can view items of their pizzerias' orders" ON public.order_items FOR SELECT TO authenticated USING (
            is_admin() OR 
            EXISTS (
                SELECT 1 FROM public.orders o
                JOIN public.pizzerias p ON p.id = o.tenant_id
                WHERE o.id = order_items.order_id
                AND p.owner_id = auth.uid()
            )
        );
    END IF;
END $$;

-- Ensure RLS is enabled
ALTER TABLE public.pizzerias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Add basic policies for user_roles and profiles if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_roles' AND policyname = 'user_roles_read_policy') THEN
        CREATE POLICY "user_roles_read_policy" ON public.user_roles FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_read_policy') THEN
        CREATE POLICY "profiles_read_policy" ON public.profiles FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
