-- Simulador mínimo do FlyControl para conseguir rodar e TESTAR as migrações do
-- módulo Estoque & PDV num Postgres comum, fora do Supabase.
--
-- Aqui só existe o que as migrações realmente encostam: as três tabelas do
-- sistema atual que elas apontam (pizzerias, menu_products, orders) e os dois
-- porteiros que elas consultam (is_admin, owns_pizzeria), além do auth.uid().
--
-- NÃO é o schema de produção e não deve virar um. É bancada de teste: serve
-- para provar que a regra funciona antes de o SQL encostar no banco de
-- verdade — como testar a fechadura na bancada antes de instalar na porta.

CREATE SCHEMA IF NOT EXISTS auth;

-- Quem está logado agora. Nos testes, trocamos com set_config.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('test.uid', TRUE), '')::UUID
$$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('test.is_admin', TRUE), 'false')::BOOLEAN
$$;

CREATE TABLE public.pizzerias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID,
  name TEXT NOT NULL,
  plan_type TEXT,
  status TEXT DEFAULT 'active'
);

CREATE OR REPLACE FUNCTION public.owns_pizzeria(p_user UUID, p_pizzeria UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pizzerias
     WHERE id = p_pizzeria AND owner_id = p_user
  )
$$;

CREATE TABLE public.menu_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pizzeria_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC DEFAULT 0,
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  order_number BIGINT,
  status TEXT DEFAULT 'novo',
  items JSONB DEFAULT '[]'::jsonb,
  total NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- No Supabase existe o papel `service_role`, usado pelo servidor quando roda
-- sem ninguém logado. As migrações concedem permissão a ele.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
END $$;
