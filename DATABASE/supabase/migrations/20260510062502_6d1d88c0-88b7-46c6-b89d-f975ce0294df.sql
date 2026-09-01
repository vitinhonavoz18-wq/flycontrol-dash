DROP POLICY IF EXISTS "Users can view items of their pizzerias' orders" ON public.order_items;

CREATE POLICY "Users can view items of their pizzerias' orders"
ON public.order_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.pizzerias p ON o.tenant_id = p.id
    WHERE o.id = order_items.order_id 
    AND (
      p.owner_id = auth.uid() 
      OR public.is_admin()
      OR (auth.jwt() ->> 'role' = 'service_role')
    )
  )
);