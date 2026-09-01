
-- 1) Configuração da % de comissão por loja
ALTER TABLE public.pizzerias
  ADD COLUMN IF NOT EXISTS waiter_commission_percent numeric(5,2) NOT NULL DEFAULT 10;

-- 2) Snapshot da comissão por sessão (apenas para relatório; não afeta financeiro)
ALTER TABLE public.table_sessions
  ADD COLUMN IF NOT EXISTS waiter_commission_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS waiter_commission_amount numeric(10,2);

-- 3) Trigger: ao fechar a mesa, grava comissão = subtotal * (% da loja)
CREATE OR REPLACE FUNCTION public.snapshot_waiter_commission_on_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pct numeric(5,2);
BEGIN
  IF NEW.status = 'closed' AND COALESCE(OLD.status,'') <> 'closed' THEN
    SELECT COALESCE(waiter_commission_percent, 10) INTO v_pct
      FROM public.pizzerias WHERE id = NEW.restaurant_id;
    NEW.waiter_commission_percent := v_pct;
    NEW.waiter_commission_amount  := ROUND(COALESCE(NEW.subtotal_amount,0) * v_pct / 100.0, 2);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_snapshot_waiter_commission_on_close ON public.table_sessions;
CREATE TRIGGER tr_snapshot_waiter_commission_on_close
BEFORE UPDATE ON public.table_sessions
FOR EACH ROW EXECUTE FUNCTION public.snapshot_waiter_commission_on_close();
