-- Allow public insertion of order items (the API handles validation)
CREATE POLICY "Public can insert order items" 
ON public.order_items 
FOR INSERT 
WITH CHECK (true);

-- Allow public selection of order items (needed for printing/details)
CREATE POLICY "Public can view order items" 
ON public.order_items 
FOR SELECT 
USING (true);

-- Allow public insertion of logs (the API handles validation)
CREATE POLICY "Public can insert external logs" 
ON public.external_order_logs 
FOR INSERT 
WITH CHECK (true);
