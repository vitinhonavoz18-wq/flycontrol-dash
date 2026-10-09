-- Bancada de teste do PIX COM SPLIT (SyncPay) num Postgres comum, fora do
-- Supabase.
--
-- Aqui só existe o que a migração 20261009120000_flydelivery_pix_split_syncpay
-- realmente encosta: os papéis do Supabase (anon, authenticated,
-- service_role), quem está logado (auth.uid / auth.role), as lojas, os
-- pedidos, os cupons e os dois porteiros (is_admin, owns_pizzeria).
--
-- NÃO é o schema de produção e não deve virar um. É a bancada onde se testa a
-- fechadura antes de instalar na porta.
--
-- Como rodar (Postgres 15+ local, banco vazio):
--   psql -v ON_ERROR_STOP=1 -f scripts/pix-split-harness.sql \
--        -f supabase/migrations/20261009120000_flydelivery_pix_split_syncpay.sql \
--        -f scripts/pix-split-testes.sql

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Quem está logado e por onde chegou. Nos testes, trocamos com set_config.
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create or replace function auth.role() returns text
language sql stable as $$ select nullif(current_setting('test.role', true), '') $$;

grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

create table public.user_roles (
  user_id uuid not null,
  role text not null
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'super_admin')
$$;

create table public.pizzerias (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  name text not null
);

create or replace function public.owns_pizzeria(_user_id uuid, _pizzeria_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pizzerias where id = _pizzeria_id and owner_id = _user_id)
$$;

grant execute on function public.is_admin(), public.owns_pizzeria(uuid, uuid) to authenticated, service_role;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pizzerias(id),
  order_number integer,
  customer_id uuid,
  flydelivery_request_id text,
  customer_name text not null,
  customer_phone text not null,
  customer_address text,
  neighborhood text,
  flydelivery_latitude double precision,
  flydelivery_longitude double precision,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric,
  delivery_fee numeric not null default 0,
  discount numeric,
  flydelivery_coupon_id uuid,
  flydelivery_coupon_code text,
  total numeric not null,
  order_type text,
  service_mode text,
  delivery_type text,
  payment_method text,
  change_for numeric,
  notes text,
  status text not null default 'novo',
  payment_status text,
  source text,
  created_at timestamptz not null default now()
);

create unique index orders_flydelivery_request_uniq
  on public.orders (flydelivery_request_id) where flydelivery_request_id is not null;

-- Número do pedido por loja (imitação simples do gatilho de produção).
create or replace function public.harness_order_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select coalesce(max(order_number), 0) + 1 into new.order_number from public.orders where tenant_id = new.tenant_id;
  return new;
end $$;
create trigger harness_order_number before insert on public.orders
  for each row execute function public.harness_order_number();

alter table public.orders enable row level security;
create policy orders_select on public.orders for select
  using (public.is_admin() or exists (select 1 from public.pizzerias p where p.id = orders.tenant_id and p.owner_id = auth.uid()));
-- Igual à produção: o site insere pedido sem login.
create policy orders_anon_insert on public.orders for insert to anon with check (true);
create policy orders_owner_update on public.orders for update to authenticated
  using (exists (select 1 from public.pizzerias p where p.id = orders.tenant_id and p.owner_id = auth.uid()) or public.is_admin());
grant select, insert, update on public.orders to anon, authenticated;
grant select on public.pizzerias to anon, authenticated;
grant all on public.orders to service_role;

create table public.flydelivery_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  used_count integer not null default 0
);

create table public.flydelivery_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.flydelivery_coupons(id),
  user_id uuid not null,
  order_id uuid not null references public.orders(id),
  discount numeric not null,
  created_at timestamptz not null default now()
);

create or replace function public.flydelivery_bump_coupon_use(p_coupon_id uuid) returns void
language sql as $$ update public.flydelivery_coupons set used_count = used_count + 1 where id = p_coupon_id $$;

grant all on all tables in schema public to service_role;
