-- REFORÇO DE SEGURANÇA PARA PROPRIETÁRIOS (OWNERS) - CORREÇÃO

-- Garante RLS em tabelas críticas (se ainda não estiverem)
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pizzeria_pizza_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_session_orders ENABLE ROW LEVEL SECURITY;

-- 1. Categorias
DROP POLICY IF EXISTS "Manage menu_categories" ON public.menu_categories;
CREATE POLICY "Manage menu_categories" ON public.menu_categories
FOR ALL USING (is_admin() OR owns_pizzeria(auth.uid(), pizzeria_id));

-- 2. Produtos
DROP POLICY IF EXISTS "Manage menu_products" ON public.menu_products;
CREATE POLICY "Manage menu_products" ON public.menu_products
FOR ALL USING (is_admin() OR owns_pizzeria(auth.uid(), pizzeria_id));

-- 3. Extras
DROP POLICY IF EXISTS "Manage menu_extras" ON public.menu_extras;
CREATE POLICY "Manage menu_extras" ON public.menu_extras
FOR ALL USING (is_admin() OR owns_pizzeria(auth.uid(), pizzeria_id));

-- 4. Combos
DROP POLICY IF EXISTS "Manage combos" ON public.combos;
CREATE POLICY "Manage combos" ON public.combos
FOR ALL USING (is_admin() OR owns_pizzeria(auth.uid(), pizzeria_id));

-- 5. Combo Items
DROP POLICY IF EXISTS "Manage combo_items" ON public.combo_items;
CREATE POLICY "Manage combo_items" ON public.combo_items
FOR ALL USING (
  is_admin() OR 
  EXISTS (
    SELECT 1 FROM public.combos c 
    WHERE c.id = combo_items.combo_id AND owns_pizzeria(auth.uid(), c.pizzeria_id)
  )
);

-- 6. Pizza Sizes
DROP POLICY IF EXISTS "Manage pizza_sizes" ON public.pizzeria_pizza_sizes;
DROP POLICY IF EXISTS "Pizza Sizes manage" ON public.pizzeria_pizza_sizes;
CREATE POLICY "Pizza Sizes manage" ON public.pizzeria_pizza_sizes
FOR ALL USING (is_admin() OR owns_pizzeria(auth.uid(), pizzeria_id));

-- 7. Order Items
DROP POLICY IF EXISTS "Owners can view order_items" ON public.order_items;
CREATE POLICY "Owners can view order_items" ON public.order_items
FOR SELECT USING (
  is_admin() OR 
  EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.pizzerias p ON p.id = o.tenant_id
    WHERE o.id = order_items.order_id AND p.owner_id = auth.uid()
  )
);

-- 8. Table Session Orders
DROP POLICY IF EXISTS "Manage session_orders" ON public.table_session_orders;
CREATE POLICY "Manage session_orders" ON public.table_session_orders
FOR ALL USING (
  is_admin() OR 
  EXISTS (
    SELECT 1 FROM public.table_sessions s
    JOIN public.pizzerias p ON p.id = s.restaurant_id
    WHERE s.id = table_session_orders.table_session_id AND p.owner_id = auth.uid()
  )
);
