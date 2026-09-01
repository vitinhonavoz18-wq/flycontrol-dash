-- Update pizzeria_financial_metrics view to exclude 'deleted' status
CREATE OR REPLACE VIEW public.pizzeria_financial_metrics AS
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

-- The admin_global_financial_metrics view depends on pizzeria_financial_metrics, 
-- so it will automatically reflect the changes if it just selects from it.
-- Let's re-verify it just in case.
CREATE OR REPLACE VIEW public.admin_global_financial_metrics AS
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
