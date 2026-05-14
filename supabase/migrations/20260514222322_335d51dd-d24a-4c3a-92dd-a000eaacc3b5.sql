-- Function to get metrics for a specific period grouped by pizzeria
CREATE OR REPLACE FUNCTION public.get_period_metrics(p_start_date timestamp with time zone, p_end_date timestamp with time zone)
RETURNS TABLE (
  pizzeria_id uuid,
  pizzeria_name text,
  owner_id uuid,
  revenue numeric,
  orders_count bigint,
  ticket_avg numeric,
  last_order_at timestamp with time zone,
  status text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin() OR EXISTS (SELECT 1 FROM public.pizzerias WHERE owner_id = auth.uid())) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    p.id as pizzeria_id,
    p.name as pizzeria_name,
    p.owner_id,
    COALESCE(SUM(o.total), 0) as revenue,
    COUNT(o.id) as orders_count,
    CASE WHEN COUNT(o.id) > 0 THEN COALESCE(SUM(o.total), 0) / COUNT(o.id) ELSE 0 END as ticket_avg,
    MAX(o.created_at) as last_order_at,
    p.status
  FROM public.pizzerias p
  LEFT JOIN public.orders o ON p.id = o.tenant_id 
    AND o.created_at >= p_start_date 
    AND o.created_at <= p_end_date
    AND o.status NOT IN ('cancelado', 'cancelled', 'canceled')
  WHERE (public.is_admin() OR p.owner_id = auth.uid())
  GROUP BY p.id, p.name, p.owner_id, p.status;
END;
$$;

-- Function for more detailed summary of a single pizzeria
CREATE OR REPLACE FUNCTION public.get_pizzeria_financial_summary(p_pizzeria_id uuid)
RETURNS TABLE (
  pizzeria_name text,
  revenue_month numeric,
  orders_month bigint,
  best_day_date date,
  best_day_revenue numeric,
  last_order_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT owner_id INTO v_owner_id FROM public.pizzerias WHERE id = p_pizzeria_id;
  
  IF NOT (public.is_admin() OR v_owner_id = auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH month_orders AS (
    SELECT total, created_at, (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date as order_date
    FROM public.orders
    WHERE tenant_id = p_pizzeria_id
      AND created_at >= date_trunc('month', CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')
      AND status NOT IN ('cancelado', 'cancelled', 'canceled')
  ),
  daily_sums AS (
    SELECT order_date, SUM(total) as daily_total
    FROM month_orders
    GROUP BY order_date
  ),
  best_day AS (
    SELECT order_date, daily_total
    FROM daily_sums
    ORDER BY daily_total DESC
    LIMIT 1
  )
  SELECT 
    p.name,
    COALESCE((SELECT SUM(total) FROM month_orders), 0),
    COALESCE((SELECT COUNT(*) FROM month_orders), 0),
    (SELECT order_date FROM best_day),
    (SELECT daily_total FROM best_day),
    (SELECT MAX(created_at) FROM public.orders WHERE tenant_id = p_pizzeria_id)
  FROM public.pizzerias p
  WHERE p.id = p_pizzeria_id;
END;
$$;

-- Grant execution
GRANT EXECUTE ON FUNCTION public.get_period_metrics(timestamp with time zone, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pizzeria_financial_summary(uuid) TO authenticated;
