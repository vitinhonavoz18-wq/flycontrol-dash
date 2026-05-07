
-- Roles enum
create type public.app_role as enum ('super_admin', 'owner');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- User roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Pizzerias
create table public.pizzerias (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  slug text not null unique,
  phone text,
  address text,
  api_key text not null unique,
  status text not null default 'active',
  print_auto boolean not null default true,
  sound_enabled boolean not null default true,
  logo_url text,
  primary_color text default '#FF7A00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.pizzerias enable row level security;
create index pizzerias_owner_idx on public.pizzerias(owner_id);

-- Orders
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pizzerias(id) on delete cascade,
  order_number serial,
  external_order_id text,
  customer_name text not null,
  customer_phone text not null,
  customer_address text,
  neighborhood text,
  items jsonb not null default '[]'::jsonb,
  total numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  payment_method text,
  change_for numeric(10,2),
  notes text default '',
  status text not null default 'novo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.orders enable row level security;
create index orders_tenant_created_idx on public.orders(tenant_id, created_at desc);
create index orders_status_idx on public.orders(tenant_id, status);

alter publication supabase_realtime add table public.orders;
alter table public.orders replica identity full;

-- Helper: owns pizzeria
create or replace function public.owns_pizzeria(_user_id uuid, _tenant_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.pizzerias where id = _tenant_id and owner_id = _user_id)
$$;

-- Profiles policies
create policy "profiles self select" on public.profiles
  for select using (auth.uid() = id or public.has_role(auth.uid(),'super_admin'));
create policy "profiles self update" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles self insert" on public.profiles
  for insert with check (auth.uid() = id);

-- user_roles policies
create policy "roles read self or admin" on public.user_roles
  for select using (auth.uid() = user_id or public.has_role(auth.uid(),'super_admin'));
create policy "roles admin manage" on public.user_roles
  for all using (public.has_role(auth.uid(),'super_admin'))
  with check (public.has_role(auth.uid(),'super_admin'));

-- Pizzerias policies
create policy "pizzerias owner select" on public.pizzerias
  for select using (owner_id = auth.uid() or public.has_role(auth.uid(),'super_admin'));
create policy "pizzerias owner update" on public.pizzerias
  for update using (owner_id = auth.uid() or public.has_role(auth.uid(),'super_admin'));
create policy "pizzerias admin insert" on public.pizzerias
  for insert with check (public.has_role(auth.uid(),'super_admin'));
create policy "pizzerias admin delete" on public.pizzerias
  for delete using (public.has_role(auth.uid(),'super_admin'));

-- Orders policies
create policy "orders owner select" on public.orders
  for select using (public.owns_pizzeria(auth.uid(), tenant_id) or public.has_role(auth.uid(),'super_admin'));
create policy "orders owner update" on public.orders
  for update using (public.owns_pizzeria(auth.uid(), tenant_id) or public.has_role(auth.uid(),'super_admin'));
create policy "orders owner delete" on public.orders
  for delete using (public.owns_pizzeria(auth.uid(), tenant_id) or public.has_role(auth.uid(),'super_admin'));

-- Trigger to create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone')
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at triggers
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger trg_pizzerias_updated before update on public.pizzerias for each row execute function public.set_updated_at();
create trigger trg_orders_updated before update on public.orders for each row execute function public.set_updated_at();
