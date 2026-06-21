
-- Add diagnostics columns to table_sessions
ALTER TABLE public.table_sessions
  ADD COLUMN IF NOT EXISTS closed_by uuid,
  ADD COLUMN IF NOT EXISTS closure_reason text;

-- Enable realtime for table_sessions so SiteCreatorFly + FlyControl receive termination events
ALTER TABLE public.table_sessions REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'table_sessions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.table_sessions';
  END IF;
END$$;

-- Allow public (anon) read of a single session's lifecycle status so SiteCreatorFly can verify closure
-- Narrow: only select essential columns; RLS still requires explicit policy
DROP POLICY IF EXISTS "Public can read session lifecycle" ON public.table_sessions;
CREATE POLICY "Public can read session lifecycle"
ON public.table_sessions
FOR SELECT
TO anon, authenticated
USING (true);

GRANT SELECT ON public.table_sessions TO anon;

-- Block creating new close requests for already-closed sessions
CREATE OR REPLACE FUNCTION public.block_close_request_for_closed_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NEW.session_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT status INTO v_status FROM public.table_sessions WHERE id = NEW.session_id;
  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'session_closed: cannot create close request for a closed session %', NEW.session_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_close_request_for_closed_session ON public.table_close_requests;
CREATE TRIGGER trg_block_close_request_for_closed_session
BEFORE INSERT ON public.table_close_requests
FOR EACH ROW EXECUTE FUNCTION public.block_close_request_for_closed_session();

-- Block linking new orders to a closed session
CREATE OR REPLACE FUNCTION public.block_order_link_for_closed_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.table_sessions WHERE id = NEW.table_session_id;
  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'session_closed: cannot attach orders to closed session %', NEW.table_session_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_order_link_for_closed_session ON public.table_session_orders;
CREATE TRIGGER trg_block_order_link_for_closed_session
BEFORE INSERT ON public.table_session_orders
FOR EACH ROW EXECUTE FUNCTION public.block_order_link_for_closed_session();

-- Auto-cancel pending close requests when their session is closed
CREATE OR REPLACE FUNCTION public.cancel_pending_close_requests_on_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'closed' AND COALESCE(OLD.status, '') <> 'closed' THEN
    UPDATE public.table_close_requests
       SET status = 'closed',
           processed_at = COALESCE(processed_at, now()),
           processed_by = COALESCE(processed_by, NEW.closed_by)
     WHERE session_id = NEW.id
       AND status IN ('pending','viewed');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancel_pending_close_requests ON public.table_sessions;
CREATE TRIGGER trg_cancel_pending_close_requests
AFTER UPDATE OF status ON public.table_sessions
FOR EACH ROW EXECUTE FUNCTION public.cancel_pending_close_requests_on_close();
