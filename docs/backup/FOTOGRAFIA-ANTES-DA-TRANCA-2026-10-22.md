# Fotografia do banco antes da trava de segurança — 22/10/2026

> **O que é isto.** O "retrato" de tudo que a migração
> `supabase/migrations/20261022120000_tranca_funcoes_e_visoes_expostas.sql`
> vai mudar, tirado do banco de produção (projeto FLYCONTROL,
> `knhenchgntttraaeewlj`) em **22/10/2026, 14:51 UTC**, só com consultas de
> leitura.
>
> Serve para duas coisas:
> 1. provar como o banco estava antes, se alguém perguntar depois;
> 2. conferir que o arquivo de reversão
>    (`docs/REVERTER-NO-SUPABASE-tranca-funcoes-e-visoes.sql`) devolve
>    exatamente este estado.
>
> **Não contém** senha, chave, dado de cliente nem dado de loja — só
> definições (regras, permissões, texto das funções) e contagens de linhas.
>
> Conferência feita: num banco de teste com estas mesmas permissões, aplicar a
> trava e depois a reversão deixou **0 diferenças em 30 itens** (permissões
> das 16 funções, opções e permissões das 3 visões, regras de acesso e texto
> das 2 funções reescritas).

## 1. Permissões das 16 funções

Todas: dono `postgres`, `SECURITY DEFINER` (rodam com a chave mestra).

Leitura do código de permissão: `=X` = qualquer um (PUBLIC) pode executar;
`anon=X` = visitante sem login; `authenticated=X` = qualquer conta logada;
`service_role=X` = o servidor.

| Função | Configuração | Permissões (ACL) |
| --- | --- | --- |
| `club_check_achievements(uuid,uuid)` | `search_path=public` | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `club_close_cycle(uuid)` | `search_path=public` | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `club_close_due_cycles()` | `search_path=public` | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `club_get_or_create_active_cycle(uuid,uuid)` | `search_path=public` | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `club_recalculate_level(uuid,uuid)` | `search_path=public` | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `club_resolve_price(uuid,uuid)` | `search_path=public` | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `crm_attach_media(uuid,text,text,text,text)` | `search_path=public` | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `crm_next_outbox(uuid,integer,text,integer)` | `search_path=public` | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `crm_receive_message(uuid,text,text,text,text,text,text,boolean)` | `search_path=public` | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `crm_rename_customer(uuid,uuid,text,text)` | `search_path=public` | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `enroll_company_in_cents(uuid,uuid)` | `search_path=public` | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `expire_stale_checkout_intents()` | `search_path=public` | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `flycourier_purge_old_locations(integer)` | `search_path=public` | `{=X/postgres,postgres=X/postgres,service_role=X/postgres}` |
| `generate_default_restaurant_tables(uuid)` | (nenhuma) | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `recalculate_table_session_totals(uuid)` | (nenhuma) | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `sync_order_to_table_session_logic(uuid)` | (nenhuma) | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |

Observação: `flycourier_purge_old_locations` não tinha permissão própria para
`anon`/`authenticated`, mas era executável por eles via `PUBLIC` (`=X`).

## 2. Texto integral das 2 funções que a trava reescreve

### `enroll_company_in_cents`

```sql
CREATE OR REPLACE FUNCTION public.enroll_company_in_cents(p_company_id uuid, p_club_id uuid DEFAULT '00000000-0000-0000-0000-0000000000c1'::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.club_get_or_create_active_cycle(p_company_id, p_club_id);
  PERFORM public.club_recalculate_level(p_company_id, p_club_id);
END;
$function$
```

### `generate_default_restaurant_tables`

```sql
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
$function$
```

## 3. As 3 visões (relatórios prontos)

Todas: dono `postgres`, **sem** `security_invoker` (montadas com a chave
mestra).

| Visão | Opções | Permissões (ACL) |
| --- | --- | --- |
| `pizzeria_financial_metrics` | (nenhuma) | `{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` |
| `admin_global_financial_metrics` | (nenhuma) | `{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` |
| `subscription_setup_fee_charged` | (nenhuma) | `{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` |

A trava **não muda o texto** das visões, só as opções e as permissões. Texto
de referência:

<details><summary><code>pizzeria_financial_metrics</code></summary>

```sql
 WITH base_orders AS (
         SELECT orders.tenant_id,
            orders.total,
            ((orders.created_at AT TIME ZONE 'UTC'::text) AT TIME ZONE 'America/Sao_Paulo'::text) AS created_at_br,
            orders.created_at
           FROM orders
          WHERE orders.status <> ALL (ARRAY['cancelado'::text, 'cancelled'::text, 'canceled'::text, 'deleted'::text])
        ), daily_metrics AS (
         SELECT base_orders.tenant_id,
            COALESCE(sum(base_orders.total), 0::numeric) AS revenue_day,
            count(*) AS orders_day,
            max(base_orders.created_at) AS last_order_at
           FROM base_orders
          WHERE base_orders.created_at_br >= CURRENT_DATE
          GROUP BY base_orders.tenant_id
        ), weekly_metrics AS (
         SELECT base_orders.tenant_id,
            COALESCE(sum(base_orders.total), 0::numeric) AS revenue_week,
            count(*) AS orders_week
           FROM base_orders
          WHERE base_orders.created_at_br >= date_trunc('week'::text, CURRENT_DATE::timestamp with time zone)
          GROUP BY base_orders.tenant_id
        ), monthly_metrics AS (
         SELECT base_orders.tenant_id,
            COALESCE(sum(base_orders.total), 0::numeric) AS revenue_month,
            count(*) AS orders_month
           FROM base_orders
          WHERE base_orders.created_at_br >= date_trunc('month'::text, CURRENT_DATE::timestamp with time zone)
          GROUP BY base_orders.tenant_id
        ), pizzeria_last_order AS (
         SELECT base_orders.tenant_id,
            max(base_orders.created_at) AS last_order_at
           FROM base_orders
          GROUP BY base_orders.tenant_id
        )
 SELECT p.id AS pizzeria_id,
    p.name AS pizzeria_name,
    p.owner_id,
    p.status,
    COALESCE(dm.revenue_day, 0::numeric) AS revenue_day,
    COALESCE(dm.orders_day, 0::bigint) AS orders_day,
        CASE
            WHEN COALESCE(dm.orders_day, 0::bigint) > 0 THEN (COALESCE(dm.revenue_day, 0::numeric) / dm.orders_day::numeric)::numeric(10,2)
            ELSE 0::numeric
        END AS ticket_avg_day,
    COALESCE(wm.revenue_week, 0::numeric) AS revenue_week,
    COALESCE(wm.orders_week, 0::bigint) AS orders_week,
        CASE
            WHEN COALESCE(wm.orders_week, 0::bigint) > 0 THEN (COALESCE(wm.revenue_week, 0::numeric) / wm.orders_week::numeric)::numeric(10,2)
            ELSE 0::numeric
        END AS ticket_avg_week,
    COALESCE(mm.revenue_month, 0::numeric) AS revenue_month,
    COALESCE(mm.orders_month, 0::bigint) AS orders_month,
        CASE
            WHEN COALESCE(mm.orders_month, 0::bigint) > 0 THEN (COALESCE(mm.revenue_month, 0::numeric) / mm.orders_month::numeric)::numeric(10,2)
            ELSE 0::numeric
        END AS ticket_avg_month,
    plo.last_order_at
   FROM pizzerias p
     LEFT JOIN daily_metrics dm ON p.id = dm.tenant_id
     LEFT JOIN weekly_metrics wm ON p.id = wm.tenant_id
     LEFT JOIN monthly_metrics mm ON p.id = mm.tenant_id
     LEFT JOIN pizzeria_last_order plo ON p.id = plo.tenant_id
  WHERE p.status IS DISTINCT FROM 'deleted'::text;
```

</details>

<details><summary><code>admin_global_financial_metrics</code></summary>

```sql
 SELECT COALESCE(sum(revenue_day), 0::numeric) AS total_revenue_day,
    COALESCE(sum(orders_day), 0::numeric) AS total_orders_day,
    COALESCE(sum(revenue_week), 0::numeric) AS total_revenue_week,
    COALESCE(sum(orders_week), 0::numeric) AS total_orders_week,
    COALESCE(sum(revenue_month), 0::numeric) AS total_revenue_month,
    COALESCE(sum(orders_month), 0::numeric) AS total_orders_month,
        CASE
            WHEN sum(orders_month) > 0::numeric THEN (sum(revenue_month) / sum(orders_month))::numeric(10,2)
            ELSE 0::numeric
        END AS ticket_avg_month
   FROM pizzeria_financial_metrics;
```

</details>

<details><summary><code>subscription_setup_fee_charged</code></summary>

```sql
 SELECT i.subscription_id,
    min(i.created_at) AS charged_at
   FROM invoices i
     JOIN invoice_items ii ON ii.invoice_id = i.id
  WHERE ii.item_type = 'setup_fee'::text AND i.status <> 'canceled'::text
  GROUP BY i.subscription_id;
```

</details>

## 4. Regras de acesso das 3 tabelas que a trava toca

Marcadas com ➜ as que a trava muda. As demais ficam como estão.

| Tabela / regra | Tipo | Comando | Para quem | Condição |
| --- | --- | --- | --- | --- |
| ➜ `pizzeria_pizza_sizes` / `Enable all for authenticated users` | permissiva | ALL | `{public}` | USING e WITH CHECK: `auth.role() = 'authenticated'` |
| `pizzeria_pizza_sizes` / `Pizza Sizes manage` | permissiva | ALL | `{public}` | USING: `is_admin() OR owns_pizzeria(auth.uid(), pizzeria_id)` |
| ➜ `table_sessions` / `Public can read session lifecycle` | permissiva | SELECT | `{anon,authenticated}` | `true` |
| `table_sessions` / `comandas: do dono da loja, ou do administrador` | permissiva | ALL | `{public}` | `is_admin()` ou dono da loja |
| `table_sessions` / `sessions_select_policy` | permissiva | SELECT | `{public}` | `is_admin()` ou dono da loja |
| `table_sessions` / `table_sessions_plan_gate_insert` / `_update` / `_delete` | restritiva | INSERT / UPDATE / DELETE | `{authenticated}` | `is_admin()` ou loja com plano premium |
| ➜ `user_roles` / `user_roles_read_policy` | permissiva | SELECT | `{authenticated}` | `true` |
| `user_roles` / `Admins can view all roles` | permissiva | SELECT | `{authenticated}` | `is_admin() OR user_id = auth.uid()` |
| `user_roles` / `Users can view their own roles` | permissiva | SELECT | `{authenticated}` | `user_id = auth.uid()` |
| `user_roles` / `roles admin manage` | permissiva | ALL | `{public}` | `has_role(auth.uid(), 'super_admin')` |
| `user_roles` / `roles read self or admin` | permissiva | SELECT | `{public}` | `auth.uid() = user_id OR has_role(auth.uid(), 'super_admin')` |

## 5. Gabarito para conferir o backup

Contagem exata de linhas em 22/10/2026 14:51 UTC. Tabelas que recebem dado
o tempo todo (pedidos, mensagens) podem ter **mais** linhas no backup — nunca
menos.

| Tabela | Linhas |
| --- | ---: |
| `auth.users` | 32 |
| `public.affiliates` | 1 |
| `public.billing_cycles` | 27 |
| `public.club_cycles` | 23 |
| `public.crm_conversations` | 458 |
| `public.crm_messages` | 22.853 |
| `public.inventory_products` | 169 |
| `public.invoices` | 3 |
| `public.marketing_customers` | 627 |
| `public.menu_categories` | 85 |
| `public.menu_products` | 616 |
| `public.order_items` | 545 |
| `public.orders` | 739 |
| `public.payment_transactions` | 1 |
| `public.pizzerias` | 30 |
| `public.restaurant_tables` | 360 |
| `public.subscriptions` | 16 |
| `public.table_sessions` | 2 |
| `public.user_roles` | 32 |
| `public.waiters` | 1 |

## 6. Tamanho e contexto

- Banco inteiro: **52 MB** (tabelas do sistema: 22 MB; logins: 1,8 MB).
  PostgreSQL 17.6. 122 tabelas no esquema `public`.
- Arquivos (fotos do cardápio etc.) **não ficam no banco**: 360 arquivos em
  `menu-images` (~245 MB) e 13 em `status-arts` (~23 MB). A trava não toca
  neles.
- Plano do Supabase: **gratuito** — sem backup automático disponível.
- Histórico de migrações do banco: 177 registros, o último é
  `20261001120000` (`pagamentos_online_mercado_pago`). A trava será
  registrada como `20261022120000`.
