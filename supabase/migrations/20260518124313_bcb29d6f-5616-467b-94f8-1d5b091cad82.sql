-- Menu Categories
CREATE TABLE public.menu_categories (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    pizzeria_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    active BOOLEAN DEFAULT true,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Menu Products (Pizzas, Beverages, etc.)
CREATE TABLE public.menu_products (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    pizzeria_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.menu_categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC NOT NULL DEFAULT 0,
    image_url TEXT,
    active BOOLEAN DEFAULT true,
    available BOOLEAN DEFAULT true,
    product_type TEXT DEFAULT 'standard', -- 'pizza', 'beverage', 'flavor', 'side'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Menu Extras (Bordas, Adicionais)
CREATE TABLE public.menu_extras (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    pizzeria_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC NOT NULL DEFAULT 0,
    active BOOLEAN DEFAULT true,
    extra_type TEXT NOT NULL, -- 'borda', 'adicional'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Combos
CREATE TABLE public.combos (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    pizzeria_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    original_price NUMERIC NOT NULL DEFAULT 0,
    combo_price NUMERIC NOT NULL DEFAULT 0,
    image_url TEXT,
    active BOOLEAN DEFAULT true,
    highlight BOOLEAN DEFAULT false,
    available_days TEXT[], -- Array of days
    start_time TIME,
    end_time TIME,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Combo Items
CREATE TABLE public.combo_items (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    combo_id UUID NOT NULL REFERENCES public.combos(id) ON DELETE CASCADE,
    product_type TEXT,
    product_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combo_items ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Manage menu_categories" ON public.menu_categories
    FOR ALL USING (is_admin() OR owns_pizzeria(auth.uid(), pizzeria_id));

CREATE POLICY "Manage menu_products" ON public.menu_products
    FOR ALL USING (is_admin() OR owns_pizzeria(auth.uid(), pizzeria_id));

CREATE POLICY "Manage menu_extras" ON public.menu_extras
    FOR ALL USING (is_admin() OR owns_pizzeria(auth.uid(), pizzeria_id));

CREATE POLICY "Manage combos" ON public.combos
    FOR ALL USING (is_admin() OR owns_pizzeria(auth.uid(), pizzeria_id));

CREATE POLICY "Manage combo_items" ON public.combo_items
    FOR ALL USING (is_admin() OR EXISTS (
        SELECT 1 FROM public.combos c 
        WHERE c.id = combo_id AND (is_admin() OR owns_pizzeria(auth.uid(), c.pizzeria_id))
    ));

-- Triggers for updated_at
CREATE TRIGGER trg_menu_categories_updated BEFORE UPDATE ON menu_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_menu_products_updated BEFORE UPDATE ON menu_products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_menu_extras_updated BEFORE UPDATE ON menu_extras FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_combos_updated BEFORE UPDATE ON combos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes
CREATE INDEX idx_menu_categories_pizzeria_id ON public.menu_categories(pizzeria_id);
CREATE INDEX idx_menu_products_pizzeria_id ON public.menu_products(pizzeria_id);
CREATE INDEX idx_menu_products_category_id ON public.menu_products(category_id);
CREATE INDEX idx_menu_extras_pizzeria_id ON public.menu_extras(pizzeria_id);
CREATE INDEX idx_combos_pizzeria_id ON public.combos(pizzeria_id);
CREATE INDEX idx_combo_items_combo_id ON public.combo_items(combo_id);
