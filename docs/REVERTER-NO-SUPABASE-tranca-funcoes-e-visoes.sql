-- ============================================================================
-- REVERSÃO de supabase/migrations/20261022160000_tranca_funcoes_e_visoes_expostas.sql
-- ============================================================================
--
-- Só use se a trava quebrar algo que não deu para corrigir de outro jeito.
-- Isto DEVOLVE as aberturas descritas naquele arquivo (dados de WhatsApp,
-- faturamento de todas as lojas etc. voltam a ficar expostos). Prefira
-- corrigir o ponto específico que quebrou.
--
-- Como usar: Supabase > SQL Editor > colar tudo > Run.
-- Conferido contra docs/backup/FOTOGRAFIA-ANTES-DA-TRANCA-2026-10-22.md:
-- depois de rodar, as permissões voltam a ser exatamente as daquele arquivo.

BEGIN;
-- ============================================================================

-- 1. Funções de servidor voltam a aceitar chamada pública.
GRANT EXECUTE ON FUNCTION public.crm_next_outbox(uuid, integer, text, integer) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_receive_message(uuid, text, text, text, text, text, text, boolean) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_attach_media(uuid, text, text, text, text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_rename_customer(uuid, uuid, text, text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_close_cycle(uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_close_due_cycles() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_check_achievements(uuid, uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_get_or_create_active_cycle(uuid, uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_recalculate_level(uuid, uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_resolve_price(uuid, uuid) TO PUBLIC, anon, authenticated;
-- Esta já não tinha permissão própria para anon/authenticated antes da trava:
-- o acesso vinha só de PUBLIC (fotografia de 22/10/2026).
GRANT EXECUTE ON FUNCTION public.flycourier_purge_old_locations(integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_checkout_intents() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_table_session_totals(uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_order_to_table_session_logic(uuid) TO PUBLIC, anon, authenticated;

-- 2. Corpos originais, sem a conferência de dono/administrador.
CREATE OR REPLACE FUNCTION public.enroll_company_in_cents(
  p_company_id uuid,
  p_club_id uuid DEFAULT '00000000-0000-0000-0000-0000000000c1'::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.club_get_or_create_active_cycle(p_company_id, p_club_id);
  PERFORM public.club_recalculate_level(p_company_id, p_club_id);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.enroll_company_in_cents(uuid, uuid) TO PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.generate_default_restaurant_tables(p_restaurant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_slug TEXT;
    v_token TEXT;
    i INT;
BEGIN
    SELECT slug INTO v_slug FROM public.pizzerias WHERE id = p_restaurant_id;

    FOR i IN 1..12 LOOP
        v_token := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
        INSERT INTO public.restaurant_tables (
            restaurant_id, tenant_id, table_number, table_name,
            public_token, qr_code_url, is_active
        ) VALUES (
            p_restaurant_id, p_restaurant_id,
            LPAD(i::text, 2, '0'),
            'Mesa ' || LPAD(i::text, 2, '0'),
            v_token,
            'https://conectfly.com.br/' || COALESCE(v_slug, 'restaurante') || '?mode=table&table_token=' || v_token,
            true
        ) ON CONFLICT DO NOTHING;
    END LOOP;
END;
$function$;
ALTER FUNCTION public.generate_default_restaurant_tables(uuid) RESET search_path;
GRANT EXECUTE ON FUNCTION public.generate_default_restaurant_tables(uuid) TO PUBLIC, anon, authenticated;

-- 3. Relatórios voltam a usar a chave mestra.
ALTER VIEW public.pizzeria_financial_metrics RESET (security_invoker);
ALTER VIEW public.admin_global_financial_metrics RESET (security_invoker);
-- Antes da trava, anon tinha TODAS as permissões nas três visões
-- (arwdDxtm na fotografia de 22/10/2026), não só leitura.
GRANT ALL ON public.pizzeria_financial_metrics TO anon;
GRANT ALL ON public.admin_global_financial_metrics TO anon;
GRANT ALL ON public.subscription_setup_fee_charged TO anon;

-- 4. Regras de acesso antigas.
CREATE POLICY "Enable all for authenticated users" ON public.pizzeria_pizza_sizes
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "user_roles_read_policy" ON public.user_roles
  FOR SELECT TO authenticated USING (true);
ALTER POLICY "Public can read session lifecycle" ON public.table_sessions TO anon, authenticated;

COMMIT;
