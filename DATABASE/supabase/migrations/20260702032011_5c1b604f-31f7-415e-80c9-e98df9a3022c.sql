
-- 1) Default waiter por mesa
ALTER TABLE public.restaurant_tables
  ADD COLUMN IF NOT EXISTS default_waiter_id uuid
    REFERENCES public.waiters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_default_waiter
  ON public.restaurant_tables(default_waiter_id);

-- 2) Waiter no pedido (assigned_waiter_id na sessão já existe como waiter_id)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS waiter_id uuid
    REFERENCES public.waiters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_waiter ON public.orders(waiter_id);

-- 3) Herança automática: ao criar uma table_session, se não veio waiter_id,
--    usa o default_waiter_id da mesa correspondente.
CREATE OR REPLACE FUNCTION public.set_table_session_default_waiter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default uuid;
  v_norm text;
BEGIN
  IF NEW.waiter_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_norm := TRIM(LOWER(REPLACE(REPLACE(COALESCE(NEW.table_number,''), 'mesa', ''), ' ', '')));

  SELECT default_waiter_id INTO v_default
  FROM public.restaurant_tables
  WHERE restaurant_id = NEW.restaurant_id
    AND (
      TRIM(LOWER(REPLACE(REPLACE(table_number, 'mesa',''), ' ',''))) = v_norm
      OR table_number = NEW.table_number
    )
    AND default_waiter_id IS NOT NULL
  LIMIT 1;

  IF v_default IS NOT NULL THEN
    NEW.waiter_id := v_default;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_table_session_default_waiter ON public.table_sessions;
CREATE TRIGGER trg_set_table_session_default_waiter
  BEFORE INSERT ON public.table_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_table_session_default_waiter();

-- 4) Stamp orders.waiter_id a partir da sessão ao vincular pedido → sessão.
CREATE OR REPLACE FUNCTION public.stamp_order_waiter_from_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_waiter uuid;
BEGIN
  SELECT waiter_id INTO v_waiter
  FROM public.table_sessions
  WHERE id = NEW.table_session_id;

  IF v_waiter IS NOT NULL THEN
    UPDATE public.orders
       SET waiter_id = v_waiter
     WHERE id = NEW.order_id
       AND waiter_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_order_waiter_from_session ON public.table_session_orders;
CREATE TRIGGER trg_stamp_order_waiter_from_session
  AFTER INSERT ON public.table_session_orders
  FOR EACH ROW EXECUTE FUNCTION public.stamp_order_waiter_from_session();

-- 5) Ao trocar o garçom de uma sessão aberta, propagar para os pedidos já vinculados
--    (não sobrescreve pedidos que já tenham waiter_id herdado dessa mesma sessão anterior
--     — aqui a semântica é: a sessão inteira passa ao novo garçom).
CREATE OR REPLACE FUNCTION public.propagate_session_waiter_to_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.waiter_id IS DISTINCT FROM OLD.waiter_id THEN
    UPDATE public.orders o
       SET waiter_id = NEW.waiter_id
      FROM public.table_session_orders tso
     WHERE tso.table_session_id = NEW.id
       AND tso.order_id = o.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_session_waiter ON public.table_sessions;
CREATE TRIGGER trg_propagate_session_waiter
  AFTER UPDATE OF waiter_id ON public.table_sessions
  FOR EACH ROW EXECUTE FUNCTION public.propagate_session_waiter_to_orders();
