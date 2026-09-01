-- Secure has_role function with correct parameter type
ALTER FUNCTION public.has_role(_user_id uuid, _role app_role) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.has_role(_user_id uuid, _role app_role) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_role(_user_id uuid, _role app_role) TO authenticated, service_role;
