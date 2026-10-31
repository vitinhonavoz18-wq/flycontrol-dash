-- ============================================================================
-- Banco de mentira que imita as PERMISSÕES do Supabase do FlyControl.
-- ============================================================================
--
-- Não tem dado real nenhum: duas lojas inventadas (A e B), um administrador e
-- alguns registros. O que ele copia de produção é o que importa para testar a
-- trava: os papéis (anon, authenticated, service_role), as assinaturas das
-- funções, que elas rodam com a chave mestra (SECURITY DEFINER), as visões sem
-- security_invoker, as regras de acesso das tabelas tocadas e as permissões
-- padrão que o Supabase dá a anon/authenticated em tudo que nasce em public.
--
-- Os papéis são criados pelo rodar.sh (são globais no servidor).
-- ============================================================================
-- SECURITY DEFINER, privilégios padrão para anon/authenticated).
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claims', true)::json->>'role' $$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create table public.pizzerias (id uuid primary key, owner_id uuid, slug text, status text default 'active');
create table public.user_roles (user_id uuid, role text);
create table public.restaurant_tables (id uuid primary key default gen_random_uuid(), restaurant_id uuid, tenant_id uuid, table_number text, table_name text, public_token text, qr_code_url text, is_active bool, unique(restaurant_id, table_number));
create table public.pizzeria_pizza_sizes (id uuid primary key default gen_random_uuid(), pizzeria_id uuid, name text, price numeric);
create table public.table_sessions (id uuid primary key default gen_random_uuid(), restaurant_id uuid, status text, customer_token text, customer_name text);
create table public.orders (id uuid primary key default gen_random_uuid(), tenant_id uuid, total numeric, status text default 'novo', created_at timestamptz default now());
create table public.crm_messages (id uuid primary key default gen_random_uuid(), tenant_id uuid, body text);

create function public.is_admin() returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from user_roles where user_id = auth.uid() and role='super_admin') $$;
create function public.owns_pizzeria(_user_id uuid, _pizzeria_id uuid) returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from pizzerias where id=_pizzeria_id and owner_id=_user_id) $$;

-- Funções-alvo (corpo simplificado; o que importa é quem pode executar).
create function public.crm_next_outbox(p_tenant_id uuid, p_limit int, p_worker text, p_lease_seconds int) returns setof crm_messages language sql security definer set search_path=public as $$ select * from crm_messages where tenant_id=p_tenant_id $$;
create function public.crm_receive_message(uuid,text,text,text,text,text,text,boolean) returns void language plpgsql security definer as $$ begin insert into public.crm_messages(tenant_id, body) values ($1,$3); end $$;
create function public.crm_attach_media(uuid,text,text,text,text) returns void language sql security definer as $$ select $$;
create function public.crm_rename_customer(uuid,uuid,text,text) returns boolean language sql security definer as $$ select true $$;
create function public.club_close_cycle(uuid) returns void language sql security definer as $$ select $$;
create function public.club_close_due_cycles() returns int language sql security definer as $$ select 0 $$;
create function public.club_check_achievements(uuid,uuid) returns void language sql security definer as $$ select $$;
create function public.club_get_or_create_active_cycle(uuid,uuid) returns void language sql security definer as $$ select $$;
create function public.club_recalculate_level(uuid,uuid) returns void language sql security definer as $$ select $$;
create function public.club_resolve_price(uuid,uuid) returns numeric language sql security definer as $$ select 1::numeric $$;
create function public.enroll_company_in_cents(p_company_id uuid, p_club_id uuid default '00000000-0000-0000-0000-0000000000c1') returns void language plpgsql security definer set search_path=public as $$ begin perform public.club_get_or_create_active_cycle(p_company_id, p_club_id); perform public.club_recalculate_level(p_company_id, p_club_id); end $$;
create function public.flycourier_purge_old_locations(integer) returns int language sql security definer as $$ select 0 $$;
create function public.expire_stale_checkout_intents() returns int language sql security definer as $$ select 0 $$;
create function public.recalculate_table_session_totals(uuid) returns void language sql security definer as $$ select $$;
create function public.sync_order_to_table_session_logic(uuid) returns void language sql security definer as $$ select $$;
create function public.generate_default_restaurant_tables(p_restaurant_id uuid) returns void language plpgsql security definer as $$ begin end $$;

-- Visões como em produção (dono postgres, sem security_invoker).
create view public.pizzeria_financial_metrics as
  select p.id pizzeria_id, p.owner_id, coalesce(sum(o.total),0) revenue_month from pizzerias p left join orders o on o.tenant_id=p.id group by p.id, p.owner_id;
create view public.admin_global_financial_metrics as select sum(revenue_month) total_revenue_month from public.pizzeria_financial_metrics;
create view public.subscription_setup_fee_charged as select gen_random_uuid() subscription_id, now() charged_at;

-- RLS como em produção (só as regras relevantes).
alter table pizzerias enable row level security; alter table orders enable row level security;
alter table user_roles enable row level security; alter table pizzeria_pizza_sizes enable row level security;
alter table table_sessions enable row level security; alter table restaurant_tables enable row level security;
create policy pizzerias_select_policy on pizzerias for select using (owner_id = auth.uid() or is_admin());
create policy orders_select_policy on orders for select using (is_admin() or exists(select 1 from pizzerias p where p.id=orders.tenant_id and p.owner_id=auth.uid()));
create policy "roles read self or admin" on user_roles for select using (auth.uid() = user_id or is_admin());
create policy user_roles_read_policy on user_roles for select to authenticated using (true);
create policy "Enable all for authenticated users" on pizzeria_pizza_sizes for all using (auth.role()='authenticated') with check (auth.role()='authenticated');
create policy "Pizza Sizes manage" on pizzeria_pizza_sizes for all using (is_admin() or owns_pizzeria(auth.uid(), pizzeria_id));
create policy sessions_select_policy on table_sessions for select using (is_admin() or exists(select 1 from pizzerias p where p.id=table_sessions.restaurant_id and p.owner_id=auth.uid()));
create policy "Public can read session lifecycle" on table_sessions for select to anon, authenticated using (true);
create policy tables_owner on restaurant_tables for all using (owns_pizzeria(auth.uid(), restaurant_id) or is_admin());

grant all on all tables in schema public to anon, authenticated, service_role;
revoke select (customer_token) on table_sessions from anon;
revoke select on table_sessions from anon; grant select (id, restaurant_id, status, customer_name) on table_sessions to anon;
grant execute on all functions in schema public to anon, authenticated, service_role;

-- Dados: loja A (dono A), loja B (dono B), admin.
insert into pizzerias values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','loja-a'),
                             ('bbbbbbbb-0000-0000-0000-000000000002','22222222-0000-0000-0000-000000000002','loja-b');
insert into user_roles values ('99999999-0000-0000-0000-000000000009','super_admin'), ('11111111-0000-0000-0000-000000000001','owner');
insert into orders(tenant_id,total) values ('aaaaaaaa-0000-0000-0000-000000000001',100),('bbbbbbbb-0000-0000-0000-000000000002',250);
insert into pizzeria_pizza_sizes(pizzeria_id,name,price) values ('bbbbbbbb-0000-0000-0000-000000000002','Grande',50);
insert into table_sessions(restaurant_id,status,customer_token,customer_name) values ('bbbbbbbb-0000-0000-0000-000000000002','open','segredo-da-comanda','Cliente B');
insert into crm_messages(tenant_id, body) values ('bbbbbbbb-0000-0000-0000-000000000002','Seu pedido saiu');

-- Como em produção: a limpeza de localização dos entregadores não tem
-- permissão própria para anon/authenticated (só via PUBLIC).
revoke execute on function public.flycourier_purge_old_locations(integer) from anon, authenticated;

-- O bucket de mídia do Chat, que a migração do CRM 2.0 (20261022120000) altera.
create schema storage;
create table storage.buckets (id text primary key, allowed_mime_types text[], public boolean);
insert into storage.buckets values ('crm-chat-media', array['image/png'], false);

-- O caderno de mudanças do banco, com a mesma estrutura de produção.
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (
  version text primary key, statements text[], name text, created_by text,
  idempotency_key text unique, rollback text[]
);
insert into supabase_migrations.schema_migrations (version, name) values ('20261001120000', 'pagamentos_online_mercado_pago');
