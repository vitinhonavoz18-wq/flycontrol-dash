
-- 1) waiters table
CREATE TABLE public.waiters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, username)
);

CREATE INDEX waiters_tenant_idx ON public.waiters(tenant_id);
CREATE INDEX waiters_username_idx ON public.waiters(username);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.waiters TO authenticated;
GRANT ALL ON public.waiters TO service_role;

ALTER TABLE public.waiters ENABLE ROW LEVEL SECURITY;

-- Owners can manage their own waiters; super admins can manage all
CREATE POLICY "Owners manage own waiters"
  ON public.waiters FOR ALL
  TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.pizzerias p
      WHERE p.id = waiters.tenant_id AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.pizzerias p
      WHERE p.id = waiters.tenant_id AND p.owner_id = auth.uid()
    )
  );

CREATE TRIGGER trg_waiters_updated_at
  BEFORE UPDATE ON public.waiters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Track waiter on table sessions (nullable for legacy rows + auto sessions)
ALTER TABLE public.table_sessions
  ADD COLUMN IF NOT EXISTS waiter_id UUID REFERENCES public.waiters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS table_sessions_waiter_idx ON public.table_sessions(waiter_id);
