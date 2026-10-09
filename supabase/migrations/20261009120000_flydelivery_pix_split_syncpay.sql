-- ============================================================================
-- FLYDELIVERY — PIX PAGO NO APLICATIVO, COM DIVISÃO AUTOMÁTICA (SPLIT) SYNCPAY
--
-- O QUE MUDA NA PRÁTICA
-- O cliente paga o pedido pelo Pix dentro do aplicativo. A SyncPay recebe UM
-- pagamento e já divide: a parte do estabelecimento cai na conta SyncPay dele
-- e a comissão do FlyDelivery fica na conta da plataforma. Ninguém precisa
-- mandar comprovante.
--
-- A REGRA MAIS IMPORTANTE: PEDIDO SÓ NASCE PAGO
-- Enquanto o cliente não paga, o pedido NÃO entra na tabela `orders`. Ele
-- fica numa "sala de espera" (`flydelivery_checkouts`), com a conta já feita
-- pelo servidor. Só quando a SyncPay confirma o pagamento — e o servidor
-- reconfere direto na SyncPay — o pedido é criado em `orders`, já como pago.
--
-- Por que assim: tudo que já existe reage quando um pedido entra (som de novo
-- pedido no painel, baixa de estoque, contagem da mensalidade, relatórios).
-- Um Pix gerado e nunca pago não pode tocar a campainha da cozinha nem contar
-- como venda. É a comanda que só vai para a cozinha depois que o caixa
-- recebeu.
--
-- AS GARANTIAS (no banco, não na tela)
--   * O valor cobrado sai da conta feita no servidor, nunca do celular.
--   * Uma cobrança ativa por pedido: duplo toque, internet caindo, tela
--     reaberta — não nasce segunda cobrança (índice único + trava de linha).
--   * Confirmar o pagamento cria o pedido UMA vez só, mesmo que o aviso da
--     SyncPay chegue repetido ou fora de ordem.
--   * Percentual e valores ficam congelados em cada pagamento: mudar a
--     comissão amanhã não mexe no que já foi vendido.
--   * Loja só enxerga o que é dela; comissão só o administrador altera; toda
--     alteração financeira vai para a auditoria.
--   * Dinheiro em centavos inteiros (bigint). Nada de casas decimais.
--
-- Esta migração é idempotente: pode rodar de novo sem estragar nada.
-- ============================================================================

-- 1. Configuração geral da plataforma (uma linha só) -------------------------
create table if not exists public.flydelivery_payment_settings (
  id boolean primary key default true check (id),
  -- Comissão padrão do FlyDelivery, em percentual INTEIRO. A SyncPay só aceita
  -- percentual inteiro no split do Pix, por isso não existe 2,5%.
  -- O teto de 50% existe para pegar erro de digitação (97 no lugar de 3).
  default_fee_percent integer not null default 3
    check (default_fee_percent between 1 and 50),
  -- Quem arca com a tarifa de processamento da SyncPay. Depende do contrato
  -- real com a SyncPay; enquanto não for definido, os relatórios dizem
  -- "não definido" em vez de presumir.
  gateway_fee_bearer text not null default 'nao_definido'
    check (gateway_fee_bearer in ('nao_definido', 'plataforma', 'estabelecimento', 'proporcional')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.flydelivery_payment_settings (id) values (true)
on conflict (id) do nothing;

-- 2. Conta recebedora de cada estabelecimento --------------------------------
create table if not exists public.flydelivery_payment_accounts (
  pizzeria_id uuid primary key references public.pizzerias(id) on delete cascade,
  -- O identificador da conta SyncPay DO ESTABELECIMENTO (o "user_id" do
  -- split). Nunca o segredo da conta: para receber, a SyncPay só precisa
  -- saber para quem mandar.
  syncpay_user_id text
    check (syncpay_user_id is null or syncpay_user_id ~ '^[A-Za-z0-9._:-]{6,128}$'),
  -- nao_configurada → aguardando_verificacao (loja informou) → ativa
  -- (administrador conferiu com a SyncPay) | recusada | suspensa.
  -- Só "ativa" libera o Pix no aplicativo.
  status text not null default 'nao_configurada'
    check (status in ('nao_configurada', 'aguardando_verificacao', 'ativa', 'recusada', 'suspensa')),
  status_note text check (status_note is null or char_length(status_note) <= 500),
  -- Comissão combinada com esta loja. Vazio = vale a padrão.
  fee_percent_override integer check (fee_percent_override between 1 and 50),
  -- A loja escolhe oferecer (ou não) o Pix pelo aplicativo.
  pix_online_enabled boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma conta recebedora pertence a UM estabelecimento. Duas lojas com o mesmo
-- recebedor seria dinheiro de uma caindo na conta da outra.
create unique index if not exists flydelivery_payment_accounts_recipient_uniq
  on public.flydelivery_payment_accounts (lower(syncpay_user_id))
  where syncpay_user_id is not null;

-- 3. Sala de espera: o pedido calculado, aguardando o pagamento ---------------
create table if not exists public.flydelivery_checkouts (
  id uuid primary key default gen_random_uuid(),
  -- A mesma "senha" do pedido que o aplicativo já usa contra pedido repetido.
  request_id text not null unique check (char_length(request_id) between 8 and 120),
  store_id uuid not null references public.pizzerias(id) on delete restrict,
  -- Conta excluída (LGPD) não apaga o registro financeiro; só desliga o nome.
  customer_id uuid references auth.users(id) on delete set null,
  -- A linha de `orders` pronta, exatamente como o servidor a calculou.
  order_snapshot jsonb not null,
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  delivery_fee_cents bigint not null check (delivery_fee_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents bigint not null check (total_cents > 0),
  coupon_id uuid,
  status text not null default 'aguardando_pagamento'
    check (status in ('aguardando_pagamento', 'pago', 'expirado', 'cancelado')),
  order_id uuid unique references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Depois disso o pedido não é mais criado automaticamente: um pagamento que
  -- chegue tarde vai para a conciliação, em vez de mandar comida para a porta
  -- de alguém um dia depois.
  expires_at timestamptz not null default (now() + interval '24 hours'),
  paid_at timestamptz,
  constraint flydelivery_checkouts_total_bate
    check (total_cents = subtotal_cents + delivery_fee_cents - discount_cents)
);

create index if not exists flydelivery_checkouts_customer_idx
  on public.flydelivery_checkouts (customer_id, created_at desc);
create index if not exists flydelivery_checkouts_store_idx
  on public.flydelivery_checkouts (store_id, created_at desc);

-- 4. Pagamentos (uma cobrança Pix na SyncPay = uma linha) ---------------------
create table if not exists public.flydelivery_payments (
  id uuid primary key default gen_random_uuid(),
  checkout_id uuid not null references public.flydelivery_checkouts(id) on delete restrict,
  store_id uuid not null references public.pizzerias(id) on delete restrict,
  customer_id uuid references auth.users(id) on delete set null,
  provider text not null default 'syncpay' check (provider = 'syncpay'),
  -- O "identifier" que a SyncPay devolve ao criar a cobrança.
  provider_reference text unique,
  -- criando    = pedido de cobrança indo para a SyncPay agora
  -- pendente   = QR Code gerado, esperando o cliente pagar
  -- pago       = SyncPay confirmou E o servidor reconferiu valor e situação
  -- falhou     = a SyncPay recusou ou o pagamento falhou
  -- incerto    = a resposta da SyncPay se perdeu: não se sabe se a cobrança
  --              nasceu. Nunca é repetida sozinha; vai para a conciliação.
  -- expirado   = o prazo do pedido passou sem pagamento
  -- estornado  = dinheiro devolvido (informado pela SyncPay)
  -- em_disputa = contestação Pix (MED) informada pela SyncPay
  -- divergente = a SyncPay disse "pago", mas valor ou recebedor não batem.
  --              O pedido NÃO é liberado; um humano confere.
  -- duplicado  = pago, mas o pedido já tinha sido pago por outra cobrança.
  --              Dinheiro a devolver ao cliente; não gera segundo pedido.
  status text not null default 'criando'
    check (status in ('criando', 'pendente', 'pago', 'falhou', 'incerto', 'expirado',
                      'estornado', 'em_disputa', 'divergente', 'duplicado')),
  amount_cents bigint not null check (amount_cents > 0),
  -- Fotografia da divisão no momento da venda.
  fee_percent integer not null check (fee_percent between 1 and 50),
  store_percent integer not null,
  recipient_user_id text not null,
  -- Valores BRUTOS previstos (antes da tarifa da SyncPay). A parte da loja é
  -- arredondada para baixo no centavo e o centavo que sobra fica com a
  -- plataforma — a regra está escrita em src/lib/flydelivery/pagamentos/split.ts.
  platform_amount_cents bigint not null check (platform_amount_cents >= 0),
  store_amount_cents bigint not null check (store_amount_cents >= 0),
  -- Só preenchidos quando a própria SyncPay informar. Nunca estimados.
  gateway_fee_cents bigint check (gateway_fee_cents >= 0),
  provider_amount_cents bigint,
  provider_status text,
  -- O que a SyncPay respondeu na última consulta, sem dados pessoais.
  provider_snapshot jsonb,
  pix_code text,
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 500),
  needs_reconciliation boolean not null default false,
  reconciliation_note text check (reconciliation_note is null or char_length(reconciliation_note) <= 500),
  order_id uuid references public.orders(id) on delete set null,
  last_checked_at timestamptz,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flydelivery_payments_percentuais_fecham check (store_percent = 100 - fee_percent),
  constraint flydelivery_payments_valores_fecham
    check (platform_amount_cents + store_amount_cents = amount_cents)
);

-- A trava contra cobrança dupla: no máximo UMA cobrança viva por pedido.
-- "incerto", "falhou" e "expirado" ficam de fora porque o cliente nunca
-- recebeu (ou não pode mais usar) aquele QR Code — gerar outro não cria
-- risco de pagar duas vezes.
create unique index if not exists flydelivery_payments_uma_ativa_por_pedido
  on public.flydelivery_payments (checkout_id)
  where status in ('criando', 'pendente', 'pago', 'em_disputa', 'divergente');

create index if not exists flydelivery_payments_store_idx
  on public.flydelivery_payments (store_id, created_at desc);
create index if not exists flydelivery_payments_status_idx
  on public.flydelivery_payments (status, created_at);
create index if not exists flydelivery_payments_conciliacao_idx
  on public.flydelivery_payments (needs_reconciliation) where needs_reconciliation;

-- 5. Avisos recebidos da SyncPay (webhooks) -----------------------------------
create table if not exists public.flydelivery_payment_events (
  id bigint generated always as identity primary key,
  provider text not null default 'syncpay',
  -- event_id da SyncPay quando vier; senão, a impressão digital (SHA-256) do
  -- corpo. O mesmo aviso chegando duas vezes esbarra aqui.
  event_key text not null unique,
  event_type text,
  provider_reference text,
  auth_method text check (auth_method in ('hmac', 'bearer')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text,
  error text,
  -- Sem CPF, e-mail, telefone ou nome: só o que serve para conferir.
  payload jsonb
);

create index if not exists flydelivery_payment_events_ref_idx
  on public.flydelivery_payment_events (provider_reference, received_at desc);

-- 6. Auditoria financeira ------------------------------------------------------
create table if not exists public.flydelivery_finance_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_kind text not null check (actor_kind in ('admin', 'loja', 'sistema')),
  action text not null,
  store_id uuid,
  payment_id uuid,
  before jsonb,
  after jsonb,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists flydelivery_finance_audit_store_idx
  on public.flydelivery_finance_audit (store_id, created_at desc);

-- 7. O pedido sabe qual pagamento o liberou ------------------------------------
alter table public.orders
  add column if not exists flydelivery_payment_id uuid
    references public.flydelivery_payments(id) on delete set null;

create unique index if not exists orders_flydelivery_payment_uniq
  on public.orders (flydelivery_payment_id) where flydelivery_payment_id is not null;

-- O rótulo que a cozinha lê no pedido pago pelo aplicativo.
create or replace function public.flydelivery_pix_paid_label()
returns text
language sql
immutable
as $$ select 'Pix (pago no app)'::text $$;

-- Ninguém de fora (site, aplicativo, painel) carimba um pedido como "pago no
-- app". Sem esta trava, qualquer um poderia criar um pedido com esse rótulo e
-- a cozinha entregaria achando que o dinheiro já entrou — a porta de cinema
-- destrancada. Só o servidor, ao confirmar na SyncPay, coloca esse carimbo.
create or replace function public.orders_guard_flydelivery_payment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), '');
begin
  if v_role not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.flydelivery_payment_id is not null
       or lower(coalesce(new.payment_method, '')) = lower(public.flydelivery_pix_paid_label()) then
      raise exception 'Pedido pago no aplicativo só é criado pelo servidor.' using errcode = '42501';
    end if;
  else
    if new.flydelivery_payment_id is distinct from old.flydelivery_payment_id then
      raise exception 'O pagamento de um pedido não pode ser trocado.' using errcode = '42501';
    end if;
    if lower(coalesce(new.payment_method, '')) = lower(public.flydelivery_pix_paid_label())
       and lower(coalesce(old.payment_method, '')) <> lower(public.flydelivery_pix_paid_label()) then
      raise exception 'Pedido pago no aplicativo só é marcado pelo servidor.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_guard_flydelivery_payment on public.orders;
create trigger orders_guard_flydelivery_payment
  before insert or update of flydelivery_payment_id, payment_method on public.orders
  for each row execute function public.orders_guard_flydelivery_payment();

-- 8. updated_at automático -----------------------------------------------------
create or replace function public.flydelivery_payments_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists flydelivery_payments_touch on public.flydelivery_payments;
create trigger flydelivery_payments_touch
  before update on public.flydelivery_payments
  for each row execute function public.flydelivery_payments_touch();

drop trigger if exists flydelivery_payment_accounts_touch on public.flydelivery_payment_accounts;
create trigger flydelivery_payment_accounts_touch
  before update on public.flydelivery_payment_accounts
  for each row execute function public.flydelivery_payments_touch();

-- 9. Quem vê o quê (RLS) -------------------------------------------------------
alter table public.flydelivery_payment_settings enable row level security;
alter table public.flydelivery_payment_accounts enable row level security;
alter table public.flydelivery_checkouts enable row level security;
alter table public.flydelivery_payments enable row level security;
alter table public.flydelivery_payment_events enable row level security;
alter table public.flydelivery_finance_audit enable row level security;

-- Escrever só pelo servidor ou pelas funções abaixo, que conferem quem pede.
revoke insert, update, delete, truncate on public.flydelivery_payment_settings from anon, authenticated;
revoke insert, update, delete, truncate on public.flydelivery_payment_accounts from anon, authenticated;
revoke insert, update, delete, truncate on public.flydelivery_checkouts from anon, authenticated;
revoke insert, update, delete, truncate on public.flydelivery_payments from anon, authenticated;
revoke all on public.flydelivery_payment_events from anon, authenticated;
revoke insert, update, delete, truncate on public.flydelivery_finance_audit from anon, authenticated;
revoke select on public.flydelivery_payment_settings, public.flydelivery_payment_accounts,
  public.flydelivery_checkouts, public.flydelivery_payments, public.flydelivery_finance_audit from anon;
grant select on public.flydelivery_payment_settings, public.flydelivery_payment_accounts,
  public.flydelivery_checkouts, public.flydelivery_payments, public.flydelivery_payment_events,
  public.flydelivery_finance_audit to authenticated;
grant all on public.flydelivery_payment_settings, public.flydelivery_payment_accounts,
  public.flydelivery_checkouts, public.flydelivery_payments, public.flydelivery_payment_events,
  public.flydelivery_finance_audit to service_role;

drop policy if exists flydelivery_payment_settings_read on public.flydelivery_payment_settings;
create policy flydelivery_payment_settings_read on public.flydelivery_payment_settings
  for select to authenticated using (true);

drop policy if exists flydelivery_payment_accounts_read on public.flydelivery_payment_accounts;
create policy flydelivery_payment_accounts_read on public.flydelivery_payment_accounts
  for select to authenticated
  using (public.is_admin() or public.owns_pizzeria(auth.uid(), pizzeria_id));

drop policy if exists flydelivery_checkouts_read on public.flydelivery_checkouts;
create policy flydelivery_checkouts_read on public.flydelivery_checkouts
  for select to authenticated
  using (public.is_admin() or customer_id = auth.uid());

-- O CLIENTE não lê esta tabela: comissão e conta recebedora são assunto da
-- loja com a plataforma. O aplicativo pergunta a situação ao servidor.
drop policy if exists flydelivery_payments_read on public.flydelivery_payments;
create policy flydelivery_payments_read on public.flydelivery_payments
  for select to authenticated
  using (public.is_admin() or public.owns_pizzeria(auth.uid(), store_id));

drop policy if exists flydelivery_payment_events_read on public.flydelivery_payment_events;
create policy flydelivery_payment_events_read on public.flydelivery_payment_events
  for select to authenticated using (public.is_admin());

drop policy if exists flydelivery_finance_audit_read on public.flydelivery_finance_audit;
create policy flydelivery_finance_audit_read on public.flydelivery_finance_audit
  for select to authenticated
  using (public.is_admin() or (store_id is not null and public.owns_pizzeria(auth.uid(), store_id)));

-- 10. Comissão que vale para uma loja -----------------------------------------
create or replace function public.flydelivery_effective_fee_percent(p_store_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select a.fee_percent_override from public.flydelivery_payment_accounts a
      where a.pizzeria_id = p_store_id),
    (select s.default_fee_percent from public.flydelivery_payment_settings s where s.id),
    3
  );
$$;

-- Só o servidor: a comissão de uma loja é acordo comercial dela, não é
-- assunto de outra loja nem de cliente.
revoke execute on function public.flydelivery_effective_fee_percent(uuid) from public, anon, authenticated;
grant execute on function public.flydelivery_effective_fee_percent(uuid) to service_role;

-- 11. O aplicativo pergunta: esta loja aceita Pix pelo app? --------------------
-- Responde só sim ou não. Não revela recebedor, comissão nem situação.
create or replace function public.flydelivery_online_pix_available(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.flydelivery_payment_accounts a
     where a.pizzeria_id = p_store_id
       and a.status = 'ativa'
       and a.pix_online_enabled
       and a.syncpay_user_id is not null
  );
$$;

revoke execute on function public.flydelivery_online_pix_available(uuid) from public;
grant execute on function public.flydelivery_online_pix_available(uuid) to anon, authenticated, service_role;

-- 12. Criar a sala de espera (chamado pela função de pedido do FlyDelivery) ---
-- Recebe a linha de `orders` que o servidor calculou e guarda até o pagamento.
-- Mesma senha (request_id) = mesma sala: reabrir o checkout não cria outra.
create or replace function public.flydelivery_checkout_create(
  p_request_id text,
  p_customer_id uuid,
  p_snapshot jsonb,
  p_coupon_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.flydelivery_checkouts;
  v_store uuid;
  v_subtotal bigint;
  v_fee bigint;
  v_discount bigint;
  v_total bigint;
  v_row public.flydelivery_checkouts;
begin
  if p_request_id is null or char_length(p_request_id) < 8 then
    raise exception 'request_id inválido' using errcode = '22023';
  end if;
  if p_customer_id is null then
    raise exception 'cliente obrigatório' using errcode = '22023';
  end if;

  select * into v_existing from public.flydelivery_checkouts where request_id = p_request_id;
  if found then
    if v_existing.customer_id is distinct from p_customer_id then
      raise exception 'request_conflict' using errcode = '42501';
    end if;
    return jsonb_build_object('checkout_id', v_existing.id, 'duplicate', true,
                              'total_cents', v_existing.total_cents, 'status', v_existing.status);
  end if;

  v_store := nullif(p_snapshot->>'tenant_id', '')::uuid;
  if v_store is null then
    raise exception 'pedido sem loja' using errcode = '22023';
  end if;
  if (p_snapshot->>'customer_id') is distinct from p_customer_id::text then
    raise exception 'pedido em nome de outra conta' using errcode = '42501';
  end if;
  if coalesce(p_snapshot->>'source', '') <> 'flydelivery' then
    raise exception 'origem inválida' using errcode = '22023';
  end if;
  if not public.flydelivery_online_pix_available(v_store) then
    raise exception 'pix_indisponivel' using errcode = 'P0001';
  end if;

  -- Reais (numeric exato, sem ponto flutuante) → centavos inteiros.
  v_subtotal := round(coalesce((p_snapshot->>'subtotal')::numeric, -1) * 100);
  v_fee      := round(coalesce((p_snapshot->>'delivery_fee')::numeric, 0) * 100);
  v_discount := round(coalesce((p_snapshot->>'discount')::numeric, 0) * 100);
  v_total    := round(coalesce((p_snapshot->>'total')::numeric, -1) * 100);

  if v_subtotal < 0 or v_total <= 0 then
    raise exception 'valores inválidos' using errcode = '22023';
  end if;
  if v_total <> v_subtotal + v_fee - v_discount then
    raise exception 'total não confere com produtos + entrega - desconto' using errcode = '22023';
  end if;

  insert into public.flydelivery_checkouts (
    request_id, store_id, customer_id, order_snapshot,
    subtotal_cents, delivery_fee_cents, discount_cents, total_cents, coupon_id
  ) values (
    p_request_id, v_store, p_customer_id, p_snapshot,
    v_subtotal, v_fee, v_discount, v_total, p_coupon_id
  )
  returning * into v_row;

  return jsonb_build_object('checkout_id', v_row.id, 'duplicate', false,
                            'total_cents', v_row.total_cents, 'status', v_row.status);
end;
$$;

revoke execute on function public.flydelivery_checkout_create(text, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.flydelivery_checkout_create(text, uuid, jsonb, uuid) to service_role;

-- 13. Reservar a cobrança (antes de chamar a SyncPay) --------------------------
-- A linha da sala de espera fica travada enquanto se decide: duas chamadas ao
-- mesmo tempo (duplo toque) fazem fila, e a segunda encontra a primeira.
create or replace function public.flydelivery_pix_reserve(p_checkout_id uuid, p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checkout public.flydelivery_checkouts;
  v_account public.flydelivery_payment_accounts;
  v_active public.flydelivery_payments;
  v_fee integer;
  v_store_percent integer;
  v_store_cents bigint;
  v_attempts integer;
  v_payment_id uuid;
  v_store_name text;
begin
  select * into v_checkout from public.flydelivery_checkouts
   where id = p_checkout_id for update;

  -- Pedido de outra pessoa responde igual a pedido inexistente.
  if not found or v_checkout.customer_id is distinct from p_customer_id then
    return jsonb_build_object('acao', 'nao_encontrado');
  end if;

  if v_checkout.status = 'pago' then
    return jsonb_build_object('acao', 'pago', 'order_id', v_checkout.order_id);
  end if;

  if v_checkout.status = 'aguardando_pagamento' and v_checkout.expires_at < now() then
    update public.flydelivery_checkouts set status = 'expirado' where id = v_checkout.id;
    v_checkout.status := 'expirado';
  end if;

  if v_checkout.status <> 'aguardando_pagamento' then
    return jsonb_build_object('acao', 'indisponivel', 'motivo', v_checkout.status);
  end if;

  -- Uma criação que parou no meio (o servidor caiu entre pedir e anotar) vira
  -- "incerto" depois de 2 minutos — e vai para a conciliação.
  update public.flydelivery_payments
     set status = 'incerto',
         needs_reconciliation = true,
         failure_reason = coalesce(failure_reason, 'Criação da cobrança interrompida antes da resposta da SyncPay.')
   where checkout_id = v_checkout.id
     and status = 'criando'
     and created_at < now() - interval '2 minutes';

  select * into v_active from public.flydelivery_payments
   where checkout_id = v_checkout.id
     and status in ('criando', 'pendente', 'pago', 'em_disputa', 'divergente')
   order by created_at desc
   limit 1;

  if found then
    if v_active.status = 'pendente' then
      return jsonb_build_object(
        'acao', 'existente',
        'payment_id', v_active.id,
        'pix_code', v_active.pix_code,
        'amount_cents', v_active.amount_cents);
    elsif v_active.status = 'criando' then
      return jsonb_build_object('acao', 'em_andamento', 'payment_id', v_active.id);
    else
      return jsonb_build_object('acao', 'conferencia', 'payment_id', v_active.id,
                                'status', v_active.status);
    end if;
  end if;

  select count(*) into v_attempts from public.flydelivery_payments where checkout_id = v_checkout.id;
  if v_attempts >= 5 then
    return jsonb_build_object('acao', 'limite_tentativas');
  end if;

  select * into v_account from public.flydelivery_payment_accounts
   where pizzeria_id = v_checkout.store_id;

  if not found or v_account.status <> 'ativa' or not v_account.pix_online_enabled
     or v_account.syncpay_user_id is null then
    return jsonb_build_object('acao', 'loja_sem_pix');
  end if;

  v_fee := public.flydelivery_effective_fee_percent(v_checkout.store_id);
  if v_fee is null or v_fee < 1 or v_fee > 50 then
    return jsonb_build_object('acao', 'comissao_invalida');
  end if;
  v_store_percent := 100 - v_fee;
  -- A parte da loja arredonda para baixo no centavo; a plataforma fica com o
  -- centavo que sobra. Mesma regra de split.ts.
  v_store_cents := (v_checkout.total_cents * v_store_percent) / 100;

  insert into public.flydelivery_payments (
    checkout_id, store_id, customer_id, status, amount_cents,
    fee_percent, store_percent, recipient_user_id,
    platform_amount_cents, store_amount_cents
  ) values (
    v_checkout.id, v_checkout.store_id, v_checkout.customer_id, 'criando', v_checkout.total_cents,
    v_fee, v_store_percent, v_account.syncpay_user_id,
    v_checkout.total_cents - v_store_cents, v_store_cents
  )
  returning id into v_payment_id;

  select name into v_store_name from public.pizzerias where id = v_checkout.store_id;

  return jsonb_build_object(
    'acao', 'criar',
    'payment_id', v_payment_id,
    'checkout_id', v_checkout.id,
    'amount_cents', v_checkout.total_cents,
    'fee_percent', v_fee,
    'store_percent', v_store_percent,
    'recipient_user_id', v_account.syncpay_user_id,
    'store_name', coalesce(v_store_name, 'Estabelecimento'),
    'customer_name', v_checkout.order_snapshot->>'customer_name',
    'customer_phone', v_checkout.order_snapshot->>'customer_phone'
  );
end;
$$;

revoke execute on function public.flydelivery_pix_reserve(uuid, uuid) from public, anon, authenticated;
grant execute on function public.flydelivery_pix_reserve(uuid, uuid) to service_role;

-- 14. Anotar a resposta da SyncPay --------------------------------------------
create or replace function public.flydelivery_pix_register_charge(
  p_payment_id uuid,
  p_reference text,
  p_pix_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_reference), '') = '' or coalesce(trim(p_pix_code), '') = '' then
    raise exception 'resposta da SyncPay incompleta' using errcode = '22023';
  end if;

  update public.flydelivery_payments
     set status = 'pendente',
         provider_reference = p_reference,
         pix_code = p_pix_code,
         last_checked_at = now()
   where id = p_payment_id
     and status in ('criando', 'incerto');

  if not found then
    raise exception 'pagamento % não está aguardando criação', p_payment_id using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.flydelivery_pix_register_charge(uuid, text, text) from public, anon, authenticated;
grant execute on function public.flydelivery_pix_register_charge(uuid, text, text) to service_role;

create or replace function public.flydelivery_pix_creation_failed(
  p_payment_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('falhou', 'incerto') then
    raise exception 'status inválido para falha de criação: %', p_status using errcode = '22023';
  end if;

  update public.flydelivery_payments
     set status = p_status,
         failure_reason = left(coalesce(p_reason, ''), 500),
         needs_reconciliation = (p_status = 'incerto')
   where id = p_payment_id
     and status = 'criando';
end;
$$;

revoke execute on function public.flydelivery_pix_creation_failed(uuid, text, text) from public, anon, authenticated;
grant execute on function public.flydelivery_pix_creation_failed(uuid, text, text) to service_role;

-- 15. Poder consultar a SyncPay agora? (freio da conferência) ------------------
-- O aplicativo pergunta a situação a cada poucos segundos. Só uma pergunta
-- por intervalo vira consulta à SyncPay; as outras leem o que já está aqui.
create or replace function public.flydelivery_pix_claim_check(p_payment_id uuid, p_min_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.flydelivery_payments
     set last_checked_at = now()
   where id = p_payment_id
     and (last_checked_at is null
          or last_checked_at < now() - make_interval(secs => greatest(p_min_seconds, 1)));
  return found;
end;
$$;

revoke execute on function public.flydelivery_pix_claim_check(uuid, integer) from public, anon, authenticated;
grant execute on function public.flydelivery_pix_claim_check(uuid, integer) to service_role;

-- 16. Aplicar a situação que a SyncPay informou (já reconferida) --------------
-- O CORAÇÃO da confirmação. Recebe o que a CONSULTA à SyncPay devolveu (nunca
-- só o que o aviso disse) e decide, numa transação só, com a linha travada:
--   * "completed" com o valor certo → pedido criado (uma vez) e pago;
--   * valor diferente → "divergente", sem liberar pedido;
--   * avisos atrasados ou fora de ordem não desfazem o que já foi decidido
--     (um "pending" que chega depois do "completed" é ignorado).
create or replace function public.flydelivery_pix_apply_provider_status(
  p_payment_id uuid,
  p_provider_status text,
  p_provider_amount_cents bigint,
  p_provider_snapshot jsonb,
  p_split_ok boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.flydelivery_payments;
  v_checkout public.flydelivery_checkouts;
  v_target text;
  v_snap jsonb;
  v_order_id uuid;
  v_order_number integer;
  v_note text;
begin
  select * into v_pay from public.flydelivery_payments where id = p_payment_id for update;
  if not found then
    return jsonb_build_object('resultado', 'nao_encontrado');
  end if;

  v_target := case lower(coalesce(trim(p_provider_status), ''))
    when 'completed' then 'pago'
    when 'pending'   then 'pendente'
    when 'failed'    then 'falhou'
    when 'refunded'  then 'estornado'
    when 'med'       then 'em_disputa'
    else null
  end;

  update public.flydelivery_payments
     set provider_status = p_provider_status,
         provider_amount_cents = coalesce(p_provider_amount_cents, provider_amount_cents),
         provider_snapshot = coalesce(p_provider_snapshot, provider_snapshot),
         last_checked_at = now()
   where id = v_pay.id;

  if v_target is null then
    update public.flydelivery_payments
       set needs_reconciliation = true,
           reconciliation_note = left('SyncPay informou situação desconhecida: ' || coalesce(p_provider_status, '(vazia)'), 500)
     where id = v_pay.id;
    return jsonb_build_object('resultado', 'status_desconhecido', 'status', v_pay.status);
  end if;

  if v_target = v_pay.status then
    return jsonb_build_object('resultado', 'sem_mudanca', 'status', v_pay.status, 'order_id', v_pay.order_id);
  end if;

  -- Divergente e duplicado só saem pela mão de um administrador.
  if v_pay.status in ('divergente', 'duplicado') then
    return jsonb_build_object('resultado', 'sem_mudanca', 'status', v_pay.status);
  end if;

  -- ---------------------------------------------------------------- PAGO --
  if v_target = 'pago' then
    if v_pay.status = 'estornado' then
      update public.flydelivery_payments
         set needs_reconciliation = true,
             reconciliation_note = 'SyncPay voltou a informar "pago" depois de um estorno.'
       where id = v_pay.id;
      return jsonb_build_object('resultado', 'ignorado_pos_estorno', 'status', v_pay.status);
    end if;

    -- Disputa resolvida a favor: volta a "pago", o pedido já existe.
    if v_pay.status = 'em_disputa' then
      update public.flydelivery_payments set status = 'pago' where id = v_pay.id;
      return jsonb_build_object('resultado', 'disputa_encerrada', 'status', 'pago', 'order_id', v_pay.order_id);
    end if;

    if p_provider_amount_cents is null or p_provider_amount_cents <> v_pay.amount_cents then
      update public.flydelivery_payments
         set status = 'divergente',
             needs_reconciliation = true,
             reconciliation_note = left(format(
               'SyncPay informou pago, mas o valor não confere: esperado %s centavos, informado %s.',
               v_pay.amount_cents, coalesce(p_provider_amount_cents::text, 'nenhum')), 500)
       where id = v_pay.id;
      return jsonb_build_object('resultado', 'divergente', 'status', 'divergente');
    end if;

    if p_split_ok is false then
      update public.flydelivery_payments
         set status = 'divergente',
             needs_reconciliation = true,
             reconciliation_note = 'SyncPay informou pago, mas a divisão (recebedor ou percentual) não confere.'
       where id = v_pay.id;
      return jsonb_build_object('resultado', 'divergente', 'status', 'divergente');
    end if;

    select * into v_checkout from public.flydelivery_checkouts where id = v_pay.checkout_id for update;

    -- Este pagamento é o que vale: outras cobranças abertas do mesmo pedido
    -- deixam de valer (e não podem ser pagas depois sem cair em "duplicado").
    update public.flydelivery_payments
       set status = 'expirado',
           failure_reason = coalesce(failure_reason, 'Encerrada: o pedido foi pago por outra cobrança.')
     where checkout_id = v_pay.checkout_id
       and id <> v_pay.id
       and status in ('criando', 'pendente');

    -- O pedido já foi pago por OUTRA cobrança (cenário raro: duas cobranças
    -- pagas). Não nasce segundo pedido; o dinheiro duplicado vai para a
    -- conciliação para ser devolvido.
    if v_checkout.status = 'pago' then
      update public.flydelivery_payments
         set status = 'duplicado', paid_at = coalesce(paid_at, now()), needs_reconciliation = true,
             reconciliation_note = 'Pagamento em duplicidade: o pedido já tinha sido pago por outra cobrança. Devolver ao cliente.'
       where id = v_pay.id;
      return jsonb_build_object('resultado', 'duplicidade', 'status', 'duplicado', 'order_id', v_checkout.order_id);
    end if;

    if v_checkout.status <> 'aguardando_pagamento' or v_checkout.expires_at < now() then
      update public.flydelivery_payments
         set status = 'pago', paid_at = coalesce(paid_at, now()), needs_reconciliation = true,
             reconciliation_note = 'Pagamento recebido depois do prazo do pedido: o pedido não foi enviado à loja. Conferir com o cliente.'
       where id = v_pay.id;
      update public.flydelivery_checkouts set status = 'expirado'
       where id = v_checkout.id and status = 'aguardando_pagamento';
      return jsonb_build_object('resultado', 'pago_fora_do_prazo', 'status', 'pago');
    end if;

    v_snap := v_checkout.order_snapshot;

    insert into public.orders (
      tenant_id, customer_id, flydelivery_request_id, customer_name, customer_phone,
      customer_address, neighborhood, flydelivery_latitude, flydelivery_longitude,
      items, subtotal, delivery_fee, discount, flydelivery_coupon_id, flydelivery_coupon_code,
      total, order_type, service_mode, delivery_type, payment_method, change_for, notes,
      status, payment_status, source, flydelivery_payment_id
    ) values (
      v_checkout.store_id,
      v_checkout.customer_id,
      v_checkout.request_id,
      coalesce(v_snap->>'customer_name', 'Cliente FlyDelivery'),
      coalesce(v_snap->>'customer_phone', ''),
      v_snap->>'customer_address',
      v_snap->>'neighborhood',
      nullif(v_snap->>'flydelivery_latitude', '')::double precision,
      nullif(v_snap->>'flydelivery_longitude', '')::double precision,
      coalesce(v_snap->'items', '[]'::jsonb),
      v_checkout.subtotal_cents / 100.0,
      v_checkout.delivery_fee_cents / 100.0,
      v_checkout.discount_cents / 100.0,
      nullif(v_snap->>'flydelivery_coupon_id', '')::uuid,
      v_snap->>'flydelivery_coupon_code',
      v_checkout.total_cents / 100.0,
      v_snap->>'order_type',
      v_snap->>'service_mode',
      v_snap->>'delivery_type',
      public.flydelivery_pix_paid_label(),
      null,
      coalesce(v_snap->>'notes', ''),
      'novo',
      'paid',
      'flydelivery',
      v_pay.id
    )
    returning id, order_number into v_order_id, v_order_number;

    -- O cupom só conta como usado agora, com o pedido pago de verdade.
    if v_checkout.coupon_id is not null then
      begin
        insert into public.flydelivery_coupon_redemptions (coupon_id, user_id, order_id, discount)
        values (v_checkout.coupon_id, v_checkout.customer_id, v_order_id, v_checkout.discount_cents / 100.0);
        perform public.flydelivery_bump_coupon_use(v_checkout.coupon_id);
      exception when others then
        -- O cupom é registro de uso; o pedido pago vale mais. Fica anotado.
        v_note := 'Cupom não registrado: ' || sqlerrm;
      end;
    end if;

    update public.flydelivery_checkouts
       set status = 'pago', order_id = v_order_id, paid_at = now()
     where id = v_checkout.id;

    update public.flydelivery_payments
       set status = 'pago',
           paid_at = now(),
           order_id = v_order_id,
           needs_reconciliation = (v_note is not null),
           reconciliation_note = v_note
     where id = v_pay.id;

    return jsonb_build_object('resultado', 'confirmado', 'status', 'pago',
                              'order_id', v_order_id, 'order_number', v_order_number);
  end if;

  -- ------------------------------------------------------------ PENDENTE --
  if v_target = 'pendente' then
    if v_pay.status in ('criando', 'incerto') then
      update public.flydelivery_payments set status = 'pendente' where id = v_pay.id;
      return jsonb_build_object('resultado', 'atualizado', 'status', 'pendente');
    end if;
    -- "pending" atrasado depois de pago/falhou/estornado: ignora.
    return jsonb_build_object('resultado', 'fora_de_ordem', 'status', v_pay.status);
  end if;

  -- -------------------------------------------------------------- FALHOU --
  if v_target = 'falhou' then
    if v_pay.status in ('criando', 'pendente', 'incerto', 'expirado') then
      update public.flydelivery_payments
         set status = 'falhou', failure_reason = coalesce(failure_reason, 'Pagamento não concluído (SyncPay).')
       where id = v_pay.id;
      return jsonb_build_object('resultado', 'atualizado', 'status', 'falhou');
    end if;
    update public.flydelivery_payments
       set needs_reconciliation = true,
           reconciliation_note = left('SyncPay informou "failed" para um pagamento em ' || v_pay.status || '.', 500)
     where id = v_pay.id;
    return jsonb_build_object('resultado', 'fora_de_ordem', 'status', v_pay.status);
  end if;

  -- ----------------------------------------------------------- ESTORNADO --
  if v_target = 'estornado' then
    -- Estorno não cancela o pedido sozinho: quem decide o que fazer com a
    -- comida é a loja. Fica marcado para conferência.
    update public.flydelivery_payments
       set status = 'estornado', refunded_at = coalesce(refunded_at, now()),
           needs_reconciliation = true,
           reconciliation_note = coalesce(reconciliation_note, 'Estorno informado pela SyncPay: conferir o pedido e os repasses.')
     where id = v_pay.id;
    return jsonb_build_object('resultado', 'atualizado', 'status', 'estornado', 'order_id', v_pay.order_id);
  end if;

  -- ---------------------------------------------------------- EM DISPUTA --
  if v_target = 'em_disputa' then
    update public.flydelivery_payments
       set status = 'em_disputa', needs_reconciliation = true,
           reconciliation_note = coalesce(reconciliation_note, 'Contestação Pix (MED) informada pela SyncPay.')
     where id = v_pay.id;
    return jsonb_build_object('resultado', 'atualizado', 'status', 'em_disputa', 'order_id', v_pay.order_id);
  end if;

  return jsonb_build_object('resultado', 'sem_mudanca', 'status', v_pay.status);
end;
$$;

revoke execute on function public.flydelivery_pix_apply_provider_status(uuid, text, bigint, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.flydelivery_pix_apply_provider_status(uuid, text, bigint, jsonb, boolean) to service_role;

-- 17. Avisos da SyncPay: registrar uma vez, anotar o resultado ----------------
create or replace function public.flydelivery_payment_event_record(
  p_event_key text,
  p_event_type text,
  p_reference text,
  p_auth_method text,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Aviso novo: registra e devolve "pode processar". Aviso repetido: devolve
  -- "já visto" — a não ser que a vez anterior tenha dado erro (ou parado no
  -- meio há mais de 1 minuto). Aí a nova entrega da SyncPay é a chance de
  -- terminar o serviço, e não pode ser jogada fora como repetição.
  insert into public.flydelivery_payment_events as e
    (event_key, event_type, provider_reference, auth_method, payload)
  values (p_event_key, left(p_event_type, 120), left(p_reference, 200), p_auth_method, p_payload)
  on conflict (event_key) do update
     set received_at = now(), processed_at = null, outcome = null, error = null
   where e.outcome = 'erro'
      or (e.processed_at is null and e.received_at < now() - interval '1 minute');
  return found;
end;
$$;

revoke execute on function public.flydelivery_payment_event_record(text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.flydelivery_payment_event_record(text, text, text, text, jsonb) to service_role;

create or replace function public.flydelivery_payment_event_finish(p_event_key text, p_outcome text, p_error text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.flydelivery_payment_events
     set processed_at = now(), outcome = left(p_outcome, 60), error = left(p_error, 500)
   where event_key = p_event_key;
$$;

revoke execute on function public.flydelivery_payment_event_finish(text, text, text) from public, anon, authenticated;
grant execute on function public.flydelivery_payment_event_finish(text, text, text) to service_role;

-- 18. Rotina de faxina: pedidos que venceram sem pagamento -------------------
create or replace function public.flydelivery_checkouts_expire()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.flydelivery_checkouts c
     set status = 'expirado'
   where c.status = 'aguardando_pagamento'
     and c.expires_at < now()
     and not exists (
       select 1 from public.flydelivery_payments p
        where p.checkout_id = c.id and p.status in ('criando', 'pago', 'divergente', 'em_disputa'));
  get diagnostics v_count = row_count;

  update public.flydelivery_payments p
     set status = 'expirado'
    from public.flydelivery_checkouts c
   where c.id = p.checkout_id
     and c.status = 'expirado'
     and p.status = 'pendente';

  return v_count;
end;
$$;

revoke execute on function public.flydelivery_checkouts_expire() from public, anon, authenticated;
grant execute on function public.flydelivery_checkouts_expire() to service_role;

-- 19. O que a LOJA pode alterar (conferido aqui dentro, não só na tela) --------
-- Informar a conta recebedora. Trocar o recebedor sempre volta para
-- "aguardando verificação": dinheiro só segue para a conta nova depois que o
-- administrador conferir.
create or replace function public.flydelivery_store_set_recipient(p_store_id uuid, p_syncpay_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.flydelivery_payment_accounts;
  v_after public.flydelivery_payment_accounts;
  v_clean text := nullif(trim(coalesce(p_syncpay_user_id, '')), '');
  v_kind text;
begin
  if not (public.owns_pizzeria(auth.uid(), p_store_id) or public.is_admin()) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  v_kind := case when public.owns_pizzeria(auth.uid(), p_store_id) then 'loja' else 'admin' end;

  if v_clean is not null and v_clean !~ '^[A-Za-z0-9._:-]{6,128}$' then
    raise exception 'identificador inválido' using errcode = '22023';
  end if;

  select * into v_before from public.flydelivery_payment_accounts where pizzeria_id = p_store_id for update;

  if found and v_before.syncpay_user_id is not distinct from v_clean then
    return to_jsonb(v_before) - 'verified_by';
  end if;

  insert into public.flydelivery_payment_accounts as a (pizzeria_id, syncpay_user_id, status, status_note)
  values (p_store_id, v_clean,
          case when v_clean is null then 'nao_configurada' else 'aguardando_verificacao' end,
          null)
  on conflict (pizzeria_id) do update
     set syncpay_user_id = excluded.syncpay_user_id,
         status = excluded.status,
         status_note = null,
         -- Conta nova = Pix desligado até ser conferida e religada.
         pix_online_enabled = false,
         verified_at = null,
         verified_by = null
  returning * into v_after;

  insert into public.flydelivery_finance_audit (actor_id, actor_kind, action, store_id, before, after)
  values (auth.uid(), v_kind, 'conta_recebedora_alterada', p_store_id,
          case when v_before.pizzeria_id is null then null
               else jsonb_build_object('syncpay_user_id', v_before.syncpay_user_id, 'status', v_before.status) end,
          jsonb_build_object('syncpay_user_id', v_after.syncpay_user_id, 'status', v_after.status));

  return to_jsonb(v_after) - 'verified_by';
exception
  when unique_violation then
    raise exception 'recebedor_em_uso' using errcode = '23505';
end;
$$;

revoke execute on function public.flydelivery_store_set_recipient(uuid, text) from public, anon;
grant execute on function public.flydelivery_store_set_recipient(uuid, text) to authenticated, service_role;

-- Ligar/desligar o Pix pelo app. Só liga com a conta já ativa.
create or replace function public.flydelivery_store_set_pix_enabled(p_store_id uuid, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.flydelivery_payment_accounts;
begin
  if not (public.owns_pizzeria(auth.uid(), p_store_id) or public.is_admin()) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;

  select * into v_row from public.flydelivery_payment_accounts where pizzeria_id = p_store_id for update;
  if not found then
    raise exception 'conta_nao_configurada' using errcode = 'P0001';
  end if;
  if p_enabled and v_row.status <> 'ativa' then
    raise exception 'conta_nao_ativa' using errcode = 'P0001';
  end if;

  update public.flydelivery_payment_accounts set pix_online_enabled = p_enabled
   where pizzeria_id = p_store_id
  returning * into v_row;

  insert into public.flydelivery_finance_audit (actor_id, actor_kind, action, store_id, after)
  values (auth.uid(),
          case when public.owns_pizzeria(auth.uid(), p_store_id) then 'loja' else 'admin' end,
          case when p_enabled then 'pix_online_ligado' else 'pix_online_desligado' end,
          p_store_id, jsonb_build_object('pix_online_enabled', p_enabled));

  return to_jsonb(v_row) - 'verified_by';
end;
$$;

revoke execute on function public.flydelivery_store_set_pix_enabled(uuid, boolean) from public, anon;
grant execute on function public.flydelivery_store_set_pix_enabled(uuid, boolean) to authenticated, service_role;

-- 20. O que só o ADMINISTRADOR pode alterar -------------------------------------
create or replace function public.flydelivery_admin_set_default_fee(p_fee_percent integer, p_gateway_fee_bearer text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.flydelivery_payment_settings;
  v_after public.flydelivery_payment_settings;
begin
  if not public.is_admin() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if p_fee_percent is null or p_fee_percent < 1 or p_fee_percent > 50 then
    raise exception 'comissão precisa ser um número inteiro entre 1 e 50' using errcode = '22023';
  end if;

  select * into v_before from public.flydelivery_payment_settings where id for update;

  update public.flydelivery_payment_settings
     set default_fee_percent = p_fee_percent,
         gateway_fee_bearer = coalesce(p_gateway_fee_bearer, gateway_fee_bearer),
         updated_at = now(),
         updated_by = auth.uid()
   where id
  returning * into v_after;

  insert into public.flydelivery_finance_audit (actor_id, actor_kind, action, before, after)
  values (auth.uid(), 'admin', 'comissao_padrao_alterada',
          jsonb_build_object('default_fee_percent', v_before.default_fee_percent,
                             'gateway_fee_bearer', v_before.gateway_fee_bearer),
          jsonb_build_object('default_fee_percent', v_after.default_fee_percent,
                             'gateway_fee_bearer', v_after.gateway_fee_bearer));

  return to_jsonb(v_after);
end;
$$;

revoke execute on function public.flydelivery_admin_set_default_fee(integer, text) from public, anon;
grant execute on function public.flydelivery_admin_set_default_fee(integer, text) to authenticated, service_role;

create or replace function public.flydelivery_admin_set_store_fee(p_store_id uuid, p_fee_percent integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before integer;
  v_row public.flydelivery_payment_accounts;
begin
  if not public.is_admin() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if p_fee_percent is not null and (p_fee_percent < 1 or p_fee_percent > 50) then
    raise exception 'comissão precisa ser um número inteiro entre 1 e 50' using errcode = '22023';
  end if;

  select fee_percent_override into v_before from public.flydelivery_payment_accounts
   where pizzeria_id = p_store_id for update;

  insert into public.flydelivery_payment_accounts (pizzeria_id, fee_percent_override)
  values (p_store_id, p_fee_percent)
  on conflict (pizzeria_id) do update set fee_percent_override = excluded.fee_percent_override
  returning * into v_row;

  insert into public.flydelivery_finance_audit (actor_id, actor_kind, action, store_id, before, after)
  values (auth.uid(), 'admin', 'comissao_da_loja_alterada', p_store_id,
          jsonb_build_object('fee_percent_override', v_before),
          jsonb_build_object('fee_percent_override', p_fee_percent));

  return to_jsonb(v_row) - 'verified_by';
end;
$$;

revoke execute on function public.flydelivery_admin_set_store_fee(uuid, integer) from public, anon;
grant execute on function public.flydelivery_admin_set_store_fee(uuid, integer) to authenticated, service_role;

-- Ativar só depois de conferir com a SyncPay que a conta existe e recebe split.
-- O sistema não afirma isso sozinho: quem ativa é uma pessoa, e fica registrado.
create or replace function public.flydelivery_admin_set_account_status(
  p_store_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.flydelivery_payment_accounts;
  v_row public.flydelivery_payment_accounts;
begin
  if not public.is_admin() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if p_status not in ('aguardando_verificacao', 'ativa', 'recusada', 'suspensa') then
    raise exception 'situação inválida' using errcode = '22023';
  end if;

  select * into v_before from public.flydelivery_payment_accounts where pizzeria_id = p_store_id for update;
  if not found or v_before.syncpay_user_id is null then
    raise exception 'conta_nao_configurada' using errcode = 'P0001';
  end if;

  update public.flydelivery_payment_accounts
     set status = p_status,
         status_note = left(nullif(trim(coalesce(p_note, '')), ''), 500),
         verified_at = case when p_status = 'ativa' then now() else verified_at end,
         verified_by = case when p_status = 'ativa' then auth.uid() else verified_by end,
         -- Suspender/recusar desliga o Pix na hora.
         pix_online_enabled = case when p_status = 'ativa' then pix_online_enabled else false end
   where pizzeria_id = p_store_id
  returning * into v_row;

  insert into public.flydelivery_finance_audit (actor_id, actor_kind, action, store_id, before, after, note)
  values (auth.uid(), 'admin', 'situacao_da_conta_alterada', p_store_id,
          jsonb_build_object('status', v_before.status),
          jsonb_build_object('status', v_row.status, 'syncpay_user_id', v_row.syncpay_user_id),
          left(p_note, 500));

  return to_jsonb(v_row) - 'verified_by';
end;
$$;

revoke execute on function public.flydelivery_admin_set_account_status(uuid, text, text) from public, anon;
grant execute on function public.flydelivery_admin_set_account_status(uuid, text, text) to authenticated, service_role;

-- Administrador encerra uma pendência de conciliação, com nota obrigatória.
create or replace function public.flydelivery_admin_resolve_reconciliation(p_payment_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.flydelivery_payments;
begin
  if not public.is_admin() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'descreva o que foi feito (mínimo 5 letras)' using errcode = '22023';
  end if;

  update public.flydelivery_payments
     set needs_reconciliation = false,
         reconciliation_note = left(trim(p_note), 500)
   where id = p_payment_id
  returning * into v_row;

  if not found then
    raise exception 'pagamento não encontrado' using errcode = 'P0002';
  end if;

  insert into public.flydelivery_finance_audit (actor_id, actor_kind, action, store_id, payment_id, note)
  values (auth.uid(), 'admin', 'conciliacao_resolvida', v_row.store_id, v_row.id, left(trim(p_note), 500));

  return jsonb_build_object('id', v_row.id, 'status', v_row.status);
end;
$$;

revoke execute on function public.flydelivery_admin_resolve_reconciliation(uuid, text) from public, anon;
grant execute on function public.flydelivery_admin_resolve_reconciliation(uuid, text) to authenticated, service_role;

comment on table public.flydelivery_payments is
  'Cobranças Pix do FlyDelivery na SyncPay, com a divisão (split) congelada no momento da venda.';
comment on table public.flydelivery_checkouts is
  'Pedido calculado pelo servidor aguardando o Pix. Só vira linha de orders quando o pagamento é confirmado.';
