
-- Extend state machine with WAITING_OPERATOR
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

  IF v_from = v_to THEN
    RETURN NEW;
  END IF;

  IF v_from = 'archived' THEN
    RAISE EXCEPTION 'session_archived_immutable: cannot change status of archived session %', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_from = 'closed' THEN
    IF v_to <> 'archived' THEN
      RAISE EXCEPTION 'session_closed_immutable: cannot change status of closed session % (attempted %->%)', OLD.id, v_from, v_to
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- Allowed transitions. 'open' is the DB alias for the public ACTIVE state.
  -- Forward path: open → requested_close → waiting_operator → closing → closed → archived.
  -- Cancel path : requested_close|waiting_operator → open.
  -- Fast paths  : any live state → closed (operator manual close is authoritative).
  IF NOT (
       (v_from = 'open'             AND v_to IN ('requested_close','waiting_operator','closing','closed'))
    OR (v_from = 'requested_close'  AND v_to IN ('open','waiting_operator','closing','closed'))
    OR (v_from = 'waiting_operator' AND v_to IN ('open','closing','closed'))
    OR (v_from = 'closing'          AND v_to IN ('closed'))
  ) THEN
    RAISE EXCEPTION 'invalid_session_transition: % -> % (session %)', v_from, v_to, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_to = 'closed' AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
  END IF;

  RETURN NEW;
END;
$function$;
