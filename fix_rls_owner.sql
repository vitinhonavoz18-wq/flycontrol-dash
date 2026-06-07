-- Adicionando políticas de segurança robustas para donos de restaurantes
-- O Dono só pode ver e editar seus próprios dados

-- Garante RLS em tabelas críticas
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pizzeria_pizza_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_session_orders ENABLE ROW LEVEL SECURITY;

-- Categorias
DROP POLICY IF EXISTS "Manage menu_categories" ON public.menu_categories;
CREATE POLICY "Manage menu_categories" ON public.menu_categories
FOR ALL USING (is_admin() OR owns_pizzeria(auth.uid(), pizzeria_id));

-- Produtos
DROP POLICY IF EXISTS "Manage menu_products" ON public.menu_products;
CREATE POLICY "Manage menu_products" ON public.menu_products
FOR ALL USING (is_admin() OR owns_pizzeria(auth.uid(), pizzeria_id));

-- Extras
DROP POLICY IF EXISTS "Manage menu_extras" ON public.menu_extras;
CREATE POLICY "Manage menu_extras" ON public.menu_extras
FOR ALL USING (is_admin() OR owns_pizzeria(auth.uid(), pizzeria_id));

-- Combos
DROP POLICY IF EXISTS "Manage combos" ON public.combos;
CREATE POLICY "Manage combos" ON public.combos
FOR ALL USING (is_admin() OR owns_pizzeria(auth.uid(), pizzeria_id));

-- Combo Items
DROP POLICY IF EXISTS "Manage combo_items" ON public.combo_items;
CREATE POLICY "Manage combo_items" ON public.combo_items
FOR ALL USING (
  is_admin() OR 
  EXISTS (
    SELECT 1 FROM public.combos c 
    WHERE c.id = combo_items.combo_id AND owns_pizzeria(auth.uid(), c.pizzeria_id)
  )
);

-- Pizza Sizes
DROP POLICY IF EXISTS "Manage pizza_sizes" ON public.pizzeria_pizza_sizes;
CREATE POLICY "Manage pizza_sizes" ON public.pizzeria_pizza_sizes
FOR ALL USING (is_admin() OR owns_pizzeria(auth.uid(), pizzeria_id));

-- Order Items
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

-- Table Session Orders
DROP POLICY IF EXISTS "Manage session_orders" ON public.table_session_orders;
CREATE POLICY "Manage session_orders" ON public.table_session_orders
FOR ALL USING (
  is_admin() OR 
  EXISTS (
    SELECT 1 FROM public.table_sessions s
    JOIN public.pizzerias p ON p.id = s.restaurant_id
    WHERE s.id = table_session_orders.session_id AND p.owner_id = auth.uid()
  )
);
