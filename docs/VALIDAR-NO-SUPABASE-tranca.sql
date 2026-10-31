-- ============================================================================
-- VALIDAÇÃO da trava de segurança (migração 20261022160000) — SÓ CONFERE
-- ============================================================================
--
-- O que este arquivo faz: confere, perfil por perfil, o que cada um consegue
-- fazer no banco — visitante sem login, conta logada qualquer, lojista,
-- administrador e servidor. Devolve uma tabela com "esperado", "obtido" e
-- "ok".
--
-- O que ele NÃO faz:
--   - não grava nada: tudo roda dentro de BEGIN ... ROLLBACK. A única coisa
--     criada é uma função temporária (pg_temp), que some no ROLLBACK;
--   - não chama nenhuma função que grava se a trava ainda NÃO estiver
--     aplicada. Antes da trava, a fila do WhatsApp marcaria mensagens ao ser
--     lida, e a inscrição no CENTS criaria ciclo. Por isso essas duas só são
--     chamadas quando a própria função já tem a conferência de dono — e aí ela
--     recusa antes de gravar;
--   - não mostra nenhum dado de loja ou cliente: só contagens e "barrado".
--
-- Como usar: Supabase > SQL Editor > colar tudo > Run. Rode ANTES da trava
-- (a coluna "ok" mostra o que está exposto) e DEPOIS (tudo deve dar ok).
-- ============================================================================

BEGIN;

-- Roda uma consulta "na pele" de um papel e devolve o primeiro valor ou
-- 'barrado' quando o banco recusa. Volta ao papel original no final.
CREATE FUNCTION pg_temp.como(papel text, usuario uuid, consulta text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', usuario, 'role', papel)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', papel);
  EXECUTE consulta INTO v;
  RESET ROLE;
  RETURN coalesce(v, '(vazio)');
EXCEPTION WHEN others THEN
  RESET ROLE;
  RETURN 'barrado';
END $$;

WITH
ref AS (
  SELECT
    -- uma conta logada que não é dona de nada (identificador inventado)
    '00000000-0000-4000-8000-000000000001'::uuid AS estranho,
    (SELECT owner_id FROM public.pizzerias
      WHERE owner_id IS NOT NULL AND status IS DISTINCT FROM 'deleted'
      ORDER BY id LIMIT 1) AS dono,
    (SELECT user_id FROM public.user_roles
      WHERE role::text = 'super_admin' ORDER BY user_id LIMIT 1) AS admin
),
esperado AS (
  SELECT
    (SELECT count(*) FROM public.pizzerias p, ref
      WHERE p.owner_id = ref.dono AND p.status IS DISTINCT FROM 'deleted') AS lojas_do_dono,
    (SELECT count(*) FROM public.pizzerias WHERE status IS DISTINCT FROM 'deleted') AS lojas_todas,
    (SELECT prosrc LIKE '%acesso_negado%' FROM pg_proc
      WHERE oid = 'public.enroll_company_in_cents(uuid,uuid)'::regprocedure) AS cents_tem_portaria,
    (SELECT prosrc LIKE '%acesso_negado%' FROM pg_proc
      WHERE oid = 'public.generate_default_restaurant_tables(uuid)'::regprocedure) AS mesas_tem_portaria
),
funcoes_do_servidor(assinatura) AS (VALUES
  ('public.crm_next_outbox(uuid,integer,text,integer)'),
  ('public.crm_receive_message(uuid,text,text,text,text,text,text,boolean)'),
  ('public.crm_attach_media(uuid,text,text,text,text)'),
  ('public.crm_rename_customer(uuid,uuid,text,text)'),
  ('public.club_close_cycle(uuid)'),
  ('public.club_close_due_cycles()'),
  ('public.club_check_achievements(uuid,uuid)'),
  ('public.club_get_or_create_active_cycle(uuid,uuid)'),
  ('public.club_recalculate_level(uuid,uuid)'),
  ('public.club_resolve_price(uuid,uuid)'),
  ('public.flycourier_purge_old_locations(integer)'),
  ('public.expire_stale_checkout_intents()'),
  ('public.recalculate_table_session_totals(uuid)'),
  ('public.sync_order_to_table_session_logic(uuid)')
),
checagens(ordem, perfil, checagem, esperado, obtido) AS (
  -- VISITANTE SEM LOGIN ------------------------------------------------------
  SELECT 10, 'visitante', 'não executa função do servidor: ' || split_part(assinatura, '(', 1),
         'false', has_function_privilege('anon', assinatura, 'EXECUTE')::text
    FROM funcoes_do_servidor
  UNION ALL
  SELECT 20, 'visitante', 'não lê faturamento por loja', 'barrado',
         pg_temp.como('anon', NULL, 'select count(*)::text from public.pizzeria_financial_metrics')
  UNION ALL
  SELECT 21, 'visitante', 'não lê faturamento da plataforma', 'barrado',
         pg_temp.como('anon', NULL, 'select count(*)::text from public.admin_global_financial_metrics')
  UNION ALL
  SELECT 22, 'visitante', 'não lê taxas de adesão', 'barrado',
         pg_temp.como('anon', NULL, 'select count(*)::text from public.subscription_setup_fee_charged')
  UNION ALL
  SELECT 23, 'visitante', 'não lê senha das comandas', 'barrado',
         pg_temp.como('anon', NULL, 'select count(customer_token)::text from public.table_sessions')
  UNION ALL
  SELECT 24, 'visitante', 'não chama inscrição no CENTS', 'false',
         has_function_privilege('anon', 'public.enroll_company_in_cents(uuid,uuid)', 'EXECUTE')::text
  UNION ALL
  SELECT 25, 'visitante', 'não chama criação de mesas', 'false',
         has_function_privilege('anon', 'public.generate_default_restaurant_tables(uuid)', 'EXECUTE')::text
  UNION ALL
  SELECT 26, 'visitante', 'continua vendo o status das comandas (portal do garçom)', 'ok',
         CASE WHEN pg_temp.como('anon', NULL, 'select count(status)::text from public.table_sessions') <> 'barrado'
              THEN 'ok' ELSE 'barrado' END
  -- CONTA LOGADA QUALQUER (não é dona de nada) --------------------------------
  UNION ALL
  SELECT 30, 'conta qualquer', 'não executa a fila do WhatsApp', 'false',
         has_function_privilege('authenticated', 'public.crm_next_outbox(uuid,integer,text,integer)', 'EXECUTE')::text
  UNION ALL
  SELECT 31, 'conta qualquer', 'vê 0 lojas no faturamento', '0',
         pg_temp.como('authenticated', ref.estranho, 'select count(*)::text from public.pizzeria_financial_metrics') FROM ref
  UNION ALL
  SELECT 32, 'conta qualquer', 'não lê papéis de outros usuários', '0',
         pg_temp.como('authenticated', ref.estranho, 'select count(*)::text from public.user_roles') FROM ref
  UNION ALL
  SELECT 33, 'conta qualquer', 'não vê tamanhos de pizza de outras lojas', '0',
         pg_temp.como('authenticated', ref.estranho, 'select count(*)::text from public.pizzeria_pizza_sizes') FROM ref
  UNION ALL
  SELECT 34, 'conta qualquer', 'não lê senha de comandas', '0',
         pg_temp.como('authenticated', ref.estranho, 'select count(customer_token)::text from public.table_sessions') FROM ref
  UNION ALL
  SELECT 35, 'conta qualquer', 'inscrição no CENTS recusada',
         'barrado',
         CASE WHEN e.cents_tem_portaria
              THEN pg_temp.como('authenticated', ref.estranho,
                     'select public.enroll_company_in_cents(''00000000-0000-4000-8000-000000000002'')::text')
              ELSE 'sem portaria (não chamado)' END
    FROM ref, esperado e
  UNION ALL
  SELECT 36, 'conta qualquer', 'criação de mesas em loja alheia recusada',
         'barrado',
         CASE WHEN e.mesas_tem_portaria
              THEN pg_temp.como('authenticated', ref.estranho,
                     'select public.generate_default_restaurant_tables(''00000000-0000-4000-8000-000000000002'')::text')
              ELSE 'sem portaria (não chamado)' END
    FROM ref, esperado e
  -- LOJISTA --------------------------------------------------------------------
  UNION ALL
  SELECT 40, 'lojista', 'vê o faturamento só das próprias lojas', e.lojas_do_dono::text,
         pg_temp.como('authenticated', ref.dono, 'select count(*)::text from public.pizzeria_financial_metrics')
    FROM ref, esperado e
  UNION ALL
  SELECT 41, 'lojista', 'continua lendo o próprio papel', 'ok',
         CASE WHEN pg_temp.como('authenticated', ref.dono, 'select count(*)::text from public.user_roles') IN ('0', 'barrado')
              THEN 'falhou' ELSE 'ok' END FROM ref
  -- ADMINISTRADOR --------------------------------------------------------------
  UNION ALL
  SELECT 50, 'administrador', 'vê o faturamento de todas as lojas', e.lojas_todas::text,
         pg_temp.como('authenticated', ref.admin, 'select count(*)::text from public.pizzeria_financial_metrics')
    FROM ref, esperado e
  UNION ALL
  SELECT 51, 'administrador', 'continua podendo chamar a inscrição no CENTS', 'true',
         has_function_privilege('authenticated', 'public.enroll_company_in_cents(uuid,uuid)', 'EXECUTE')::text
  -- SERVIDOR -------------------------------------------------------------------
  UNION ALL
  SELECT 60, 'servidor', 'executa função do servidor: ' || split_part(assinatura, '(', 1),
         'true', has_function_privilege('service_role', assinatura, 'EXECUTE')::text
    FROM funcoes_do_servidor
)
SELECT perfil, checagem, esperado, obtido, (esperado = obtido) AS ok
  FROM checagens
 ORDER BY ok, ordem, checagem;

ROLLBACK;
