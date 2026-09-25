-- ============================================================================
-- IMPULSIONAMENTO PÓS-PAGO — anuncie agora, pague na próxima fatura
--
-- O QUE MUDA NA PRÁTICA
-- A loja escolhe o produto e o período, vê o preço, confirma — e o anúncio
-- entra no ar na hora, sem pagar nada agora. O valor vira um lançamento que
-- entra, linha por linha, na próxima fatura do plano FlyControl:
--
--     Plano FlyControl                                 R$ 139,90
--     Impulsionamento — Produto X — 7 dias             R$  60,00
--     Impulsionamento — Produto Y — 3 dias             R$  25,00
--     TOTAL                                            R$ 224,90
--
-- REAPROVEITADO (nada é recriado)
--   flydelivery_campaign_plans  = os pacotes (preço em CENTAVOS, editável)
--   flydelivery_campaigns       = os impulsionamentos (+ "foto" do contrato)
--   invoices / invoice_items    = a fatura de sempre (+ tipo 'addon')
--   flydelivery_events          = impressões e cliques (já existiam)
--
-- NOVO
--   billing_addon_charges       = um lançamento por impulsionamento (genérico:
--                                 serve para qualquer adicional futuro)
--   flydelivery_boost_settings  = política de cancelamento, sem código
--   flydelivery_campaign_history= histórico auditável de cada contrato
--
-- AS GARANTIAS (no banco, não na tela)
--   * O preço sai do pacote no banco; o navegador só manda produto + pacote.
--   * O valor fica congelado no contrato: mudar o preço do pacote amanhã não
--     muda quem já contratou.
--   * Contratar é UMA transação: ou nascem anúncio + lançamento, ou nada.
--   * Um impulsionamento = um lançamento (UNIQUE), e um lançamento entra uma
--     vez só em cada fatura (UNIQUE). Reenvio, retry, recarregar a página:
--     nada duplica cobrança.
--   * Loja só vê e mexe no que é dela (RLS).
--
-- Esta migração é idempotente: pode rodar de novo sem estragar nada.
-- ============================================================================

-- 1. Pacotes: preços iniciais (só onde ainda está zerado — nunca por cima de
--    um preço que o administrador já tenha definido) -------------------------
alter table public.flydelivery_campaign_plans add column if not exists description text;

update public.flydelivery_campaign_plans p
   set price_cents = v.price, updated_at = now()
  from (values (1, 1000), (3, 2500), (7, 6000), (15, 10500), (30, 24500)) as v(days, price)
 where p.duration_days = v.days and p.price_cents = 0;

-- 2. Política de cancelamento (uma linha só) -------------------------------------
create table if not exists public.flydelivery_boost_settings (
  id boolean primary key default true check (id),
  -- Cancelou ANTES de começar: não cobra (true) ou cobra mesmo assim (false).
  refund_if_not_started boolean not null default true,
  -- Até quantos dias no futuro a loja pode agendar o início.
  max_schedule_days integer not null default 30 check (max_schedule_days between 0 and 365),
  -- Loja no período grátis pode impulsionar? O valor entra na primeira
  -- fatura depois do período grátis.
  allow_during_trial boolean not null default true,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.flydelivery_boost_settings
  add column if not exists allow_during_trial boolean not null default true;
insert into public.flydelivery_boost_settings (id) values (true) on conflict (id) do nothing;

alter table public.flydelivery_boost_settings enable row level security;
drop policy if exists fd_boost_settings_read on public.flydelivery_boost_settings;
create policy fd_boost_settings_read on public.flydelivery_boost_settings
  for select to authenticated using (true);
drop policy if exists fd_boost_settings_admin on public.flydelivery_boost_settings;
create policy fd_boost_settings_admin on public.flydelivery_boost_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.flydelivery_boost_settings from anon;
grant select, update on public.flydelivery_boost_settings to authenticated;

-- 3. O contrato dentro da campanha ------------------------------------------------
alter table public.flydelivery_campaigns
  add column if not exists contracted_at timestamptz,
  add column if not exists contracted_by uuid,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists idempotency_key text,
  add column if not exists product_name_snapshot text,
  add column if not exists package_label_snapshot text,
  add column if not exists duration_days_snapshot integer,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists cancel_reason text;

-- O mesmo toque duplo em "Confirmar" (ou a página recarregada) chega com a
-- mesma chave e devolve o contrato que já existe.
create unique index if not exists flydelivery_campaigns_idempotency
  on public.flydelivery_campaigns (pizzeria_id, idempotency_key) where idempotency_key is not null;
create index if not exists flydelivery_campaigns_plan_idx on public.flydelivery_campaigns (plan_id);

-- A loja não grava mais campanha direto: contrata pela função abaixo, que
-- registra a cobrança junto. Só o administrador insere direto.
drop policy if exists fd_campaigns_insert on public.flydelivery_campaigns;
create policy fd_campaigns_insert on public.flydelivery_campaigns
  for insert to authenticated with check (public.is_admin());

-- 4. Lançamentos de adicionais -------------------------------------------------------
create table if not exists public.billing_addon_charges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.pizzerias(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  -- O ciclo em que o lançamento é esperado; vira o ciclo da fatura ao faturar.
  billing_cycle_id uuid references public.billing_cycles(id) on delete set null,
  source_type text not null check (source_type in ('flydelivery_boost')),
  source_id uuid not null,
  description text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_amount_cents bigint not null check (unit_amount_cents >= 0),
  amount_cents bigint not null check (amount_cents >= 0),
  status text not null default 'pending_invoice'
    check (status in ('pending_invoice', 'invoiced', 'paid', 'cancelled', 'refunded')),
  invoice_id uuid references public.invoices(id) on delete set null,
  invoice_item_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_addon_charges_one_per_source unique (source_type, source_id)
);

comment on table public.billing_addon_charges is
  'Cobranças adicionais pós-pagas da assinatura (ex.: impulsionamento no FlyDelivery). Uma por origem; entram como itens separados na próxima fatura.';

create index if not exists billing_addon_charges_company_status
  on public.billing_addon_charges (company_id, status, created_at);
create index if not exists billing_addon_charges_invoice on public.billing_addon_charges (invoice_id);
create index if not exists billing_addon_charges_cycle on public.billing_addon_charges (billing_cycle_id);
create index if not exists billing_addon_charges_subscription on public.billing_addon_charges (subscription_id);

alter table public.billing_addon_charges enable row level security;
drop policy if exists billing_addon_charges_owner_read on public.billing_addon_charges;
create policy billing_addon_charges_owner_read on public.billing_addon_charges
  for select to authenticated
  using ((select public.is_admin()) or public.owns_pizzeria((select auth.uid()), company_id));
drop policy if exists billing_addon_charges_admin on public.billing_addon_charges;
create policy billing_addon_charges_admin on public.billing_addon_charges
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.billing_addon_charges from anon, authenticated;
-- Ninguém apaga lançamento pela tela (nem o admin): cobrança se cancela, não some.
grant select, update on public.billing_addon_charges to authenticated;

-- A "foto" financeira não se edita: valor, loja e origem ficam como foram
-- contratados. A situação só anda para a frente, pelos caminhos previstos
-- (inclusive para o administrador):
--   pendente → faturado → pago → estornado
--   pendente → cancelado          (não começou, ou o admin dispensou)
--   faturado → pendente           (a fatura foi cancelada: volta para a fila)
create or replace function public.billing_addon_charges_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.company_id is distinct from old.company_id
     or new.source_type is distinct from old.source_type
     or new.source_id is distinct from old.source_id
     or new.quantity is distinct from old.quantity
     or new.unit_amount_cents is distinct from old.unit_amount_cents
     or new.amount_cents is distinct from old.amount_cents
     or new.created_at is distinct from old.created_at then
    raise exception 'O valor de uma cobrança já registrada não pode ser alterado.' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'pending_invoice' and new.status in ('invoiced', 'cancelled'))
    or (old.status = 'invoiced' and new.status in ('paid', 'pending_invoice'))
    or (old.status = 'paid' and new.status = 'refunded')
  ) then
    raise exception 'Mudança de situação da cobrança não permitida (% → %).', old.status, new.status
      using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists billing_addon_charges_guard on public.billing_addon_charges;
create trigger billing_addon_charges_guard
  before update on public.billing_addon_charges
  for each row execute function public.billing_addon_charges_guard();

-- 5. Item de fatura do tipo "adicional" ------------------------------------------------
alter table public.invoice_items
  add column if not exists addon_charge_id uuid references public.billing_addon_charges(id) on delete set null;

alter table public.invoice_items drop constraint if exists invoice_items_item_type_check;
alter table public.invoice_items add constraint invoice_items_item_type_check
  check (item_type = any (array['monthly_fee', 'setup_fee', 'usage', 'discount', 'adjustment', 'addon']));

-- O mesmo lançamento nunca entra duas vezes na mesma fatura.
create unique index if not exists invoice_items_addon_once
  on public.invoice_items (invoice_id, addon_charge_id) where addon_charge_id is not null;

alter table public.billing_addon_charges drop constraint if exists billing_addon_charges_invoice_item_fk;
alter table public.billing_addon_charges add constraint billing_addon_charges_invoice_item_fk
  foreign key (invoice_item_id) references public.invoice_items(id) on delete set null;
create index if not exists billing_addon_charges_invoice_item on public.billing_addon_charges (invoice_item_id);
create index if not exists invoice_items_addon_charge
  on public.invoice_items (addon_charge_id) where addon_charge_id is not null;

-- 6. Histórico auditável de cada impulsionamento ----------------------------------------
create table if not exists public.flydelivery_campaign_history (
  id bigserial primary key,
  campaign_id uuid not null references public.flydelivery_campaigns(id) on delete cascade,
  action text not null,
  from_status text,
  to_status text,
  actor uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists flydelivery_campaign_history_campaign
  on public.flydelivery_campaign_history (campaign_id, created_at);

alter table public.flydelivery_campaign_history enable row level security;
drop policy if exists fd_campaign_history_read on public.flydelivery_campaign_history;
create policy fd_campaign_history_read on public.flydelivery_campaign_history
  for select to authenticated
  using ((select public.is_admin()) or exists (
    select 1 from public.flydelivery_campaigns c
     where c.id = campaign_id and public.owns_pizzeria((select auth.uid()), c.pizzeria_id)));
revoke all on public.flydelivery_campaign_history from anon;
grant select on public.flydelivery_campaign_history to authenticated;

-- 7. A trava da campanha, agora sabendo do contrato pós-pago ------------------------------
create or replace function public.flydelivery_campaign_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean := coalesce(public.is_admin(), false);
  -- Ligado SÓ dentro de flydelivery_contract_boost: o contrato pós-pago põe a
  -- campanha no ar direto, sem esperar aprovação.
  v_contrato boolean := coalesce(current_setting('flydelivery.contracting', true), '') = 'on';
  v_prod record;
  v_plan record;
  v_issues text[];
  v_vivas integer;
  v_vivo boolean := new.status in ('pending', 'active', 'paused', 'draft');
begin
  select mp.pizzeria_id, mp.active, mp.available, mp.name, mp.image_url, mp.price
    into v_prod from public.menu_products mp where mp.id = new.product_id;
  if v_prod.pizzeria_id is null or v_prod.pizzeria_id <> new.pizzeria_id then
    raise exception 'Este produto não pertence a esta loja.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and (new.pizzeria_id <> old.pizzeria_id or new.product_id <> old.product_id) then
    raise exception 'Não é possível trocar a loja ou o produto de uma campanha. Crie outra.'
      using errcode = '42501';
  end if;

  if not v_admin then
    if tg_op = 'INSERT' then
      if new.status not in ('pending', 'draft') and not v_contrato then
        raise exception 'A campanha precisa ser aprovada pela administração.' using errcode = '42501';
      end if;
      new.priority := 0;
      new.approved_by := null;
      -- Contrato pós-pago: aprovado pelo próprio contrato (a loja aceitou a
      -- cobrança). É o que permite pausar e retomar depois.
      new.approved_at := case when v_contrato then now() else null end;
      new.review_note := null;
      new.campaign_type := 'product_boost';
      new.placements := null;
    else
      if new.priority is distinct from old.priority
         or new.amount_cents is distinct from old.amount_cents
         or new.payment_status is distinct from old.payment_status
         or new.approved_by is distinct from old.approved_by
         or new.approved_at is distinct from old.approved_at
         or new.review_note is distinct from old.review_note
         or new.campaign_type is distinct from old.campaign_type
         or new.placements is distinct from old.placements
         or new.contracted_at is distinct from old.contracted_at
         or new.contracted_by is distinct from old.contracted_by
         or new.terms_accepted_at is distinct from old.terms_accepted_at
         or new.idempotency_key is distinct from old.idempotency_key
         or new.product_name_snapshot is distinct from old.product_name_snapshot
         or new.package_label_snapshot is distinct from old.package_label_snapshot
         or new.duration_days_snapshot is distinct from old.duration_days_snapshot then
        raise exception 'Somente a administração altera estes campos.' using errcode = '42501';
      end if;
      if new.status is distinct from old.status and not (
           new.status = 'cancelled'
        or (old.status = 'active' and new.status = 'paused')
        or (old.status = 'paused' and new.status = 'active' and old.approved_at is not null)
      ) then
        raise exception 'Mudança de status não permitida.' using errcode = '42501';
      end if;
      if old.status not in ('pending', 'draft') and (
           new.start_at is distinct from old.start_at
        or new.end_at is distinct from old.end_at
        or new.plan_id is distinct from old.plan_id) then
        raise exception 'Datas só podem mudar enquanto a campanha aguarda aprovação.'
          using errcode = '42501';
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
    new.cancelled_by := coalesce(new.cancelled_by, auth.uid());
  end if;

  if new.plan_id is not null and (tg_op = 'INSERT' or new.plan_id is distinct from old.plan_id
                                  or new.start_at is distinct from old.start_at) then
    select * into v_plan from public.flydelivery_campaign_plans where id = new.plan_id;
    if v_plan.id is null or (not v_plan.active and not v_admin) then
      raise exception 'Período indisponível.' using errcode = '23514';
    end if;
    new.end_at := new.start_at + make_interval(days => v_plan.duration_days);
    if not v_admin then
      new.amount_cents := v_plan.price_cents;
      new.payment_status := case when v_plan.price_cents > 0 then 'pending' else 'not_required' end;
    end if;
  elsif tg_op = 'INSERT' and not v_admin then
    raise exception 'Escolha o período da campanha.' using errcode = '23514';
  end if;

  if not v_admin and tg_op = 'INSERT' and new.start_at < now() - interval '10 minutes' then
    raise exception 'A campanha não pode começar no passado.' using errcode = '23514';
  end if;

  if v_admin and new.status = 'active' and (tg_op = 'INSERT' or old.approved_at is null) then
    new.approved_by := coalesce(new.approved_by, auth.uid());
    new.approved_at := coalesce(new.approved_at, now());
  end if;

  if v_vivo and new.end_at > now() then
    if tg_op = 'INSERT' or (new.status = 'active' and old.status is distinct from 'active') then
      v_issues := public.flydelivery_campaign_issues_of(
        v_prod.active, v_prod.available, v_prod.name, v_prod.image_url, v_prod.price,
        public.flydelivery_store_listed(new.pizzeria_id));
      if array_length(v_issues, 1) > 0 then
        raise exception 'Produto não elegível para impulsionar: %', array_to_string(v_issues, ', ')
          using errcode = '23514';
      end if;
    end if;

    perform 1 from public.pizzerias where id = new.pizzeria_id for update;

    select count(*) into v_vivas from public.flydelivery_campaigns c
     where c.pizzeria_id = new.pizzeria_id and c.id <> new.id
       and c.status in ('pending', 'active', 'paused', 'draft') and c.end_at > now();
    if v_vivas >= 3 then
      raise exception 'Limite de 3 campanhas ao mesmo tempo por loja.' using errcode = '23514';
    end if;

    if exists (
      select 1 from public.flydelivery_campaigns c
       where c.product_id = new.product_id and c.id <> new.id
         and c.status in ('pending', 'active', 'paused', 'draft')
         and tstzrange(c.start_at, c.end_at) && tstzrange(new.start_at, new.end_at)
    ) then
      raise exception 'Este produto já tem uma campanha neste período.' using errcode = '23505';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.flydelivery_campaign_guard() from public, anon, authenticated;

-- 8. Depois de cada mudança: histórico e efeito na cobrança -----------------------------
create or replace function public.flydelivery_campaign_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund boolean;
  v_charge record;
  v_nao_comecou boolean;
begin
  if tg_op = 'INSERT' then
    insert into public.flydelivery_campaign_history (campaign_id, action, to_status, actor, details)
    values (new.id, case when new.contracted_at is not null then 'contracted' else 'created' end,
            new.status, auth.uid(),
            jsonb_build_object('amount_cents', new.amount_cents, 'start_at', new.start_at,
                               'end_at', new.end_at, 'plan_id', new.plan_id));
    return new;
  end if;

  if new.status is distinct from old.status then
    select * into v_charge from public.billing_addon_charges
     where source_type = 'flydelivery_boost' and source_id = new.id;

    if new.status = 'cancelled' and v_charge.id is not null then
      select refund_if_not_started into v_refund from public.flydelivery_boost_settings where id;
      v_nao_comecou := old.start_at > now();

      -- Não começou + política de não cobrar + ainda não faturado: sai da
      -- cobrança. Já começou: o anúncio sai do ar, a cobrança fica (e o
      -- histórico diz por quê).
      if v_nao_comecou and coalesce(v_refund, true) and v_charge.status = 'pending_invoice' then
        update public.billing_addon_charges
           set status = 'cancelled', updated_at = now(),
               metadata = metadata || jsonb_build_object('cancel_rule', 'not_started_no_charge')
         where id = v_charge.id;
      end if;
    end if;

    insert into public.flydelivery_campaign_history
      (campaign_id, action, from_status, to_status, actor, details)
    values (new.id, 'status_changed', old.status, new.status, auth.uid(),
            jsonb_build_object(
              'charge_status_after', (select status from public.billing_addon_charges
                                        where source_type = 'flydelivery_boost' and source_id = new.id),
              'started', old.start_at <= now(),
              'reason', new.cancel_reason));
  end if;
  return new;
end;
$$;

revoke execute on function public.flydelivery_campaign_after_change() from public, anon, authenticated;

drop trigger if exists flydelivery_campaign_after_change on public.flydelivery_campaigns;
create trigger flydelivery_campaign_after_change
  after insert or update on public.flydelivery_campaigns
  for each row execute function public.flydelivery_campaign_after_change();

-- 9. CONTRATAR: uma transação, preço do banco, cobrança junto -----------------------------

-- Quando sai a próxima fatura da loja: o fim do ciclo de uso aberto. No
-- período grátis ainda não há data (a primeira cobrança só é marcada quando
-- o período grátis acaba) — a tela explica isso em vez de inventar um dia.
create or replace function public.billing_next_invoice_at(p_company_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select case when bc.cycle_type = 'usage' and bc.status in ('open', 'calculating') then bc.cycle_end
              else s.first_charge_at end
    from public.subscriptions s
    left join public.billing_cycles bc on bc.id = s.current_cycle_id
   where s.company_id = p_company_id and s.status not in ('canceled', 'expired')
   order by s.created_at desc
   limit 1;
$$;

revoke all on function public.billing_next_invoice_at(uuid) from public, anon, authenticated;
create or replace function public.flydelivery_contract_boost(
  p_product_id uuid,
  p_plan_id uuid,
  p_idempotency_key text,
  p_terms_accepted boolean,
  p_start_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_prod record;
  v_plan record;
  v_sub record;
  v_cycle uuid;
  v_settings record;
  v_start timestamptz;
  v_campaign record;
  v_charge_id uuid;
  v_existing record;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para impulsionar.' using errcode = '42501';
  end if;
  if p_terms_accepted is not true then
    raise exception 'Confirme que está ciente da cobrança na próxima fatura.' using errcode = '23514';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 80 then
    raise exception 'Identificador da contratação inválido.' using errcode = '22023';
  end if;

  select mp.id, mp.pizzeria_id, mp.name into v_prod from public.menu_products mp where mp.id = p_product_id;
  if v_prod.id is null then
    raise exception 'Produto não encontrado.' using errcode = '23514';
  end if;
  if not (coalesce(public.is_admin(), false) or public.owns_pizzeria(v_uid, v_prod.pizzeria_id)) then
    raise exception 'Sem permissão para esta loja.' using errcode = '42501';
  end if;

  -- Mesmo pedido de novo (toque duplo, retry, página recarregada): devolve o
  -- que já foi contratado, sem criar outro nem cobrar de novo.
  select c.id into v_existing from public.flydelivery_campaigns c
   where c.pizzeria_id = v_prod.pizzeria_id and c.idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    return public.flydelivery_boost_receipt(v_existing.id) || jsonb_build_object('duplicate', true);
  end if;

  select * into v_plan from public.flydelivery_campaign_plans where id = p_plan_id and active;
  if v_plan.id is null then
    raise exception 'Pacote indisponível. Escolha outro período.' using errcode = '23514';
  end if;

  select * into v_settings from public.flydelivery_boost_settings where id;

  -- Pós-pago precisa de uma assinatura em dia para receber a cobrança.
  select s.id, s.status, s.current_cycle_id into v_sub from public.subscriptions s
   where s.company_id = v_prod.pizzeria_id and s.status not in ('canceled', 'expired')
   order by s.created_at desc limit 1;
  if v_sub.id is null or v_sub.status in ('pending_activation', 'pending_payment') then
    raise exception 'Para impulsionar, sua loja precisa de um plano FlyControl ativo.' using errcode = '23514';
  end if;
  if v_sub.status in ('past_due', 'suspended') then
    raise exception 'Há uma fatura do FlyControl em aberto. Regularize para voltar a impulsionar.'
      using errcode = '23514';
  end if;
  if v_sub.status = 'free_trial' and not coalesce(v_settings.allow_during_trial, true) then
    raise exception 'Impulsionar fica disponível depois do período grátis.' using errcode = '23514';
  end if;
  select id into v_cycle from public.billing_cycles
   where subscription_id = v_sub.id and status = 'open' order by cycle_start desc limit 1;
  v_cycle := coalesce(v_cycle, v_sub.current_cycle_id);
  v_start := greatest(now(), coalesce(p_start_at, now()));
  if v_start > now() + make_interval(days => coalesce(v_settings.max_schedule_days, 30)) then
    raise exception 'O início pode ser agendado para até % dias.', v_settings.max_schedule_days
      using errcode = '23514';
  end if;

  perform set_config('flydelivery.contracting', 'on', true);
  begin
    -- Valor escrito aqui também (e não só pela trava) para valer igual
    -- quando é o administrador contratando em nome da loja.
    insert into public.flydelivery_campaigns (
      pizzeria_id, product_id, plan_id, status, start_at, end_at, amount_cents, payment_status,
      contracted_at, contracted_by, terms_accepted_at, idempotency_key, created_by,
      product_name_snapshot, package_label_snapshot, duration_days_snapshot)
    values (
      v_prod.pizzeria_id, v_prod.id, v_plan.id, 'active', v_start,
      v_start + make_interval(days => v_plan.duration_days), v_plan.price_cents,
      case when v_plan.price_cents > 0 then 'pending' else 'not_required' end,
      now(), v_uid, now(), p_idempotency_key, v_uid,
      v_prod.name, v_plan.label, v_plan.duration_days)
    returning * into v_campaign;
  exception when unique_violation then
    -- Duas confirmações ao mesmo tempo com a mesma chave: vale a primeira.
    perform set_config('flydelivery.contracting', 'off', true);
    select c.id into v_existing from public.flydelivery_campaigns c
     where c.pizzeria_id = v_prod.pizzeria_id and c.idempotency_key = p_idempotency_key;
    if v_existing.id is not null then
      return public.flydelivery_boost_receipt(v_existing.id) || jsonb_build_object('duplicate', true);
    end if;
    raise;
  end;
  perform set_config('flydelivery.contracting', 'off', true);

  -- O valor é o do pacote AGORA, congelado na campanha pela trava. Pacote de
  -- R$ 0 não gera lançamento (não há o que cobrar).
  if v_campaign.amount_cents > 0 then
    insert into public.billing_addon_charges (
      company_id, subscription_id, billing_cycle_id, source_type, source_id,
      description, quantity, unit_amount_cents, amount_cents, created_by, metadata)
    values (
      v_prod.pizzeria_id, v_sub.id, v_cycle, 'flydelivery_boost', v_campaign.id,
      format('Impulsionamento — %s — %s', v_prod.name, v_plan.label),
      1, v_campaign.amount_cents, v_campaign.amount_cents, v_uid,
      jsonb_build_object(
        'product_id', v_prod.id, 'product_name', v_prod.name,
        'plan_id', v_plan.id, 'package_label', v_plan.label, 'duration_days', v_plan.duration_days,
        'start_at', v_campaign.start_at, 'end_at', v_campaign.end_at))
    returning id into v_charge_id;
  end if;

  return public.flydelivery_boost_receipt(v_campaign.id) || jsonb_build_object('duplicate', false);
end;
$$;

-- O "comprovante" do contrato: o que a tela mostra depois de confirmar.
create or replace function public.flydelivery_boost_receipt(p_campaign_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'campaign_id', c.id,
    'product_name', coalesce(c.product_name_snapshot, mp.name),
    'package_label', c.package_label_snapshot,
    'duration_days', c.duration_days_snapshot,
    'amount_cents', c.amount_cents,
    'start_at', c.start_at,
    'end_at', c.end_at,
    'charge_id', ch.id,
    'charge_status', ch.status,
    'next_invoice_at', public.billing_next_invoice_at(c.pizzeria_id))
    from public.flydelivery_campaigns c
    join public.menu_products mp on mp.id = c.product_id
    left join public.billing_addon_charges ch
      on ch.source_type = 'flydelivery_boost' and ch.source_id = c.id
   where c.id = p_campaign_id;
$$;

revoke all on function public.flydelivery_boost_receipt(uuid) from public, anon, authenticated;
revoke all on function public.flydelivery_contract_boost(uuid, uuid, text, boolean, timestamptz) from public, anon;
grant execute on function public.flydelivery_contract_boost(uuid, uuid, text, boolean, timestamptz) to authenticated;

-- 10. FATURAR: pôr os lançamentos pendentes na fatura, uma vez só -------------------------
create or replace function public.billing_attach_addons(p_invoice_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv record;
  v_cycle_end timestamptz;
  v_charge record;
  v_item_id uuid;
  v_added bigint := 0;
begin
  -- Trava a fatura: duas execuções simultâneas esperam uma pela outra.
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if v_inv.id is null or v_inv.status not in ('draft', 'pending') then
    return 0;
  end if;
  -- Link de pagamento já gerado = valor da fatura já combinado com o cliente.
  -- Somar agora faria o link cobrar menos do que a fatura diz (e, ao pagar,
  -- tudo seria marcado como pago). Fica para a próxima fatura.
  if exists (select 1 from public.payment_transactions pt where pt.invoice_id = v_inv.id) then
    return 0;
  end if;
  select cycle_end into v_cycle_end from public.billing_cycles where id = v_inv.billing_cycle_id;

  for v_charge in
    select * from public.billing_addon_charges
     where company_id = v_inv.company_id
       and status = 'pending_invoice'
       and created_at <= coalesce(v_cycle_end, now())
     order by created_at
     for update
  loop
    insert into public.invoice_items (
      invoice_id, item_type, description, quantity, unit_amount_cents, total_amount_cents,
      metadata, addon_charge_id)
    values (
      v_inv.id, 'addon', v_charge.description, v_charge.quantity, v_charge.unit_amount_cents,
      v_charge.amount_cents,
      v_charge.metadata || jsonb_build_object('source_type', v_charge.source_type, 'source_id', v_charge.source_id),
      v_charge.id)
    on conflict (invoice_id, addon_charge_id) where addon_charge_id is not null do nothing
    returning id into v_item_id;

    if v_item_id is not null then
      update public.billing_addon_charges
         set status = 'invoiced', invoice_id = v_inv.id, invoice_item_id = v_item_id,
             billing_cycle_id = v_inv.billing_cycle_id, updated_at = now()
       where id = v_charge.id;
      v_added := v_added + v_charge.amount_cents;
    end if;
    v_item_id := null;
  end loop;

  if v_added > 0 then
    update public.invoices
       set subtotal_cents = subtotal_cents + v_added,
           total_cents = total_cents + v_added,
           updated_at = now()
     where id = v_inv.id;
  end if;
  return v_added;
end;
$$;

revoke all on function public.billing_attach_addons(uuid) from public, anon, authenticated;
grant execute on function public.billing_attach_addons(uuid) to service_role;

-- 11. A fatura muda de situação: os lançamentos acompanham ---------------------------------
create or replace function public.billing_addons_follow_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'paid' then
      update public.billing_addon_charges set status = 'paid', updated_at = now()
       where invoice_id = new.id and status = 'invoiced';
    elsif new.status = 'canceled' then
      -- Fatura cancelada (ex.: reemitida): o lançamento volta para a fila e
      -- entra na próxima — nunca some e nunca fica em duas faturas vivas.
      update public.billing_addon_charges
         set status = 'pending_invoice', invoice_id = null, invoice_item_id = null, updated_at = now()
       where invoice_id = new.id and status = 'invoiced';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.billing_addons_follow_invoice() from public, anon, authenticated;

drop trigger if exists billing_addons_follow_invoice on public.invoices;
create trigger billing_addons_follow_invoice
  after update of status on public.invoices
  for each row execute function public.billing_addons_follow_invoice();

-- 12. Leitura para o painel -----------------------------------------------------------------

-- Resumo da loja: ciclo atual, próxima cobrança e números do mês.
create or replace function public.flydelivery_boost_overview(p_pizzeria_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_mes timestamptz := date_trunc('month', now());
  v_out jsonb;
begin
  if not (coalesce(public.is_admin(), false) or public.owns_pizzeria(auth.uid(), p_pizzeria_id)) then
    raise exception 'Sem permissão para esta loja.' using errcode = '42501';
  end if;

  select s.id, s.status, bc.cycle_start, bc.cycle_end, bc.cycle_type
    into v_sub
    from public.subscriptions s
    left join public.billing_cycles bc on bc.id = s.current_cycle_id
   where s.company_id = p_pizzeria_id and s.status not in ('canceled', 'expired')
   order by s.created_at desc limit 1;

  select jsonb_build_object(
    -- Pode contratar agora? (mesma regra da função de contratar, para a tela
    -- avisar antes em vez de só dar erro no fim.)
    'can_contract', v_sub.id is not null
        and v_sub.status in ('active', 'free_trial')
        and (v_sub.status <> 'free_trial'
             or coalesce((select allow_during_trial from public.flydelivery_boost_settings where id), true)),
    'subscription_status', v_sub.status,
    'cycle_start', v_sub.cycle_start,
    'cycle_end', v_sub.cycle_end,
    'cycle_type', v_sub.cycle_type,
    'next_invoice_at', public.billing_next_invoice_at(p_pizzeria_id),
    'max_schedule_days', (select max_schedule_days from public.flydelivery_boost_settings where id),
    'refund_if_not_started', (select refund_if_not_started from public.flydelivery_boost_settings where id),
    'pending_amount_cents', coalesce((select sum(amount_cents) from public.billing_addon_charges
        where company_id = p_pizzeria_id and status = 'pending_invoice'), 0),
    'month_invested_cents', coalesce((select sum(amount_cents) from public.billing_addon_charges
        where company_id = p_pizzeria_id and created_at >= v_mes
          and status in ('pending_invoice', 'invoiced', 'paid')), 0),
    -- Conta o que foi contratado e segue valendo na cobrança: um anúncio
    -- cancelado depois de começar continua cobrado, então continua contando.
    'month_days_contracted', coalesce((select sum(c.duration_days_snapshot) from public.flydelivery_campaigns c
        left join public.billing_addon_charges ch on ch.source_type = 'flydelivery_boost' and ch.source_id = c.id
        where c.pizzeria_id = p_pizzeria_id and c.contracted_at >= v_mes
          and coalesce(ch.status, case when c.status = 'cancelled' then 'cancelled' end, 'x') not in ('cancelled', 'refunded')), 0),
    'month_products', (select count(distinct c.product_id) from public.flydelivery_campaigns c
        left join public.billing_addon_charges ch on ch.source_type = 'flydelivery_boost' and ch.source_id = c.id
        where c.pizzeria_id = p_pizzeria_id and c.contracted_at >= v_mes
          and coalesce(ch.status, case when c.status = 'cancelled' then 'cancelled' end, 'x') not in ('cancelled', 'refunded')),
    'active_now', (select count(*) from public.flydelivery_campaigns c
        where c.pizzeria_id = p_pizzeria_id and c.status = 'active'
          and c.start_at <= now() and c.end_at > now()),
    'scheduled', (select count(*) from public.flydelivery_campaigns c
        where c.pizzeria_id = p_pizzeria_id and c.status = 'active' and c.start_at > now()),
    'month_impressions', (select count(*) from public.flydelivery_events e
        where e.store_id = p_pizzeria_id and e.event_type = 'campaign_impression' and e.created_at >= v_mes),
    'month_clicks', (select count(*) from public.flydelivery_events e
        where e.store_id = p_pizzeria_id and e.event_type = 'campaign_click' and e.created_at >= v_mes),
    -- Pedidos com pelo menos um item que veio de anúncio (o app grava
    -- origin = flydelivery_campaign no item). Pedido cancelado não conta.
    'month_orders', (select count(distinct o.id) from public.orders o
        cross join lateral jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) it
        where o.tenant_id = p_pizzeria_id and o.source = 'flydelivery' and o.created_at >= v_mes
          and coalesce(o.status, '') not in ('cancelado', 'cancelled', 'canceled', 'recusado', 'deleted')
          and it ->> 'origin' = 'flydelivery_campaign'),
    'month_orders_revenue_cents', coalesce((select round(sum(case when jsonb_typeof(it -> 'total_price') = 'number'
                                          then (it ->> 'total_price')::numeric else 0 end) * 100)
        from public.orders o
        cross join lateral jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) it
        where o.tenant_id = p_pizzeria_id and o.source = 'flydelivery' and o.created_at >= v_mes
          and coalesce(o.status, '') not in ('cancelado', 'cancelled', 'canceled', 'recusado', 'deleted')
          and it ->> 'origin' = 'flydelivery_campaign'), 0)
  ) into v_out;
  return v_out;
end;
$$;

revoke all on function public.flydelivery_boost_overview(uuid) from public, anon;
grant execute on function public.flydelivery_boost_overview(uuid) to authenticated;

-- Lista de impulsionamentos da loja, com cobrança e desempenho.
create or replace function public.flydelivery_boost_list(p_pizzeria_id uuid)
returns table(
  campaign_id uuid, product_id uuid, product_name text, image_url text,
  package_label text, duration_days integer, amount_cents bigint,
  status text, display_status text, start_at timestamptz, end_at timestamptz,
  contracted_at timestamptz, days_remaining integer,
  charge_status text, invoice_number text,
  impressions bigint, clicks bigint, review_note text, cancelled_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (coalesce(public.is_admin(), false) or public.owns_pizzeria(auth.uid(), p_pizzeria_id)) then
    raise exception 'Sem permissão para esta loja.' using errcode = '42501';
  end if;
  return query
    select c.id, mp.id, coalesce(c.product_name_snapshot, mp.name), mp.image_url,
           coalesce(c.package_label_snapshot, p.label),
           coalesce(c.duration_days_snapshot, p.duration_days),
           c.amount_cents, c.status,
           public.flydelivery_campaign_display_status(c.status, c.start_at, c.end_at),
           c.start_at, c.end_at, coalesce(c.contracted_at, c.created_at),
           greatest(0, ceil(extract(epoch from (c.end_at - greatest(now(), c.start_at))) / 86400))::integer,
           ch.status, inv.invoice_number,
           coalesce(e.imp, 0), coalesce(e.clk, 0), c.review_note, c.cancelled_at
      from public.flydelivery_campaigns c
      join public.menu_products mp on mp.id = c.product_id
      left join public.flydelivery_campaign_plans p on p.id = c.plan_id
      left join public.billing_addon_charges ch on ch.source_type = 'flydelivery_boost' and ch.source_id = c.id
      left join public.invoices inv on inv.id = ch.invoice_id
      left join lateral (
        select count(*) filter (where ev.event_type = 'campaign_impression') as imp,
               count(*) filter (where ev.event_type = 'campaign_click') as clk
          from public.flydelivery_events ev where ev.campaign_id = c.id
      ) e on true
     where c.pizzeria_id = p_pizzeria_id
     order by coalesce(c.contracted_at, c.created_at) desc;
end;
$$;

revoke all on function public.flydelivery_boost_list(uuid) from public, anon;
grant execute on function public.flydelivery_boost_list(uuid) to authenticated;

-- Administração: todos os impulsionamentos, com loja, cobrança e fatura.
create or replace function public.flydelivery_boost_admin_list()
returns table(
  campaign_id uuid, pizzeria_id uuid, store_name text, product_name text, image_url text,
  package_label text, duration_days integer, amount_cents bigint,
  status text, display_status text, priority integer,
  start_at timestamptz, end_at timestamptz, contracted_at timestamptz,
  charge_id uuid, charge_status text, invoice_number text, impressions bigint, clicks bigint,
  review_note text, issues text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Somente o administrador.' using errcode = '42501';
  end if;
  return query
    select c.id, c.pizzeria_id, pz.name, coalesce(c.product_name_snapshot, mp.name), mp.image_url,
           coalesce(c.package_label_snapshot, p.label), coalesce(c.duration_days_snapshot, p.duration_days),
           c.amount_cents, c.status,
           public.flydelivery_campaign_display_status(c.status, c.start_at, c.end_at),
           c.priority, c.start_at, c.end_at, coalesce(c.contracted_at, c.created_at),
           ch.id, ch.status, inv.invoice_number, coalesce(e.imp, 0), coalesce(e.clk, 0), c.review_note,
           public.flydelivery_campaign_issues_of(mp.active, mp.available, mp.name, mp.image_url,
             mp.price, public.flydelivery_store_listed(c.pizzeria_id))
      from public.flydelivery_campaigns c
      join public.menu_products mp on mp.id = c.product_id
      join public.pizzerias pz on pz.id = c.pizzeria_id
      left join public.flydelivery_campaign_plans p on p.id = c.plan_id
      left join public.billing_addon_charges ch on ch.source_type = 'flydelivery_boost' and ch.source_id = c.id
      left join public.invoices inv on inv.id = ch.invoice_id
      left join lateral (
        select count(*) filter (where ev.event_type = 'campaign_impression') as imp,
               count(*) filter (where ev.event_type = 'campaign_click') as clk
          from public.flydelivery_events ev where ev.campaign_id = c.id
      ) e on true
     order by (c.status = 'pending') desc, coalesce(c.contracted_at, c.created_at) desc
     limit 1000;
end;
$$;

revoke all on function public.flydelivery_boost_admin_list() from public, anon;
grant execute on function public.flydelivery_boost_admin_list() to authenticated;
