-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_pizzerias_status ON public.pizzerias(status);
CREATE INDEX IF NOT EXISTS idx_menu_categories_active ON public.menu_categories(active);
CREATE INDEX IF NOT EXISTS idx_menu_products_active ON public.menu_products(active);
CREATE INDEX IF NOT EXISTS idx_menu_extras_active ON public.menu_extras(active);
CREATE INDEX IF NOT EXISTS idx_combos_active ON public.combos(active);

-- Public SELECT policies (allows anonymous users to see the menu)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pizzerias_public_select' AND tablename = 'pizzerias') THEN
        CREATE POLICY "pizzerias_public_select" ON public.pizzerias FOR SELECT USING (status = 'active');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'menu_categories_public_select' AND tablename = 'menu_categories') THEN
        CREATE POLICY "menu_categories_public_select" ON public.menu_categories FOR SELECT USING (active = true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'menu_products_public_select' AND tablename = 'menu_products') THEN
        CREATE POLICY "menu_products_public_select" ON public.menu_products FOR SELECT USING (active = true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'menu_extras_public_select' AND tablename = 'menu_extras') THEN
        CREATE POLICY "menu_extras_public_select" ON public.menu_extras FOR SELECT USING (active = true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'combos_public_select' AND tablename = 'combos') THEN
        CREATE POLICY "combos_public_select" ON public.combos FOR SELECT USING (active = true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'combo_items_public_select' AND tablename = 'combo_items') THEN
        CREATE POLICY "combo_items_public_select" ON public.combo_items FOR SELECT USING (EXISTS (
            SELECT 1 FROM public.combos c
            WHERE c.id = combo_id AND c.active = true
        ));
    END IF;
END $$;
