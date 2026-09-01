-- Set search_path and refine functions for security
ALTER FUNCTION public.is_admin() SET search_path = public;
ALTER FUNCTION public.owns_pizzeria(uuid, uuid) SET search_path = public;

-- Revoke execute from public to prevent arbitrary calls
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM public;
REVOKE EXECUTE ON FUNCTION public.owns_pizzeria(uuid, uuid) FROM public;

-- Grant execute to authenticated and service_role (needed for RLS)
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_pizzeria(uuid, uuid) TO authenticated, service_role;

-- Refine orders insert policy (Allowing public insert but ensuring tenant_id is provided)
DROP POLICY IF EXISTS "orders_insert_policy" ON public.orders;
CREATE POLICY "orders_insert_policy" 
ON public.orders 
FOR INSERT 
TO public 
WITH CHECK (tenant_id IS NOT NULL);
