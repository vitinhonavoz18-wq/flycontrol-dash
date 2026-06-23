
ALTER TABLE public.table_sessions
  ADD COLUMN IF NOT EXISTS webhook_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.enforce_table_session_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Once closed, a session is permanently dead. Block any attempt to reopen
  -- or mutate lifecycle fields. Allow only idempotent metadata bookkeeping
  -- (closed_by, closure_reason, webhook_sent_at, updated_at, totals).
  IF OLD.status = 'closed' THEN
    IF NEW.status IS DISTINCT FROM 'closed' THEN
      RAISE EXCEPTION 'session_closed_immutable: cannot change status of closed session %', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.opened_at IS DISTINCT FROM OLD.opened_at THEN
      RAISE EXCEPTION 'session_closed_immutable: cannot modify opened_at of closed session %', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.closed_at IS NULL THEN
      NEW.closed_at := OLD.closed_at;
    END IF;
  END IF;

  -- When transitioning into closed, force closed_at to be set.
  IF NEW.status = 'closed' AND COALESCE(OLD.status, '') <> 'closed' THEN
    IF NEW.closed_at IS NULL THEN
      NEW.closed_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_table_session_authority ON public.table_sessions;
CREATE TRIGGER trg_enforce_table_session_authority
BEFORE UPDATE ON public.table_sessions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_table_session_authority();
