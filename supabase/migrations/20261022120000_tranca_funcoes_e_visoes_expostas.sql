-- ============================================================================
-- Tranca funções e visões do banco que qualquer visitante conseguia usar.
-- ============================================================================
--
-- O QUE ESTAVA ACONTECENDO
--
-- O Supabase publica toda função do banco como um endereço da internet
-- (/rest/v1/rpc/<nome>). Quem chama esse endereço só precisa da chave PÚBLICA,
-- a mesma que vai dentro do site e qualquer pessoa consegue ler.
--
-- Várias funções que trabalham com a "chave mestra" (SECURITY DEFINER — elas
-- passam por cima das regras de quem pode ver o quê) estavam abertas para
-- esse público. As do Chat tinham sido trancadas na fundação do CRM, mas duas
-- atualizações depois apagaram e recriaram as funções, e a função nova nasce
-- destrancada. É trocar a fechadura da porta e esquecer de passar a chave.
--
-- Na prática, qualquer pessoa com o número de uma loja podia:
--   - pegar as mensagens de WhatsApp que a loja ia mandar aos clientes
--     (telefone + texto) e ainda segurá-las, para que não saíssem;
--   - enfiar mensagens falsas na caixa de entrada do Chat da loja;
--   - fechar antes da hora o ciclo de cobrança do plano CENTS;
--   - apagar o histórico de localização dos entregadores;
--   - criar mesas em loja alheia.
--
-- E duas "visões" (relatórios prontos do banco) mostravam o faturamento de
-- TODAS as lojas e o total da plataforma para quem pedisse, sem login.
--
-- O QUE ESTE ARQUIVO FAZ
--
-- 1. Tira o acesso público das funções que só o servidor usa (o servidor usa
--    a chave de serviço, que continua com acesso).
-- 2. Nas duas funções que o painel chama direto do navegador, coloca a
--    pergunta "você é o dono ou o administrador?" dentro da própria função.
-- 3. Faz os relatórios de faturamento respeitarem as regras normais: cada
--    dono vê só a própria loja; o administrador vê todas.
-- 4. Fecha três regras de acesso largas demais (tamanhos de pizza, papéis dos
--    usuários e comandas das mesas).
--
-- Nada aqui apaga dado. Para desfazer, há um arquivo de reversão em
-- docs/REVERTER-NO-SUPABASE-tranca-funcoes-e-visoes.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Funções que só o servidor (chave de serviço) e o próprio banco usam.
--
-- Quem as chama hoje: as rotas /api/crm/* (servidor), o despertador diário do
-- CENTS (cron, dentro do banco) e gatilhos internos (que rodam como dono do
-- banco). Nenhuma tela do painel chama estas funções direto.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.crm_next_outbox(uuid, integer, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_receive_message(uuid, text, text, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_attach_media(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_rename_customer(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.club_close_cycle(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.club_close_due_cycles() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.club_check_achievements(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.club_get_or_create_active_cycle(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.club_recalculate_level(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.club_resolve_price(uuid, uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.flycourier_purge_old_locations(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_stale_checkout_intents() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculate_table_session_totals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_order_to_table_session_logic(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.crm_next_outbox(uuid, integer, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_receive_message(uuid, text, text, text, text, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_attach_media(uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_rename_customer(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.club_close_cycle(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.club_close_due_cycles() TO service_role;
GRANT EXECUTE ON FUNCTION public.club_check_achievements(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.club_get_or_create_active_cycle(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.club_recalculate_level(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.club_resolve_price(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.flycourier_purge_old_locations(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_checkout_intents() TO service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_table_session_totals(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_order_to_table_session_logic(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 2. Funções que o painel chama do navegador: continuam liberadas para quem
--    está logado, mas agora conferem QUEM está pedindo.
--
-- O corpo é o mesmo de antes; só ganhou a pergunta da portaria no começo.
-- ----------------------------------------------------------------------------

-- Inscrever uma loja no CENTS: só o administrador (tela de Assinaturas) ou o
-- servidor (criação de loja em /api/pizzerias/create).
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
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR public.is_admin()) THEN
    RAISE EXCEPTION 'acesso_negado' USING ERRCODE = '42501';
  END IF;

  PERFORM public.club_get_or_create_active_cycle(p_company_id, p_club_id);
  PERFORM public.club_recalculate_level(p_company_id, p_club_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.enroll_company_in_cents(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enroll_company_in_cents(uuid, uuid) TO authenticated, service_role;

-- Criar as 12 mesas padrão: só o dono daquela loja, o administrador ou o
-- servidor (tela de Mesas, quando a loja ainda não tem nenhuma).
CREATE OR REPLACE FUNCTION public.generate_default_restaurant_tables(p_restaurant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_slug TEXT;
    v_token TEXT;
    i INT;
BEGIN
    IF NOT (
      coalesce(auth.role(), '') = 'service_role'
      OR public.is_admin()
      OR public.owns_pizzeria(auth.uid(), p_restaurant_id)
    ) THEN
      RAISE EXCEPTION 'acesso_negado' USING ERRCODE = '42501';
    END IF;

    SELECT slug INTO v_slug FROM public.pizzerias WHERE id = p_restaurant_id;

    FOR i IN 1..12 LOOP
        v_token := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
        INSERT INTO public.restaurant_tables (
            restaurant_id,
            tenant_id,
            table_number,
            table_name,
            public_token,
            qr_code_url,
            is_active
        ) VALUES (
            p_restaurant_id,
            p_restaurant_id,
            LPAD(i::text, 2, '0'),
            'Mesa ' || LPAD(i::text, 2, '0'),
            v_token,
            'https://conectfly.com.br/' || COALESCE(v_slug, 'restaurante') || '?mode=table&table_token=' || v_token,
            true
        ) ON CONFLICT DO NOTHING;
    END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.generate_default_restaurant_tables(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_default_restaurant_tables(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Relatórios de faturamento passam a obedecer as regras normais.
--
-- `security_invoker = on` quer dizer: o relatório é montado com os olhos de
-- quem pediu, não com a chave mestra. O administrador continua vendo todas as
-- lojas (a regra dos pedidos já libera tudo para ele); um dono vê só a sua;
-- um visitante sem login não vê nada.
-- ----------------------------------------------------------------------------
ALTER VIEW public.pizzeria_financial_metrics SET (security_invoker = on);
ALTER VIEW public.admin_global_financial_metrics SET (security_invoker = on);

REVOKE ALL ON public.pizzeria_financial_metrics FROM anon;
REVOKE ALL ON public.admin_global_financial_metrics FROM anon;
-- Lista de quais assinaturas já pagaram a taxa de adesão: o painel usa só
-- logado, e a cobrança usa a chave de serviço. Visitante não tem o que ver.
REVOKE ALL ON public.subscription_setup_fee_charged FROM anon;

-- ----------------------------------------------------------------------------
-- 4. Regras de acesso largas demais.
-- ----------------------------------------------------------------------------

-- Tamanhos de pizza: a regra "tudo liberado para quem está logado" deixava
-- qualquer conta (o cadastro é aberto) apagar ou mudar o preço dos tamanhos de
-- QUALQUER pizzaria. A regra "Pizza Sizes manage" (dono ou administrador)
-- continua valendo e é a que o painel usa.
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.pizzeria_pizza_sizes;

-- Papéis dos usuários: qualquer conta logada lia a lista inteira de quem é
-- administrador da plataforma. Continua valendo "roles read self or admin":
-- cada um lê o próprio papel (é o que a tela de login usa) e o administrador
-- lê todos.
DROP POLICY IF EXISTS "user_roles_read_policy" ON public.user_roles;

-- Comandas das mesas: a regra de leitura pública valia também para quem está
-- LOGADO, e para logado a tabela entrega a senha da comanda do cliente
-- (customer_token). Com ela, qualquer conta recém-criada podia pedir o
-- fechamento da mesa de outra pessoa. Para visitante sem login a senha já não
-- aparecia (a coluna não é liberada para ele). Dono e administrador continuam
-- vendo as próprias comandas pela regra "sessions_select_policy".
ALTER POLICY "Public can read session lifecycle" ON public.table_sessions TO anon;
