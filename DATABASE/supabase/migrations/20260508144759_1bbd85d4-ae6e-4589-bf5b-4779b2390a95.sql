-- Revogar acesso público às funções SECURITY DEFINER com argumentos corretos
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.owns_pizzeria(uuid, uuid) FROM PUBLIC;
