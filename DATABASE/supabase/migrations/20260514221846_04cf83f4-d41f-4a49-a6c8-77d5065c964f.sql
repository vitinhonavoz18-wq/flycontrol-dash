-- Fix function search path and execution permissions
ALTER FUNCTION public.is_admin() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role; -- Internal helper

ALTER FUNCTION public.get_my_financial_metrics() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.get_my_financial_metrics() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_financial_metrics() TO authenticated;

ALTER FUNCTION public.get_admin_global_metrics() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.get_admin_global_metrics() FROM public;
GRANT EXECUTE ON FUNCTION public.get_admin_global_metrics() TO authenticated;
