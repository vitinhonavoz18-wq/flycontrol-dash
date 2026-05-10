-- Create order_items table if not exists
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index for API Key performance
CREATE INDEX IF NOT EXISTS idx_pizzerias_api_key ON public.pizzerias(api_key);

-- Enable RLS on order_items
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Basic RLS for order_items (linked to orders)
CREATE POLICY "Users can view items of their pizzerias' orders" 
ON public.order_items 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.orders o
        JOIN public.pizzerias p ON o.tenant_id = p.id
        WHERE o.id = order_items.order_id 
        AND (p.owner_id = auth.uid() OR auth.jwt() ->> 'role' = 'service_role')
    )
);

-- Ensure orders table has common status
-- The orders table already exists with tenant_id, status, etc.
