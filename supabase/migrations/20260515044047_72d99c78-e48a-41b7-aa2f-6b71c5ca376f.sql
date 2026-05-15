-- Drop dependent functions first
DROP FUNCTION IF EXISTS public.get_admin_global_metrics();
DROP FUNCTION IF EXISTS public.get_my_financial_metrics();

-- Drop existing views with CASCADE to update them
DROP VIEW IF EXISTS public.admin_global_financial_metrics CASCADE;
DROP VIEW IF EXISTS public.pizzeria_financial_metrics CASCADE;

-- Recreate pizzeria_financial_metrics with status and last order
CREATE OR REPLACE VIEW public.pizzeria_financial_metrics AS
WITH base_orders AS (
  SELECT 
    tenant_id, 
    total, 
    created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo' as created_at_br,
    created_at
  FROM orders
  WHERE status NOT IN ('cancelado', 'cancelled', 'canceled')
),
daily_metrics AS (
  SELECT 
    tenant_id, 
    COALESCE(SUM(total), 0) as revenue_day,
    COUNT(*) as orders_day,
    MAX(created_at) as last_order_at
  FROM base_orders
  WHERE created_at_br >= CURRENT_DATE
  GROUP BY tenant_id
),
weekly_metrics AS (
  SELECT 
    tenant_id, 
    COALESCE(SUM(total), 0) as revenue_week,
    COUNT(*) as orders_week
  FROM base_orders
  WHERE created_at_br >= date_trunc('week', CURRENT_DATE)
  GROUP BY tenant_id
),
monthly_metrics AS (
  SELECT 
    tenant_id, 
    COALESCE(SUM(total), 0) as revenue_month,
    COUNT(*) as orders_month
  FROM base_orders
  WHERE created_at_br >= date_trunc('month', CURRENT_DATE)
  GROUP BY tenant_id
),
pizzeria_last_order AS (
  SELECT tenant_id, MAX(created_at) as last_order_at
  FROM base_orders
  GROUP BY tenant_id
)
SELECT 
  p.id as pizzeria_id,
  p.name as pizzeria_name,
  p.owner_id,
  p.status,
  COALESCE(dm.revenue_day, 0) as revenue_day,
  COALESCE(dm.orders_day, 0) as orders_day,
  CASE WHEN COALESCE(dm.orders_day, 0) > 0 THEN (COALESCE(dm.revenue_day, 0) / dm.orders_day)::numeric(10,2) ELSE 0 END as ticket_avg_day,
  COALESCE(wm.revenue_week, 0) as revenue_week,
  COALESCE(wm.orders_week, 0) as orders_week,
  CASE WHEN COALESCE(wm.orders_week, 0) > 0 THEN (COALESCE(wm.revenue_week, 0) / wm.orders_week)::numeric(10,2) ELSE 0 END as ticket_avg_week,
  COALESCE(mm.revenue_month, 0) as revenue_month,
  COALESCE(mm.orders_month, 0) as orders_month,
  CASE WHEN COALESCE(mm.orders_month, 0) > 0 THEN (COALESCE(mm.revenue_month, 0) / mm.orders_month)::numeric(10,2) ELSE 0 END as ticket_avg_month,
  plo.last_order_at
FROM pizzerias p
LEFT JOIN daily_metrics dm ON p.id = dm.tenant_id
LEFT JOIN weekly_metrics wm ON p.id = wm.tenant_id
LEFT JOIN monthly_metrics mm ON p.id = mm.tenant_id
LEFT JOIN pizzeria_last_order plo ON p.id = plo.tenant_id;

-- Recreate admin_global_financial_metrics
CREATE OR REPLACE VIEW public.admin_global_financial_metrics AS
SELECT 
  COALESCE(SUM(revenue_day), 0) as total_revenue_day,
  COALESCE(SUM(orders_day), 0) as total_orders_day,
  COALESCE(SUM(revenue_week), 0) as total_revenue_week,
  COALESCE(SUM(orders_week), 0) as total_orders_week,
  COALESCE(SUM(revenue_month), 0) as total_revenue_month,
  COALESCE(SUM(orders_month), 0) as total_orders_month,
  CASE WHEN SUM(orders_month) > 0 THEN (SUM(revenue_month) / SUM(orders_month))::numeric(10,2) ELSE 0 END as ticket_avg_month
FROM public.pizzeria_financial_metrics;

-- Recreate helper functions
CREATE OR REPLACE FUNCTION public.get_admin_global_metrics()
RETURNS SETOF public.admin_global_financial_metrics
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN QUERY SELECT * FROM public.admin_global_financial_metrics;
  ELSE
    RETURN;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_financial_metrics()
RETURNS SETOF public.pizzeria_financial_metrics
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.pizzeria_financial_metrics
  WHERE owner_id = auth.uid() OR public.is_admin();
END;
$$;

-- Create function for ranking
CREATE OR REPLACE FUNCTION public.get_pizzerias_ranking(p_limit integer DEFAULT 5)
RETURNS TABLE (
  pizzeria_name text,
  revenue_month numeric,
  orders_month bigint,
  revenue_day numeric,
  orders_day bigint
) 
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    pfm.pizzeria_name,
    pfm.revenue_month,
    pfm.orders_month,
    pfm.revenue_day,
    pfm.orders_day
  FROM public.pizzeria_financial_metrics pfm
  ORDER BY pfm.revenue_month DESC
  LIMIT p_limit;
END;
$$;

-- Create function for custom period metrics
CREATE OR REPLACE FUNCTION public.get_dashboard_period_metrics(
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone,
  p_pizzeria_id uuid DEFAULT NULL
)
RETURNS TABLE (
  pizzeria_id uuid,
  pizzeria_name text,
  revenue numeric,
  orders_count bigint,
  ticket_avg numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as pizzeria_id,
    p.name as pizzeria_name,
    COALESCE(SUM(o.total), 0) as revenue,
    COUNT(o.id) as orders_count,
    CASE WHEN COUNT(o.id) > 0 THEN (COALESCE(SUM(o.total), 0) / COUNT(o.id))::numeric(10,2) ELSE 0 END as ticket_avg
  FROM pizzerias p
  LEFT JOIN orders o ON p.id = o.tenant_id 
    AND o.created_at >= p_start_date 
    AND o.created_at <= p_end_date
    AND o.status NOT IN ('cancelado', 'cancelled', 'canceled')
  WHERE (p_pizzeria_id IS NULL OR p.id = p_pizzeria_id)
    AND (public.is_admin() OR p.owner_id = auth.uid())
  GROUP BY p.id, p.name;
END;
$$;
