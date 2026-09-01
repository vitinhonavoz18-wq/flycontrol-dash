
CREATE TABLE public.table_close_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  table_id UUID,
  table_number TEXT NOT NULL,
  session_id UUID,
  customer_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tcr_restaurant_status ON public.table_close_requests(restaurant_id, status);
CREATE INDEX idx_tcr_session ON public.table_close_requests(session_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.table_close_requests TO authenticated;
GRANT ALL ON public.table_close_requests TO service_role;

ALTER TABLE public.table_close_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their close requests"
ON public.table_close_requests FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (SELECT 1 FROM public.pizzerias p WHERE p.id = restaurant_id AND p.owner_id = auth.uid())
);

CREATE POLICY "Owners can update their close requests"
ON public.table_close_requests FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (SELECT 1 FROM public.pizzerias p WHERE p.id = restaurant_id AND p.owner_id = auth.uid())
);

CREATE POLICY "Owners can insert their close requests"
ON public.table_close_requests FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR EXISTS (SELECT 1 FROM public.pizzerias p WHERE p.id = restaurant_id AND p.owner_id = auth.uid())
);

CREATE TRIGGER trg_tcr_updated_at
BEFORE UPDATE ON public.table_close_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.table_close_requests;
ALTER TABLE public.table_close_requests REPLICA IDENTITY FULL;
