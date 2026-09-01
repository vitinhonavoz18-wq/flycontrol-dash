-- Corrigir search_path das funções para aumentar segurança
ALTER FUNCTION public.has_role(uuid, app_role) SET search_path = public;
ALTER FUNCTION public.owns_pizzeria(uuid, uuid) SET search_path = public;

-- Garantir que a coluna status tem um valor padrão para evitar erros de inserção
ALTER TABLE public.pizzerias ALTER COLUMN status SET DEFAULT 'active';

-- Revogar execução pública para funções sensíveis (boas práticas)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.owns_pizzeria(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_pizzeria(uuid, uuid) TO authenticated, service_role;
