-- Add external synchronization columns to menu_categories
ALTER TABLE public.menu_categories ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE public.menu_categories ADD COLUMN IF NOT EXISTS external_source TEXT;
ALTER TABLE public.menu_categories ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;

-- Add external synchronization columns to menu_products
ALTER TABLE public.menu_products ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE public.menu_products ADD COLUMN IF NOT EXISTS external_source TEXT;
ALTER TABLE public.menu_products ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;

-- Add external synchronization columns to menu_extras
ALTER TABLE public.menu_extras ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE public.menu_extras ADD COLUMN IF NOT EXISTS external_source TEXT;
ALTER TABLE public.menu_extras ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;

-- Add external synchronization columns to combos
ALTER TABLE public.combos ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE public.combos ADD COLUMN IF NOT EXISTS external_source TEXT;
ALTER TABLE public.combos ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_menu_categories_external ON public.menu_categories(external_id, external_source);
CREATE INDEX IF NOT EXISTS idx_menu_products_external ON public.menu_products(external_id, external_source);
CREATE INDEX IF NOT EXISTS idx_menu_extras_external ON public.menu_extras(external_id, external_source);
CREATE INDEX IF NOT EXISTS idx_combos_external ON public.combos(external_id, external_source);