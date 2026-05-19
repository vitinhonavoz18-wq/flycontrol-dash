-- Create the pizzeria_pizza_sizes table
CREATE TABLE IF NOT EXISTS public.pizzeria_pizza_sizes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pizzeria_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL DEFAULT 0,
    max_flavors INTEGER NOT NULL DEFAULT 1,
    slices INTEGER DEFAULT 8,
    active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    external_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.pizzeria_pizza_sizes ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable all for authenticated users" ON public.pizzeria_pizza_sizes
    FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_pizzeria_pizza_sizes_updated_at
    BEFORE UPDATE ON public.pizzeria_pizza_sizes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
