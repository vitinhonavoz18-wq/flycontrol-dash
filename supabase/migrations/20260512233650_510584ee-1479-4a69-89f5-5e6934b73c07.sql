-- Fix handle_new_user security
ALTER FUNCTION public.handle_new_user() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
