-- DESFAZER a Etapa 2 da auditoria (20260901121000_trancar_funcoes_privilegiadas.sql).
--
-- ESTE ARQUIVO NÃO É UMA MIGRATION. Ele mora fora de supabase/migrations/ de
-- propósito: nada aqui roda sozinho.
--
-- Rodar isto devolve as funções do Clube CENTS ao estado em que qualquer
-- pessoa na internet podia chamá-las — inclusive fechar o ciclo de cobrança de
-- todas as empresas. É a reabertura da falha SEC-07.
--
-- A parte do `search_path` (SEC-17) não é desfeita aqui de propósito: ela não
-- muda comportamento nenhum, então não há motivo para reverter. Se ainda assim
-- for preciso, o comando é `ALTER FUNCTION ... RESET search_path`.
--
-- Nenhum dado é tocado, nem na ida nem na volta.

GRANT EXECUTE ON FUNCTION public.club_close_due_cycles() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.club_close_cycle(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.club_get_or_create_active_cycle(UUID, UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.club_resolve_price(UUID, UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.club_recalculate_level(UUID, UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.club_check_achievements(UUID, UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_checkout_intents() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.club_on_order_delivered() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.club_audit_admin_change() TO PUBLIC;

-- Devolve a matrícula no clube sem a conferência de administrador, exatamente
-- como estava em 20260721221500_plans_restructure.sql.
CREATE OR REPLACE FUNCTION public.enroll_company_in_cents(
  p_company_id UUID,
  p_club_id UUID DEFAULT '00000000-0000-0000-0000-0000000000c1'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.club_get_or_create_active_cycle(p_company_id, p_club_id);
  PERFORM public.club_recalculate_level(p_company_id, p_club_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.enroll_company_in_cents(UUID, UUID) TO PUBLIC;
