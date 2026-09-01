-- Restore automatic recalculation of table session totals when orders change after creation.
-- Previously only AFTER INSERT on orders triggered sync+recalc; UPDATE/DELETE went unobserved,
-- so open-table totals diverged whenever an order's total/status changed or an order was removed.

CREATE OR REPLACE FUNCTION public.on_order_change_recalc_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_order_id uuid;
BEGIN
  v_order_id := COALESCE(NEW.id, OLD.id);

  SELECT table_session_id INTO v_session_id
  FROM public.table_session_orders
  WHERE order_id = v_order_id
  LIMIT 1;

  IF v_session_id IS NOT NULL THEN
    PERFORM public.recalculate_table_session_totals(v_session_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tr_order_change_recalc_session ON public.orders;
CREATE TRIGGER tr_order_change_recalc_session
AFTER UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.on_order_change_recalc_session();

-- Also recalc when an order is linked to a session after the fact (e.g., manual sync endpoint).
CREATE OR REPLACE FUNCTION public.on_table_session_order_change_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalculate_table_session_totals(COALESCE(NEW.table_session_id, OLD.table_session_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tr_table_session_orders_recalc ON public.table_session_orders;
CREATE TRIGGER tr_table_session_orders_recalc
AFTER INSERT OR DELETE ON public.table_session_orders
FOR EACH ROW EXECUTE FUNCTION public.on_table_session_order_change_recalc();