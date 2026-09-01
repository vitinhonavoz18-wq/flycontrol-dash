-- Check if is_admin exists, if not add it
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'profiles' AND column_name = 'is_admin') THEN
        ALTER TABLE public.profiles ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Update potential admins based on existing data or set a default if needed
-- (Usually done manually, but we ensure the structure is there)

-- Helper function to check if a user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- View for financial metrics by pizzeria
CREATE OR REPLACE VIEW public.pizzeria_financial_metrics AS
WITH base_orders AS (
  SELECT 
    tenant_id,
    total,
    created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo' as created_at_br
  FROM public.orders
  WHERE status NOT IN ('cancelado', 'cancelled', 'canceled')
),
daily_metrics AS (
  SELECT 
    tenant_id,
    COALESCE(SUM(total), 0) as revenue_day,
    COUNT(*) as orders_day
  FROM base_orders
  WHERE created_at_br >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')
  GROUP BY tenant_id
),
weekly_metrics AS (
  SELECT 
    tenant_id,
    COALESCE(SUM(total), 0) as revenue_week,
    COUNT(*) as orders_week
  FROM base_orders
  WHERE created_at_br >= date_trunc('week', CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')
  GROUP BY tenant_id
),
monthly_metrics AS (
  SELECT 
    tenant_id,
    COALESCE(SUM(total), 0) as revenue_month,
    COUNT(*) as orders_month
  FROM base_orders
  WHERE created_at_br >= date_trunc('month', CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')
  GROUP BY tenant_id
)
SELECT 
  p.id as pizzeria_id,
  p.name as pizzeria_name,
  p.owner_id,
  COALESCE(dm.revenue_day, 0) as revenue_day,
  COALESCE(dm.orders_day, 0) as orders_day,
  CASE WHEN COALESCE(dm.orders_day, 0) > 0 THEN COALESCE(dm.revenue_day, 0) / dm.orders_day ELSE 0 END as ticket_avg_day,
  COALESCE(wm.revenue_week, 0) as revenue_week,
  COALESCE(wm.orders_week, 0) as orders_week,
  CASE WHEN COALESCE(wm.orders_week, 0) > 0 THEN COALESCE(wm.revenue_week, 0) / wm.orders_week ELSE 0 END as ticket_avg_week,
  COALESCE(mm.revenue_month, 0) as revenue_month,
  COALESCE(mm.orders_month, 0) as orders_month,
  CASE WHEN COALESCE(mm.orders_month, 0) > 0 THEN COALESCE(mm.revenue_month, 0) / mm.orders_month ELSE 0 END as ticket_avg_month
FROM public.pizzerias p
LEFT JOIN daily_metrics dm ON p.id = dm.tenant_id
LEFT JOIN weekly_metrics wm ON p.id = wm.tenant_id
LEFT JOIN monthly_metrics mm ON p.id = mm.tenant_id;

-- Global Admin View (sums everything)
CREATE OR REPLACE VIEW public.admin_global_financial_metrics AS
SELECT 
  SUM(revenue_day) as total_revenue_day,
  SUM(orders_day) as total_orders_day,
  SUM(revenue_week) as total_revenue_week,
  SUM(orders_week) as total_orders_week,
  SUM(revenue_month) as total_revenue_month,
  SUM(orders_month) as total_orders_month
FROM public.pizzeria_financial_metrics;

-- Grant permissions (RLS will be handled by where clauses in the app or by adding RLS to views if supported, 
-- but simpler to use SECURITY DEFINER functions or just standard queries since views in PG 
-- respect underlying table RLS if not careful, but we'll query them specifically)

-- Since views don't have RLS by default in the same way, we can secure them:
ALTER VIEW public.pizzeria_financial_metrics OWNER TO postgres;
ALTER VIEW public.admin_global_financial_metrics OWNER TO postgres;

-- Actually, let's make the view respect RLS by using security_invoker if supported (PG 15+)
-- or just ensure the query in the app filtered by owner_id or is_admin().
-- Most secure is a function:

CREATE OR REPLACE FUNCTION public.get_my_financial_metrics()
RETURNS SETOF public.pizzeria_financial_metrics
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.pizzeria_financial_metrics
  WHERE owner_id = auth.uid() OR public.is_admin();
$$;

CREATE OR REPLACE FUNCTION public.get_admin_global_metrics()
RETURNS SETOF public.admin_global_financial_metrics
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN QUERY SELECT * FROM public.admin_global_financial_metrics;
  ELSE
    RETURN;
  END IF;
END;
$$;
