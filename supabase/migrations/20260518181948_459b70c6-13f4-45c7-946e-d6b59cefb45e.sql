-- Add missing columns to order_items
ALTER TABLE public.order_items 
ADD COLUMN IF NOT EXISTS product_type TEXT,
ADD COLUMN IF NOT EXISTS total_price NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS observations TEXT,
ADD COLUMN IF NOT EXISTS pizzeria_id UUID REFERENCES public.pizzerias(id),
ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) DEFAULT 0;

-- Rename price to unit_price in order_items if it exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'price') THEN
    ALTER TABLE public.order_items RENAME COLUMN price TO unit_price;
  END IF;
END $$;

-- Ensure orders has discount column
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) DEFAULT 0;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_pizzeria_id ON public.order_items(pizzeria_id);
