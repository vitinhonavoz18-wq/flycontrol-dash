
-- =========================================================
-- Persistent Dining Session Identity — Phase 1 (Backend)
-- =========================================================

-- 1) TABLE_SESSIONS: dining_session_id + customer_token
ALTER TABLE public.table_sessions
  ADD COLUMN IF NOT EXISTS dining_session_id UUID,
  ADD COLUMN IF NOT EXISTS customer_token TEXT;

-- Backfill existing rows before adding NOT NULL / UNIQUE
UPDATE public.table_sessions
   SET dining_session_id = gen_random_uuid()
 WHERE dining_session_id IS NULL;

UPDATE public.table_sessions
   SET customer_token = encode(gen_random_bytes(24), 'hex')
 WHERE customer_token IS NULL;

ALTER TABLE public.table_sessions
  ALTER COLUMN dining_session_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN customer_token   SET DEFAULT encode(gen_random_bytes(24), 'hex'),
  ALTER COLUMN dining_session_id SET NOT NULL,
  ALTER COLUMN customer_token   SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS table_sessions_dining_session_id_key
  ON public.table_sessions (dining_session_id);
CREATE UNIQUE INDEX IF NOT EXISTS table_sessions_customer_token_key
  ON public.table_sessions (customer_token);

-- 2) ORDERS: reference the dining session
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS dining_session_id UUID,
  ADD COLUMN IF NOT EXISTS customer_token TEXT;

CREATE INDEX IF NOT EXISTS orders_dining_session_id_idx
  ON public.orders (dining_session_id);

-- 3) TABLE_CLOSE_REQUESTS: reference the dining session
ALTER TABLE public.table_close_requests
  ADD COLUMN IF NOT EXISTS dining_session_id UUID,
  ADD COLUMN IF NOT EXISTS customer_token TEXT;

CREATE INDEX IF NOT EXISTS table_close_requests_dining_session_id_idx
  ON public.table_close_requests (dining_session_id);

-- 4) State machine — extend enforce_table_session_authority.
-- Allowed transitions:
--   open              -> requested_close | closing | closed
--   requested_close   -> open (cancel)   | closing | closed
--   closing           -> closed
--   closed            -> archived
-- Any other transition is blocked. `closed` remains permanently immutable
-- for opened_at / status backward moves.
CREATE OR REPLACE FUNCTION public.enforce_table_session_authority()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_from text;
  v_to   text;
BEGIN
  v_from := COALESCE(OLD.status, '');
  v_to   := COALESCE(NEW.status, '');

  -- No status change: bookkeeping update (totals, waiter, etc.). Allow.
  IF v_from = v_to THEN
    RETURN NEW;
  END IF;

  -- Once archived, immutable.
  IF v_from = 'archived' THEN
    RAISE EXCEPTION 'session_archived_immutable: cannot change status of archived session %', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Once closed, only archived is allowed.
  IF v_from = 'closed' THEN
    IF v_to <> 'archived' THEN
      RAISE EXCEPTION 'session_closed_immutable: cannot change status of closed session % (attempted %->%)', OLD.id, v_from, v_to
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- Validate forward transitions.
  IF NOT (
       (v_from = 'open'            AND v_to IN ('requested_close','closing','closed'))
    OR (v_from = 'requested_close' AND v_to IN ('open','closing','closed'))
    OR (v_from = 'closing'         AND v_to = 'closed')
  ) THEN
    RAISE EXCEPTION 'invalid_session_transition: % -> % (session %)', v_from, v_to, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Force closed_at when moving into closed.
  IF v_to = 'closed' AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure trigger exists (idempotent)
DROP TRIGGER IF EXISTS trg_enforce_table_session_authority ON public.table_sessions;
CREATE TRIGGER trg_enforce_table_session_authority
  BEFORE UPDATE ON public.table_sessions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_table_session_authority();

-- 5) Stamp orders.dining_session_id/customer_token when linked to a session
CREATE OR REPLACE FUNCTION public.stamp_order_dining_session_from_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dining uuid;
  v_token  text;
BEGIN
  SELECT dining_session_id, customer_token
    INTO v_dining, v_token
  FROM public.table_sessions
  WHERE id = NEW.table_session_id;

  IF v_dining IS NOT NULL THEN
    UPDATE public.orders
       SET dining_session_id = COALESCE(dining_session_id, v_dining),
           customer_token    = COALESCE(customer_token, v_token)
     WHERE id = NEW.order_id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_stamp_order_dining_session ON public.table_session_orders;
CREATE TRIGGER trg_stamp_order_dining_session
  AFTER INSERT ON public.table_session_orders
  FOR EACH ROW EXECUTE FUNCTION public.stamp_order_dining_session_from_session();

-- 6) Block writes to close requests / order links for closed OR archived sessions
CREATE OR REPLACE FUNCTION public.block_close_request_for_closed_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  IF NEW.session_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT status INTO v_status FROM public.table_sessions WHERE id = NEW.session_id;
  IF v_status IN ('closed','archived') THEN
    RAISE EXCEPTION 'session_closed: cannot create close request for a % session %', v_status, NEW.session_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.block_order_link_for_closed_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.table_sessions WHERE id = NEW.table_session_id;
  IF v_status IN ('closed','archived') THEN
    RAISE EXCEPTION 'session_closed: cannot attach orders to % session %', v_status, NEW.table_session_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
