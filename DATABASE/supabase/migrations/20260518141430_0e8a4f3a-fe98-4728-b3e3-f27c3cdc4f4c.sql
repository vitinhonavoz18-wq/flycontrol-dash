-- Refine RLS for menu_categories
DROP POLICY IF EXISTS "menu_categories_public_select" ON public.menu_categories;
CREATE POLICY "menu_categories_public_select" ON public.menu_categories
  FOR SELECT USING (
    active = true AND 
    EXISTS (SELECT 1 FROM public.pizzerias WHERE id = pizzeria_id AND status = 'active')
  );

-- Refine RLS for menu_products
DROP POLICY IF EXISTS "menu_products_public_select" ON public.menu_products;
CREATE POLICY "menu_products_public_select" ON public.menu_products
  FOR SELECT USING (
    active = true AND 
    EXISTS (SELECT 1 FROM public.pizzerias WHERE id = pizzeria_id AND status = 'active')
  );

-- Refine RLS for menu_extras
DROP POLICY IF EXISTS "menu_extras_public_select" ON public.menu_extras;
CREATE POLICY "menu_extras_public_select" ON public.menu_extras
  FOR SELECT USING (
    active = true AND 
    EXISTS (SELECT 1 FROM public.pizzerias WHERE id = pizzeria_id AND status = 'active')
  );

-- Refine RLS for combos
DROP POLICY IF EXISTS "combos_public_select" ON public.combos;
CREATE POLICY "combos_public_select" ON public.combos
  FOR SELECT USING (
    active = true AND 
    EXISTS (SELECT 1 FROM public.pizzerias WHERE id = pizzeria_id AND status = 'active')
  );

-- Refine RLS for combo_items
DROP POLICY IF EXISTS "combo_items_public_select" ON public.combo_items;
CREATE POLICY "combo_items_public_select" ON public.combo_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.combos c
      JOIN public.pizzerias p ON p.id = c.pizzeria_id
      WHERE c.id = combo_items.combo_id 
      AND c.active = true 
      AND p.status = 'active'
    )
  );
