-- ============================================================================
-- FECHAR AS PORTAS QUE ESTAVAM DESTRANCADAS
-- ============================================================================
--
-- O QUE ESTA MIGRAÇÃO CONSERTA, EM PORTUGUÊS
--
-- Todo site que o cliente abre carrega uma "chave de balcão" (a chave
-- publicável do Supabase). Ela é pública de propósito — está dentro da página,
-- qualquer pessoa consegue ler. Ela sozinha não deveria abrir nada além do que
-- é público mesmo: cardápio, nome da loja, horário.
--
-- Acontece que alguns relatórios e algumas funções do banco estavam com a
-- porta destrancada para essa chave de balcão. Quem soubesse o endereço
-- conseguia ler o faturamento de TODAS as lojas — dia, semana, mês, ticket
-- médio, nome do dono — sem fazer login nenhum.
--
-- É a diferença entre deixar o cardápio no balcão (certo) e deixar o caderno
-- de caixa no balcão junto (errado). Esta migração recolhe o caderno de caixa
-- e o guarda na gaveta do escritório.
--
-- Nada do que o cliente final vê muda. O que muda é quem consegue ver o
-- dinheiro.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. RELATÓRIOS DE FATURAMENTO: só o dono da loja e o administrador
-- ---------------------------------------------------------------------------
--
-- `pizzeria_financial_metrics` é o relatório de faturamento por loja.
-- `admin_global_financial_metrics` soma tudo — é o caixa da plataforma
-- inteira.
--
-- Os dois eram legíveis por qualquer um com a chave de balcão. Agora a própria
-- consulta pergunta quem está olhando: administrador vê tudo, dono vê a loja
-- dele, e quem não fez login não vê nada — a consulta volta vazia, sem erro.
--
-- Volta vazia em vez de dar erro de propósito: uma tela que já existe e passa
-- a receber erro quebra; uma tela que recebe lista vazia continua de pé.

DROP VIEW IF EXISTS public.admin_global_financial_metrics;
DROP VIEW IF EXISTS public.pizzeria_financial_metrics;

CREATE VIEW public.pizzeria_financial_metrics AS
WITH base_orders AS (
  SELECT o.tenant_id,
         o.total,
         ((o.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo') AS created_at_br,
         o.created_at
  FROM public.orders o
  WHERE o.status <> ALL (ARRAY['cancelado', 'cancelled', 'canceled', 'deleted'])
), daily_metrics AS (
  SELECT tenant_id, COALESCE(sum(total), 0) AS revenue_day, count(*) AS orders_day
  FROM base_orders WHERE created_at_br >= CURRENT_DATE GROUP BY tenant_id
), weekly_metrics AS (
  SELECT tenant_id, COALESCE(sum(total), 0) AS revenue_week, count(*) AS orders_week
  FROM base_orders WHERE created_at_br >= date_trunc('week', CURRENT_DATE::timestamptz) GROUP BY tenant_id
), monthly_metrics AS (
  SELECT tenant_id, COALESCE(sum(total), 0) AS revenue_month, count(*) AS orders_month
  FROM base_orders WHERE created_at_br >= date_trunc('month', CURRENT_DATE::timestamptz) GROUP BY tenant_id
), pizzeria_last_order AS (
  SELECT tenant_id, max(created_at) AS last_order_at FROM base_orders GROUP BY tenant_id
)
SELECT p.id AS pizzeria_id,
       p.name AS pizzeria_name,
       p.owner_id,
       p.status,
       COALESCE(dm.revenue_day, 0) AS revenue_day,
       COALESCE(dm.orders_day, 0::bigint) AS orders_day,
       CASE WHEN COALESCE(dm.orders_day, 0::bigint) > 0
            THEN (COALESCE(dm.revenue_day, 0) / dm.orders_day::numeric)::numeric(10,2)
            ELSE 0::numeric END AS ticket_avg_day,
       COALESCE(wm.revenue_week, 0) AS revenue_week,
       COALESCE(wm.orders_week, 0::bigint) AS orders_week,
       CASE WHEN COALESCE(wm.orders_week, 0::bigint) > 0
            THEN (COALESCE(wm.revenue_week, 0) / wm.orders_week::numeric)::numeric(10,2)
            ELSE 0::numeric END AS ticket_avg_week,
       COALESCE(mm.revenue_month, 0) AS revenue_month,
       COALESCE(mm.orders_month, 0::bigint) AS orders_month,
       CASE WHEN COALESCE(mm.orders_month, 0::bigint) > 0
            THEN (COALESCE(mm.revenue_month, 0) / mm.orders_month::numeric)::numeric(10,2)
            ELSE 0::numeric END AS ticket_avg_month,
       plo.last_order_at
FROM public.pizzerias p
  LEFT JOIN daily_metrics dm ON p.id = dm.tenant_id
  LEFT JOIN weekly_metrics wm ON p.id = wm.tenant_id
  LEFT JOIN monthly_metrics mm ON p.id = mm.tenant_id
  LEFT JOIN pizzeria_last_order plo ON p.id = plo.tenant_id
WHERE p.status IS DISTINCT FROM 'deleted'
  -- A tranca. Sem login, `auth.uid()` é nulo e nenhuma linha passa.
  AND (public.is_admin() OR p.owner_id = auth.uid());

COMMENT ON VIEW public.pizzeria_financial_metrics IS
  'Faturamento por loja. Filtra por quem está consultando: admin vê tudo, dono vê a própria loja, anônimo não vê nada.';

CREATE VIEW public.admin_global_financial_metrics AS
SELECT COALESCE(sum(revenue_day), 0) AS total_revenue_day,
       COALESCE(sum(orders_day), 0) AS total_orders_day,
       COALESCE(sum(revenue_week), 0) AS total_revenue_week,
       COALESCE(sum(orders_week), 0) AS total_orders_week,
       COALESCE(sum(revenue_month), 0) AS total_revenue_month,
       COALESCE(sum(orders_month), 0) AS total_orders_month,
       CASE WHEN sum(orders_month) > 0
            THEN (sum(revenue_month) / sum(orders_month))::numeric(10,2)
            ELSE 0::numeric END AS ticket_avg_month
FROM public.pizzeria_financial_metrics
-- O caixa da plataforma inteira é assunto de administrador, e de mais
-- ninguém. Sem esta linha, um dono de loja veria a soma de todas as outras.
WHERE public.is_admin();

COMMENT ON VIEW public.admin_global_financial_metrics IS
  'Caixa somado da plataforma. Só administrador enxerga; para os demais volta vazio.';

-- A chave de balcão perde o acesso a estes dois relatórios de vez. As duas
-- travas juntas (o filtro acima e a permissão aqui) valem mais que uma:
-- se um dia alguém reescrever a consulta e esquecer o filtro, a permissão
-- ainda segura.
REVOKE ALL ON public.pizzeria_financial_metrics FROM anon;
REVOKE ALL ON public.admin_global_financial_metrics FROM anon;
GRANT SELECT ON public.pizzeria_financial_metrics TO authenticated;
GRANT SELECT ON public.admin_global_financial_metrics TO authenticated;
GRANT SELECT ON public.pizzeria_financial_metrics TO service_role;
GRANT SELECT ON public.admin_global_financial_metrics TO service_role;


-- ---------------------------------------------------------------------------
-- 2. TAXA DE CADASTRO JÁ COBRADA: só quem tem a ver com a assinatura
-- ---------------------------------------------------------------------------
--
-- Esta lista diz quais assinaturas já pagaram a taxa de cadastro. É usada na
-- tela de cobrança do próprio cliente e no fechamento de ciclo (servidor).
-- Não é informação para quem passa na rua.

DROP VIEW IF EXISTS public.subscription_setup_fee_charged;

CREATE VIEW public.subscription_setup_fee_charged AS
SELECT i.subscription_id,
       min(i.created_at) AS charged_at
FROM public.invoices i
  JOIN public.invoice_items ii ON ii.invoice_id = i.id
WHERE ii.item_type = 'setup_fee'
  AND i.status <> 'canceled'
  AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.pizzerias p ON p.id = s.company_id
      WHERE s.id = i.subscription_id AND p.owner_id = auth.uid()
    )
  )
GROUP BY i.subscription_id;

COMMENT ON VIEW public.subscription_setup_fee_charged IS
  'Assinaturas que já tiveram a taxa de cadastro faturada. Admin vê todas; dono vê as suas.';

REVOKE ALL ON public.subscription_setup_fee_charged FROM anon;
GRANT SELECT ON public.subscription_setup_fee_charged TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. FUNÇÕES DO BANCO QUE ESTAVAM ABERTAS A QUEM NÃO FEZ LOGIN
-- ---------------------------------------------------------------------------
--
-- Estas funções rodam "com a chave do gerente" (SECURITY DEFINER): por dentro
-- elas enxergam tudo, ignorando as travas normais. Isso é necessário para elas
-- funcionarem — mas então QUEM PODE CHAMÁ-LAS precisa ser conferido na porta.
--
-- Estavam liberadas para a chave de balcão. Uma delas abre ciclo de cobrança;
-- outra matricula empresa no plano CENTS; outra cria mesas. Era como deixar o
-- molho de chaves do gerente pendurado na porta de entrada.

-- Gatilhos do banco (o Postgres chama sozinho — ninguém precisa chamar de
-- fora, então ninguém de fora precisa de permissão).
REVOKE EXECUTE ON FUNCTION public.record_order_usage() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_restaurant_table_defaults() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_order_created_sync_table_session_trigger() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_table_session_totals(uuid) FROM anon, authenticated;

-- Abertura de ciclo de cobrança: é o ato que define por quanto tempo e a que
-- preço o cliente vai ser cobrado. Nunca foi para ser chamado da rua.
REVOKE EXECUTE ON FUNCTION
  public.open_billing_cycle(uuid, timestamptz, bigint, boolean) FROM anon;

CREATE OR REPLACE FUNCTION public.open_billing_cycle(
  p_subscription_id UUID,
  p_cycle_start TIMESTAMPTZ DEFAULT now(),
  p_unit_price_cents BIGINT DEFAULT NULL,
  p_qualified_from_previous BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
  v_price RECORD;
  v_existing UUID;
  v_cycle_id UUID;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_anchor_day INTEGER;
  v_days_next_month INTEGER;
BEGIN
  -- A conferência na porta. O servidor (service_role) e o administrador
  -- passam; qualquer outro é recusado, mesmo tendo conseguido chamar.
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND current_user <> 'service_role'
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Abrir ciclo de cobrança é uma ação restrita.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sub FROM public.subscriptions WHERE id = p_subscription_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assinatura % não encontrada', p_subscription_id;
  END IF;

  SELECT id INTO v_existing
  FROM public.billing_cycles
  WHERE subscription_id = p_subscription_id AND status = 'open'
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_price
  FROM public.plan_price_versions
  WHERE id = v_sub.plan_price_version_id;

  v_start := p_cycle_start;

  v_anchor_day := EXTRACT(DAY FROM v_start)::INTEGER;
  v_days_next_month := EXTRACT(
    DAY FROM (date_trunc('month', v_start) + INTERVAL '2 month' - INTERVAL '1 day')
  )::INTEGER;

  IF v_anchor_day > v_days_next_month THEN
    v_end := date_trunc('month', v_start) + INTERVAL '2 month' - INTERVAL '1 microsecond';
  ELSE
    v_end := v_start + INTERVAL '1 month' - INTERVAL '1 microsecond';
  END IF;

  INSERT INTO public.billing_cycles (
    subscription_id, company_id, cycle_start, cycle_end, status,
    unit_price_cents, promotion_threshold_orders, qualified_from_previous_cycle
  ) VALUES (
    p_subscription_id, v_sub.company_id, v_start, v_end, 'open',
    coalesce(p_unit_price_cents, v_price.default_order_unit_price_cents),
    v_price.promotion_threshold_orders,
    p_qualified_from_previous
  )
  RETURNING id INTO v_cycle_id;

  UPDATE public.subscriptions
  SET current_cycle_id = v_cycle_id, updated_at = now()
  WHERE id = p_subscription_id;

  RETURN v_cycle_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.open_billing_cycle(uuid, timestamptz, bigint, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION
  public.open_billing_cycle(uuid, timestamptz, bigint, boolean) TO authenticated, service_role;

-- Fechamento dos ciclos do clube de fidelidade: quem fecha é o robô diário
-- (service_role), pela função de borda `club-close-cycle`. Ninguém mais.
REVOKE EXECUTE ON FUNCTION public.club_close_due_cycles() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.club_close_cycle(uuid) FROM anon, authenticated;

-- Matrícula de empresa no CENTS: mexe no plano de cobrança de uma empresa.
-- Fica com o administrador e com o servidor.
REVOKE EXECUTE ON FUNCTION public.enroll_company_in_cents(uuid, uuid) FROM anon;

-- Criação das mesas padrão de um restaurante: só o dono daquele restaurante
-- (ou o administrador). Antes, qualquer um criava mesa em loja alheia.
REVOKE EXECUTE ON FUNCTION public.generate_default_restaurant_tables(uuid) FROM anon;

-- Relatórios do FlyDelivery de UMA loja: faturamento, produtos mais vendidos e
-- contagem de clientes novos/recorrentes daquela loja. É informação de dono.
REVOKE EXECUTE ON FUNCTION
  public.flydelivery_store_analytics(uuid, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION
  public.flydelivery_store_customers(uuid, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION
  public.flydelivery_store_top_products(uuid, timestamptz, timestamptz) FROM anon;


-- ---------------------------------------------------------------------------
-- 4. LISTA DE QUEM É ADMINISTRADOR: deixa de ser pública entre usuários
-- ---------------------------------------------------------------------------
--
-- Havia uma regra antiga dizendo "qualquer pessoa logada pode ler a tabela de
-- papéis inteira". Ou seja: qualquer cliente conseguia listar quem são os
-- administradores da plataforma. Não é o fim do mundo, mas é a lista de alvos
-- entregue de graça — como deixar à vista o nome de quem tem a chave do cofre.

DROP POLICY IF EXISTS "user_roles_read_policy" ON public.user_roles;

DROP POLICY IF EXISTS "user_roles_read_self_or_admin" ON public.user_roles;
CREATE POLICY "user_roles_read_self_or_admin" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());


-- ---------------------------------------------------------------------------
-- 5. CAMINHO DE BUSCA FIXO NAS FUNÇÕES QUE RODAM COM A CHAVE DO GERENTE
-- ---------------------------------------------------------------------------
--
-- Detalhe técnico com efeito prático: sem `search_path` fixo, uma função que
-- roda com poderes elevados pode ser enganada a chamar uma tabela falsa
-- plantada por outro usuário do banco. É o golpe do endereço trocado — a
-- entrega sai certa, mas chega no lugar errado. Fixar o caminho fecha isso.

ALTER FUNCTION public.fly_unaccent(text) SET search_path = public;
ALTER FUNCTION public.is_ghost_order(numeric, jsonb, text) SET search_path = public;
ALTER FUNCTION public.billing_cycle_true_count(uuid) SET search_path = public;
ALTER FUNCTION public.is_billable_order_status(text) SET search_path = public;
ALTER FUNCTION public.sync_order_to_table_session_logic(uuid) SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.get_admin_global_metrics() SET search_path = public;
ALTER FUNCTION public.handle_restaurant_table_defaults() SET search_path = public;
ALTER FUNCTION public.generate_restaurant_table_qr_url() SET search_path = public;
ALTER FUNCTION public.generate_default_restaurant_tables(uuid) SET search_path = public;
ALTER FUNCTION public.get_my_financial_metrics() SET search_path = public;
ALTER FUNCTION public.get_pizzerias_ranking(integer) SET search_path = public;
ALTER FUNCTION public.get_dashboard_period_metrics(timestamptz, timestamptz, uuid) SET search_path = public;
ALTER FUNCTION public.check_admin_protection() SET search_path = public;
ALTER FUNCTION public.check_blocked_email_on_signup() SET search_path = public;
ALTER FUNCTION public.handle_updated_at() SET search_path = public;
ALTER FUNCTION public.generate_default_tables() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.recalculate_table_session_totals(uuid) SET search_path = public;
ALTER FUNCTION public.on_order_created_sync_table_session_trigger() SET search_path = public;


-- ---------------------------------------------------------------------------
-- 6. UMA LOJA NÃO ENXERGA A LOJA DA OUTRA
-- ---------------------------------------------------------------------------
--
-- Fechar a porta para quem não fez login (item 3) resolve metade do problema.
-- A outra metade: um cliente logado — dono de uma pizzaria — passava o código
-- da loja do concorrente e recebia o relatório dele. As funções recebiam o
-- código da loja e nunca perguntavam "esta loja é sua?".
--
-- É o porteiro que confere a identidade na entrada mas deixa a pessoa andar
-- por qualquer andar. Agora cada função confere o andar também.

-- Uma pergunta só, usada por todas: "quem está pedindo pode ver esta loja?"
-- Ter um lugar só evita a regra divergir entre uma função e outra.
CREATE OR REPLACE FUNCTION public.pode_ver_loja(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_store_id IS NOT NULL
     AND (public.is_admin() OR public.owns_pizzeria(auth.uid(), p_store_id));
$$;

COMMENT ON FUNCTION public.pode_ver_loja(UUID) IS
  'Responde se quem está consultando pode ver os dados desta loja: administrador, ou o dono dela.';

REVOKE EXECUTE ON FUNCTION public.pode_ver_loja(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.pode_ver_loja(UUID) TO authenticated, service_role;

-- "O servidor está chamando?" — o robô interno (service_role) não tem usuário
-- logado, então não passa pela pergunta acima. Ele é reconhecido aqui.
CREATE OR REPLACE FUNCTION public.e_chamada_do_servidor()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('role', true) = 'service_role'
      OR current_user = 'service_role';
$$;

COMMENT ON FUNCTION public.e_chamada_do_servidor() IS
  'Distingue uma chamada interna do servidor de uma chamada vinda do navegador.';


-- Relatório diário do FlyDelivery de uma loja.
CREATE OR REPLACE FUNCTION public.flydelivery_store_analytics(
  p_store_id uuid,
  p_from timestamptz DEFAULT (now() - '30 days'::interval),
  p_to timestamptz DEFAULT now()
)
RETURNS TABLE(day date, store_views bigint, product_views bigint, add_to_carts bigint,
              checkout_starts bigint, orders_count bigint, revenue numeric, avg_ticket numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  with permitido as (
    select public.pode_ver_loja(p_store_id) as ok
  ),
  ev as (
    select date_trunc('day', created_at)::date as day, event_type
    from public.flydelivery_events, permitido
    where permitido.ok and store_id = p_store_id and created_at between p_from and p_to
  ),
  ord as (
    select date_trunc('day', created_at)::date as day, total
    from public.orders, permitido
    where permitido.ok
      and tenant_id = p_store_id
      and source = 'flydelivery'
      and status not in ('cancelado', 'deleted')
      and created_at between p_from and p_to
  ),
  dias as (
    select day from ev union select day from ord
  )
  select
    d.day,
    coalesce((select count(*) from ev where ev.day = d.day and ev.event_type = 'store_view'), 0),
    coalesce((select count(*) from ev where ev.day = d.day and ev.event_type = 'product_view'), 0),
    coalesce((select count(*) from ev where ev.day = d.day and ev.event_type = 'add_to_cart'), 0),
    coalesce((select count(*) from ev where ev.day = d.day and ev.event_type = 'checkout_start'), 0),
    coalesce((select count(*) from ord where ord.day = d.day), 0),
    coalesce((select sum(total) from ord where ord.day = d.day), 0),
    coalesce((select round(avg(total), 2) from ord where ord.day = d.day), 0)
  from dias d
  order by d.day;
$$;

-- Clientes novos x recorrentes daquela loja.
CREATE OR REPLACE FUNCTION public.flydelivery_store_customers(
  p_store_id uuid,
  p_from timestamptz DEFAULT (now() - '30 days'::interval),
  p_to timestamptz DEFAULT now()
)
RETURNS TABLE(new_customers bigint, returning_customers bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  with permitido as (
    select public.pode_ver_loja(p_store_id) as ok
  ),
  periodo as (
    select distinct customer_id
    from public.orders, permitido
    where permitido.ok
      and tenant_id = p_store_id and source = 'flydelivery'
      and customer_id is not null
      and status not in ('cancelado', 'deleted')
      and created_at between p_from and p_to
  ),
  antes as (
    select distinct customer_id
    from public.orders, permitido
    where permitido.ok
      and tenant_id = p_store_id and source = 'flydelivery'
      and customer_id is not null
      and created_at < p_from
  )
  select
    (select count(*) from periodo p where not exists (select 1 from antes a where a.customer_id = p.customer_id)),
    (select count(*) from periodo p where exists (select 1 from antes a where a.customer_id = p.customer_id));
$$;

-- Produtos mais vendidos daquela loja.
CREATE OR REPLACE FUNCTION public.flydelivery_store_top_products(
  p_store_id uuid,
  p_from timestamptz DEFAULT (now() - '30 days'::interval),
  p_to timestamptz DEFAULT now(),
  p_limit integer DEFAULT 10
)
RETURNS TABLE(product_name text, quantity bigint, revenue numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select
    item->>'name' as product_name,
    sum((item->>'quantity')::bigint) as quantity,
    sum((item->>'total_price')::numeric) as revenue
  from public.orders o
  cross join lateral jsonb_array_elements(o.items) as item
  where public.pode_ver_loja(p_store_id)
    and o.tenant_id = p_store_id
    and o.source = 'flydelivery'
    and o.status not in ('cancelado', 'deleted')
    and o.created_at between p_from and p_to
  group by 1
  order by quantity desc
  limit least(coalesce(p_limit, 10), 50);
$$;

REVOKE EXECUTE ON FUNCTION public.flydelivery_store_analytics(uuid, timestamptz, timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.flydelivery_store_customers(uuid, timestamptz, timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.flydelivery_store_top_products(uuid, timestamptz, timestamptz, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.flydelivery_store_analytics(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.flydelivery_store_customers(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.flydelivery_store_top_products(uuid, timestamptz, timestamptz, integer) TO authenticated, service_role;


-- Criação das 12 mesas padrão: só o dono da loja (ou administrador, ou o
-- servidor durante o cadastro). Antes, qualquer pessoa criava mesa — com QR
-- code válido — dentro da loja de outro.
CREATE OR REPLACE FUNCTION public.generate_default_restaurant_tables(p_restaurant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_slug TEXT;
    v_token TEXT;
    i INT;
BEGIN
    IF NOT (public.e_chamada_do_servidor() OR public.pode_ver_loja(p_restaurant_id)) THEN
      RAISE EXCEPTION 'Você não tem permissão para criar mesas nesta loja.'
        USING ERRCODE = '42501';
    END IF;

    SELECT slug INTO v_slug FROM public.pizzerias WHERE id = p_restaurant_id;

    FOR i IN 1..12 LOOP
        v_token := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
        INSERT INTO public.restaurant_tables (
            restaurant_id, tenant_id, table_number, table_name,
            public_token, qr_code_url, is_active
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
$$;

REVOKE EXECUTE ON FUNCTION public.generate_default_restaurant_tables(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.generate_default_restaurant_tables(uuid) TO authenticated, service_role;


-- Matrícula no CENTS muda o plano de cobrança de uma empresa. Só o
-- administrador (pelo painel) ou o próprio servidor (durante o cadastro).
CREATE OR REPLACE FUNCTION public.enroll_company_in_cents(
  p_company_id uuid,
  p_club_id uuid DEFAULT '00000000-0000-0000-0000-0000000000c1'::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.e_chamada_do_servidor() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Matricular uma empresa no CENTS é uma ação restrita.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.club_get_or_create_active_cycle(p_company_id, p_club_id);
  PERFORM public.club_recalculate_level(p_company_id, p_club_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enroll_company_in_cents(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.enroll_company_in_cents(uuid, uuid) TO authenticated, service_role;
