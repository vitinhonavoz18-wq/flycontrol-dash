-- ═════════════════════════════════════════════════════════════════════════
-- PROGRAMA DE AFILIADOS FLYCONTROL — a infraestrutura
-- ═════════════════════════════════════════════════════════════════════════
--
-- Um afiliado divulga um link. Quem entra pelo link e cria uma loja fica
-- ligado a ele para sempre. Toda vez que essa loja PAGA uma fatura do CENTS,
-- o afiliado ganha uma porcentagem do que foi efetivamente recebido.
--
-- ─────────────────────────────────────────────────────────────────────────
-- AS QUATRO REGRAS QUE ESTE ARQUIVO GARANTE NO BANCO (E NÃO NA TELA)
-- ─────────────────────────────────────────────────────────────────────────
--
-- 1. COMISSÃO SÓ NASCE DE DINHEIRO QUE ENTROU.
--    O gatilho olha a fatura virar `paid`. No caminho normal isso só acontece
--    depois que o aviso da InfinityPay foi RECONFERIDO com a própria
--    InfinityPay (`webhooks.infinitypay.ts`). Fatura criada, fatura vencida,
--    fatura em processamento: nada disso gera comissão.
--
-- 2. UMA FATURA, UMA COMISSÃO. Se o aviso de pagamento chegar dez vezes,
--    existe uma comissão só — a chave `idempotency_key` é única e o banco
--    recusa a segunda.
--
-- 3. NADA SE APAGA. Estorno não deleta comissão: ou a marca como revertida,
--    ou (se já foi paga) lança um ajuste negativo que desconta das próximas.
--    É a comanda: erro se corrige com outra linha, nunca rasgando a folha.
--
-- 4. SALDO NÃO É UM NÚMERO GUARDADO. Não existe campo "saldo" que alguém
--    possa editar. O saldo é SEMPRE a soma do histórico — o extrato é a
--    verdade, e o saldo é só a conta feita em cima dele.
--
-- DINHEIRO EM CENTAVOS, PORCENTAGEM EM PONTOS-BASE
--
-- Todo valor é inteiro em centavos, como no resto do FlyControl. A
-- porcentagem também é inteira: 1500 pontos-base = 15,00%. Porcentagem com
-- casa decimal (0.15) é onde nasce o centavo que some ou aparece do nada
-- depois de mil comissões somadas.
--
-- ARREDONDAMENTO: SEMPRE PARA BAIXO
--
-- Comissão de R$ 45,6789 vira R$ 45,67. O centavo quebrado fica com a
-- plataforma — nunca se paga ao afiliado um valor que não foi ganho.

-- ═════════════════════════════════════════════════════════════════════════
-- CONFIGURAÇÃO DO PROGRAMA
-- ═════════════════════════════════════════════════════════════════════════
--
-- Uma linha só. `id boolean` com `check (id)` é o jeito de o banco garantir
-- que existe exatamente uma configuração: não dá para inserir uma segunda.

create table if not exists public.affiliate_settings (
  id boolean primary key default true check (id),
  program_enabled boolean not null default true,
  -- 1500 = 15,00%. Vale para quem não tem taxa própria.
  default_commission_bps integer not null default 1500
    check (default_commission_bps between 0 and 10000),
  -- Só existe um tipo hoje. A coluna existe para o dia em que houver outro,
  -- sem precisar de migração nas comissões já registradas.
  commission_type text not null default 'recurring'
    check (commission_type in ('recurring')),
  -- Por quantos meses depois do cadastro a loja ainda gera comissão.
  -- Nulo = enquanto a loja continuar pagando.
  commission_duration_months integer
    check (commission_duration_months is null or commission_duration_months > 0),
  -- Quantos dias uma comissão fica "pendente" antes de poder ser sacada.
  -- É a janela para um estorno aparecer antes de o dinheiro sair.
  commission_release_days integer not null default 15
    check (commission_release_days between 0 and 365),
  minimum_withdrawal_cents bigint not null default 10000
    check (minimum_withdrawal_cents >= 0),
  -- Por quantos dias um clique no link continua valendo até virar cadastro.
  referral_cookie_days integer not null default 30
    check (referral_cookie_days between 1 and 365),
  -- SOBRE O QUE a porcentagem incide. Ver `afiliado_valor_elegivel`.
  --   cents_usage   → só a cobrança por pedido do CENTS (padrão);
  --   recurring     → cobrança por pedido + mensalidade;
  --   invoice_total → tudo que foi pago, inclusive taxa de adesão.
  commission_base text not null default 'cents_usage'
    check (commission_base in ('cents_usage', 'recurring', 'invoice_total')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.affiliate_settings (id) values (true) on conflict (id) do nothing;

-- ═════════════════════════════════════════════════════════════════════════
-- AFILIADOS
-- ═════════════════════════════════════════════════════════════════════════

create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  -- Um afiliado é uma pessoa com login. Um login, um afiliado.
  user_id uuid not null unique references auth.users(id) on delete restrict,
  name text not null,
  email text not null,
  phone text,
  document text,
  pix_key text,
  -- Sempre em MAIÚSCULAS e sem acento: "joao123" e "JOAO123" não podem ser
  -- dois afiliados diferentes, senão um rouba o link do outro por engano.
  referral_code text not null unique
    check (referral_code ~ '^[A-Z0-9]{4,20}$'),
  -- Taxa própria deste afiliado. Nula = usa a padrão do programa.
  commission_bps integer check (commission_bps is null or commission_bps between 0 and 10000),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'suspended', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists affiliates_status_idx on public.affiliates (status);

-- ═════════════════════════════════════════════════════════════════════════
-- ATRIBUIÇÕES TEMPORÁRIAS (o clique no link)
-- ═════════════════════════════════════════════════════════════════════════
--
-- POR QUE O NAVEGADOR NÃO GUARDA "QUEM É O AFILIADO"
--
-- Se o cookie dissesse `afiliado=JOAO123`, qualquer pessoa trocaria o texto
-- por `afiliado=MARIA` antes de se cadastrar — e a Maria ganharia comissão
-- por um cliente que nunca indicou.
--
-- O cookie guarda só um número sorteado (`token`), sem significado nenhum.
-- Quem sabe a que afiliado aquele número pertence é ESTA tabela, no servidor.
-- Trocar o número no navegador não leva a afiliado nenhum: leva a nada.
--
-- É a ficha do guarda-volumes: ela não diz o que tem dentro, só aponta para
-- o que o funcionário guardou atrás do balcão.

create table if not exists public.affiliate_attributions (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  referral_code text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  converted_at timestamptz,
  converted_establishment_id uuid,
  -- Prefixo do hash do IP: serve só para não criar mil linhas para o mesmo
  -- visitante. O IP em si nunca é guardado.
  ip_hash text,
  user_agent text
);

create index if not exists affiliate_attributions_affiliate_idx
  on public.affiliate_attributions (affiliate_id, created_at desc);
create index if not exists affiliate_attributions_dedupe_idx
  on public.affiliate_attributions (affiliate_id, ip_hash, created_at desc);

-- ═════════════════════════════════════════════════════════════════════════
-- INDICAÇÕES (o vínculo permanente)
-- ═════════════════════════════════════════════════════════════════════════

create table if not exists public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete restrict,
  customer_user_id uuid,
  -- ÚNICA: uma loja tem UM afiliado, e ele não muda. É o caderno de reservas
  -- que só aceita um nome por mesa.
  --
  -- Sem chave estrangeira para `pizzerias` de propósito: se a loja for
  -- apagada um dia, a indicação continua existindo como registro histórico
  -- das comissões que ela gerou.
  establishment_id uuid not null unique,
  referral_code text not null,
  attribution_id uuid references public.affiliate_attributions(id) on delete set null,
  referred_at timestamptz not null,
  converted_at timestamptz not null default now(),
  status text not null default 'active'
    check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists affiliate_referrals_affiliate_idx
  on public.affiliate_referrals (affiliate_id, converted_at desc);
create index if not exists affiliate_referrals_customer_idx
  on public.affiliate_referrals (customer_user_id);

-- O AFILIADO DE UMA LOJA NÃO MUDA.
--
-- Nem pela tela, nem por uma requisição inventada, nem por um descuido de
-- quem tiver acesso ao banco. Trocar exigiria, primeiro, desfazer esta trava
-- de propósito — e isso fica registrado numa migração.
create or replace function public.afiliado_indicacao_imutavel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.affiliate_id is distinct from old.affiliate_id
     or new.establishment_id is distinct from old.establishment_id then
    raise exception 'O afiliado de uma loja não pode ser trocado.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists afiliado_indicacao_imutavel on public.affiliate_referrals;
create trigger afiliado_indicacao_imutavel
  before update on public.affiliate_referrals
  for each row execute function public.afiliado_indicacao_imutavel();

-- ═════════════════════════════════════════════════════════════════════════
-- SAQUES
-- ═════════════════════════════════════════════════════════════════════════

create table if not exists public.affiliate_withdrawals (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  -- A chave Pix DO MOMENTO do pedido. Se o afiliado trocar a chave depois, o
  -- saque em andamento continua indo para onde ele pediu.
  pix_key text not null,
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'paid', 'rejected')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz,
  rejected_at timestamptz,
  decided_by uuid,
  admin_notes text
);

create index if not exists affiliate_withdrawals_affiliate_idx
  on public.affiliate_withdrawals (affiliate_id, requested_at desc);
create index if not exists affiliate_withdrawals_status_idx
  on public.affiliate_withdrawals (status);

-- Um saque em aberto por vez. Dois pedidos simultâneos disputariam as
-- mesmas comissões.
create unique index if not exists affiliate_withdrawals_um_aberto
  on public.affiliate_withdrawals (affiliate_id)
  where status in ('requested', 'approved');

-- ═════════════════════════════════════════════════════════════════════════
-- COMISSÕES — O EXTRATO
-- ═════════════════════════════════════════════════════════════════════════
--
-- Cada linha é um lançamento. Dois tipos:
--
--   commission → nasceu de uma fatura paga. Valor positivo.
--   adjustment → desconto por estorno de uma comissão que JÁ tinha sido
--                sacada ou pedida em saque. Valor negativo, abate das
--                próximas.

create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete restrict,
  referral_id uuid references public.affiliate_referrals(id) on delete set null,
  kind text not null default 'commission'
    check (kind in ('commission', 'adjustment')),

  -- Registros históricos, sem chave estrangeira de propósito: a fatura é
  -- apagada em cascata se a loja for apagada, e o extrato do afiliado não
  -- pode sumir junto. Comissão paga é fato consumado.
  establishment_id uuid,
  customer_user_id uuid,
  invoice_id uuid,

  -- O que a loja pagou na fatura (total recebido).
  gross_amount_cents bigint not null default 0 check (gross_amount_cents >= 0),
  -- A parte desse total sobre a qual a porcentagem incide.
  eligible_amount_cents bigint not null default 0 check (eligible_amount_cents >= 0),
  -- A porcentagem VIGENTE NO MOMENTO, congelada nesta linha. Se o afiliado
  -- passar de 15% para 10% amanhã, as comissões de hoje continuam com 15%.
  commission_bps integer not null check (commission_bps between 0 and 10000),
  commission_amount_cents bigint not null,

  status text not null default 'pending'
    check (status in ('pending', 'available', 'requested', 'paid', 'cancelled', 'reversed')),

  -- A trava contra o aviso repetido. 'invoice_paid:<fatura>' para comissões,
  -- 'reversal:<comissão>' para ajustes. O banco recusa a segunda igual.
  idempotency_key text not null unique,

  reverses_commission_id uuid references public.affiliate_commissions(id) on delete restrict,
  withdrawal_id uuid references public.affiliate_withdrawals(id) on delete set null,

  created_at timestamptz not null default now(),
  -- A partir de quando pode ser liberada (criação + dias de carência).
  available_at timestamptz not null default now(),
  released_at timestamptz,
  requested_at timestamptz,
  paid_at timestamptz,
  reversed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,

  constraint afiliado_comissao_positiva
    check (kind <> 'commission' or (commission_amount_cents >= 0 and invoice_id is not null)),
  constraint afiliado_ajuste_negativo
    check (kind <> 'adjustment' or (commission_amount_cents <= 0 and reverses_commission_id is not null))
);

-- Segunda trava, independente da chave: uma fatura gera NO MÁXIMO uma
-- comissão, mesmo que alguém invente outra chave.
create unique index if not exists affiliate_commissions_uma_por_fatura
  on public.affiliate_commissions (invoice_id)
  where kind = 'commission';

create index if not exists affiliate_commissions_affiliate_status_idx
  on public.affiliate_commissions (affiliate_id, status);
create index if not exists affiliate_commissions_affiliate_created_idx
  on public.affiliate_commissions (affiliate_id, created_at desc);
create index if not exists affiliate_commissions_establishment_idx
  on public.affiliate_commissions (establishment_id);
create index if not exists affiliate_commissions_customer_idx
  on public.affiliate_commissions (customer_user_id);
create index if not exists affiliate_commissions_withdrawal_idx
  on public.affiliate_commissions (withdrawal_id);
-- O robô de liberação procura "pendentes que já venceram a carência".
create index if not exists affiliate_commissions_a_liberar_idx
  on public.affiliate_commissions (available_at)
  where status = 'pending';

-- ═════════════════════════════════════════════════════════════════════════
-- TRILHA DE AUDITORIA
-- ═════════════════════════════════════════════════════════════════════════
--
-- Só se escreve. Nenhuma linha é alterada ou apagada — nem pelo painel,
-- nem pelo servidor. Uma trilha de auditoria editável é um diário que o
-- próprio suspeito pode reescrever.

create table if not exists public.affiliate_events (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid references public.affiliates(id) on delete set null,
  user_id uuid,
  admin_id uuid,
  event_type text not null check (event_type in (
    'REFERRAL_CREATED', 'CUSTOMER_CONVERTED', 'COMMISSION_CREATED',
    'COMMISSION_RELEASED', 'COMMISSION_REVERSED', 'WITHDRAWAL_REQUESTED',
    'WITHDRAWAL_APPROVED', 'WITHDRAWAL_PAID', 'WITHDRAWAL_REJECTED',
    'AFFILIATE_BLOCKED', 'AFFILIATE_STATUS_CHANGED', 'COMMISSION_RATE_CHANGED',
    'SETTINGS_CHANGED', 'REFERRAL_REJECTED'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists affiliate_events_affiliate_idx
  on public.affiliate_events (affiliate_id, created_at desc);
create index if not exists affiliate_events_type_idx
  on public.affiliate_events (event_type, created_at desc);

create or replace function public.afiliado_evento_somente_leitura()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'A trilha de auditoria dos afiliados não pode ser alterada nem apagada.'
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists afiliado_evento_somente_leitura on public.affiliate_events;
create trigger afiliado_evento_somente_leitura
  before update or delete on public.affiliate_events
  for each row execute function public.afiliado_evento_somente_leitura();

-- ═════════════════════════════════════════════════════════════════════════
-- CARIMBO DE ATUALIZAÇÃO
-- ═════════════════════════════════════════════════════════════════════════

drop trigger if exists affiliates_updated on public.affiliates;
create trigger affiliates_updated before update on public.affiliates
  for each row execute function public.set_updated_at();

drop trigger if exists affiliate_settings_updated on public.affiliate_settings;
create trigger affiliate_settings_updated before update on public.affiliate_settings
  for each row execute function public.set_updated_at();

-- ═════════════════════════════════════════════════════════════════════════
-- O VALOR ELEGÍVEL DE UMA FATURA
-- ═════════════════════════════════════════════════════════════════════════
--
-- ─────────────────────────────────────────────────────────────────────────
-- O QUE É "RECEITA ELEGÍVEL" — E O QUE NÃO É
-- ─────────────────────────────────────────────────────────────────────────
--
-- NÃO é o que a loja vendeu. Uma loja que faturou R$ 30 mil em pedidos no mês
-- pagou ao FlyControl, pelo CENTS, algo como R$ 70 (100 pedidos × R$ 0,70).
-- Comissão sobre os R$ 30 mil seria o FlyControl pagar ao afiliado dinheiro
-- que nunca passou pelo caixa do FlyControl.
--
-- É o que a loja PAGOU AO FLYCONTROL numa fatura QUITADA, e só a parte que
-- a configuração manda contar:
--
--   cents_usage   → os itens `usage` da fatura: a cobrança por pedido.
--   recurring     → `usage` + `monthly_fee`.
--   invoice_total → tudo, inclusive a taxa única de adesão.
--
-- O DESCONTO É REPARTIDO
--
-- A fatura guarda o desconto num campo só (`discount_cents`), não por item.
-- Então a parte elegível é a fração dos itens elegíveis aplicada sobre o que
-- foi REALMENTE PAGO (`total_cents`):
--
--     elegível = total_pago × (itens_elegíveis ÷ soma_de_todos_os_itens)
--
-- Sem isso, uma fatura de R$ 100 com R$ 20 de desconto daria comissão sobre
-- R$ 100 — sobre R$ 20 que a loja não pagou. E o resultado nunca passa do
-- total pago.

create or replace function public.afiliado_valor_elegivel(p_invoice_id uuid, p_base text)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total bigint;
  v_itens_todos bigint;
  v_itens_elegiveis bigint;
  v_tipos text[];
begin
  v_tipos := case p_base
    when 'cents_usage' then array['usage']
    when 'recurring' then array['usage', 'monthly_fee']
    when 'invoice_total' then array['usage', 'monthly_fee', 'setup_fee']
    else array[]::text[]
  end;

  select total_cents into v_total from public.invoices where id = p_invoice_id;
  if v_total is null or v_total <= 0 then
    return 0;
  end if;

  select
    coalesce(sum(total_amount_cents), 0),
    coalesce(sum(total_amount_cents) filter (where item_type = any(v_tipos)), 0)
  into v_itens_todos, v_itens_elegiveis
  from public.invoice_items
  where invoice_id = p_invoice_id and total_amount_cents > 0;

  if v_itens_todos <= 0 or v_itens_elegiveis <= 0 then
    return 0;
  end if;

  -- Divisão inteira: arredonda para baixo, nunca a favor de pagar a mais.
  return least(v_total, (v_total * v_itens_elegiveis) / v_itens_todos);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════
-- CRIAR A COMISSÃO DE UMA FATURA PAGA
-- ═════════════════════════════════════════════════════════════════════════
--
-- Devolve o id da comissão criada, ou nulo quando a fatura não gera comissão
-- (loja sem afiliado, afiliado bloqueado, programa desligado, valor zero,
-- ou — o caso mais comum — comissão já criada por um aviso anterior).

create or replace function public.afiliado_criar_comissao_da_fatura(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg public.affiliate_settings;
  v_fatura record;
  v_indicacao public.affiliate_referrals;
  v_afiliado public.affiliates;
  v_bps integer;
  v_elegivel bigint;
  v_comissao bigint;
  v_id uuid;
begin
  select * into v_cfg from public.affiliate_settings where id;
  if not found or not v_cfg.program_enabled then
    return null;
  end if;

  select id, company_id, status, total_cents, paid_at
    into v_fatura
  from public.invoices where id = p_invoice_id;

  -- Só fatura QUITADA. Criada, pendente, vencida, em processamento: nada.
  if not found or v_fatura.status <> 'paid' or coalesce(v_fatura.total_cents, 0) <= 0 then
    return null;
  end if;

  select * into v_indicacao
  from public.affiliate_referrals
  where establishment_id = v_fatura.company_id and status = 'active';
  if not found then
    return null;
  end if;

  -- Fatura paga antes do vínculo existir não é do afiliado.
  if v_fatura.paid_at is not null and v_fatura.paid_at < v_indicacao.converted_at then
    return null;
  end if;

  -- Programa com prazo: depois de N meses do cadastro, a loja para de gerar.
  if v_cfg.commission_duration_months is not null
     and coalesce(v_fatura.paid_at, now())
         > v_indicacao.converted_at + make_interval(months => v_cfg.commission_duration_months) then
    return null;
  end if;

  select * into v_afiliado from public.affiliates where id = v_indicacao.affiliate_id;
  -- Afiliado suspenso ou bloqueado não ganha. Pendente também não: ele
  -- ainda não foi aprovado para participar.
  if not found or v_afiliado.status <> 'active' then
    return null;
  end if;

  v_bps := coalesce(v_afiliado.commission_bps, v_cfg.default_commission_bps);
  v_elegivel := public.afiliado_valor_elegivel(p_invoice_id, v_cfg.commission_base);
  v_comissao := (v_elegivel * v_bps) / 10000;

  if v_comissao <= 0 then
    return null;
  end if;

  insert into public.affiliate_commissions (
    affiliate_id, referral_id, kind, establishment_id, customer_user_id, invoice_id,
    gross_amount_cents, eligible_amount_cents, commission_bps, commission_amount_cents,
    status, idempotency_key, available_at, metadata
  ) values (
    v_afiliado.id, v_indicacao.id, 'commission', v_fatura.company_id,
    v_indicacao.customer_user_id, p_invoice_id,
    v_fatura.total_cents, v_elegivel, v_bps, v_comissao,
    'pending', 'invoice_paid:' || p_invoice_id,
    now() + make_interval(days => v_cfg.commission_release_days),
    jsonb_build_object('commission_base', v_cfg.commission_base)
  )
  -- A trava do aviso repetido: a segunda tentativa não faz nada.
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is not null then
    insert into public.affiliate_events (affiliate_id, event_type, metadata)
    values (v_afiliado.id, 'COMMISSION_CREATED', jsonb_build_object(
      'commission_id', v_id, 'invoice_id', p_invoice_id,
      'eligible_amount_cents', v_elegivel, 'commission_bps', v_bps,
      'commission_amount_cents', v_comissao
    ));
  end if;

  return v_id;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════
-- DESFAZER A COMISSÃO DE UMA FATURA ESTORNADA
-- ═════════════════════════════════════════════════════════════════════════
--
-- A REGRA, DETERMINÍSTICA
--
--   pendente ou disponível → vira `reversed`. Ainda não saiu do caixa,
--                            então só deixa de valer.
--   pedida em saque ou paga → a linha NÃO é tocada (o dinheiro já está
--                            comprometido ou já saiu). Nasce um AJUSTE
--                            negativo, disponível, que desconta das
--                            próximas comissões.
--   já revertida/cancelada → nada.
--
-- Em nenhum caso uma linha é apagada.

create or replace function public.afiliado_reverter_comissao_da_fatura(p_invoice_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.affiliate_commissions;
  v_ajuste uuid;
begin
  select * into v_c
  from public.affiliate_commissions
  where invoice_id = p_invoice_id and kind = 'commission'
  for update;

  if not found then
    return;
  end if;

  if v_c.status in ('pending', 'available') then
    update public.affiliate_commissions
       set status = 'reversed', reversed_at = now(),
           metadata = metadata || jsonb_build_object('reversal_reason', p_motivo)
     where id = v_c.id;

    insert into public.affiliate_events (affiliate_id, event_type, metadata)
    values (v_c.affiliate_id, 'COMMISSION_REVERSED', jsonb_build_object(
      'commission_id', v_c.id, 'invoice_id', p_invoice_id,
      'previous_status', v_c.status, 'reason', p_motivo
    ));

  elsif v_c.status in ('requested', 'paid') then
    insert into public.affiliate_commissions (
      affiliate_id, referral_id, kind, establishment_id, customer_user_id, invoice_id,
      gross_amount_cents, eligible_amount_cents, commission_bps, commission_amount_cents,
      status, idempotency_key, reverses_commission_id, available_at, released_at, metadata
    ) values (
      v_c.affiliate_id, v_c.referral_id, 'adjustment', v_c.establishment_id,
      v_c.customer_user_id, v_c.invoice_id,
      0, 0, v_c.commission_bps, -v_c.commission_amount_cents,
      'available', 'reversal:' || v_c.id, v_c.id, now(), now(),
      jsonb_build_object('reason', p_motivo, 'original_status', v_c.status)
    )
    on conflict (idempotency_key) do nothing
    returning id into v_ajuste;

    if v_ajuste is not null then
      insert into public.affiliate_events (affiliate_id, event_type, metadata)
      values (v_c.affiliate_id, 'COMMISSION_REVERSED', jsonb_build_object(
        'commission_id', v_c.id, 'adjustment_id', v_ajuste, 'invoice_id', p_invoice_id,
        'previous_status', v_c.status, 'reason', p_motivo,
        'adjustment_amount_cents', -v_c.commission_amount_cents
      ));
    end if;
  end if;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════
-- OS GATILHOS NO CAIXA
-- ═════════════════════════════════════════════════════════════════════════
--
-- POR QUE GATILHO NO BANCO, E NÃO UMA LINHA NO WEBHOOK
--
-- Hoje há dois caminhos que marcam uma fatura como paga: o aviso da
-- InfinityPay (depois da reconferência) e o robô de fechamento, quando o
-- total dá zero. Amanhã pode haver um terceiro — a confirmação manual de um
-- Pix pelo administrador. Uma chamada escrita no webhook esqueceria os
-- outros. O gatilho na fatura vale para todos, porque olha o FATO (a fatura
-- ficou paga), e não o caminho por onde ela chegou lá.
--
-- ─────────────────────────────────────────────────────────────────────────
-- A COMISSÃO NUNCA PODE DERRUBAR O PAGAMENTO
-- ─────────────────────────────────────────────────────────────────────────
--
-- Estes gatilhos rodam DENTRO da mesma gravação que confirma o pagamento.
-- Se um deles estourar erro sem proteção, a confirmação do pagamento é
-- desfeita junto — a loja pagou e continua marcada como devedora, por causa
-- de um problema na comissão de um terceiro.
--
-- Por isso o `exception when others`: a falha vira aviso no log do banco e o
-- pagamento segue. A comissão perdida é recuperável (a fatura continua lá,
-- paga, e `afiliado_criar_comissao_da_fatura` pode ser chamada de novo); o
-- pagamento desfeito não é.

create or replace function public.afiliado_ao_mudar_fatura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if new.status = 'paid'
       and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
      perform public.afiliado_criar_comissao_da_fatura(new.id);

    elsif tg_op = 'UPDATE' and old.status = 'paid' and new.status = 'canceled' then
      perform public.afiliado_reverter_comissao_da_fatura(new.id, 'invoice_canceled');
    end if;
  exception when others then
    raise warning '[afiliados] falha ao processar a fatura %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists afiliado_ao_mudar_fatura on public.invoices;
create trigger afiliado_ao_mudar_fatura
  after insert or update of status on public.invoices
  for each row execute function public.afiliado_ao_mudar_fatura();

-- O ESTORNO MORA NA TRANSAÇÃO DE PAGAMENTO
--
-- A fatura não tem status "estornada" (os permitidos são draft, pending,
-- processing, paid, overdue e canceled). Quem tem `refunded` é a transação
-- de pagamento. Então é ELA que dispara a reversão quando o dinheiro volta.

create or replace function public.afiliado_ao_estornar_pagamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if old.status = 'paid' and new.status in ('refunded', 'canceled') then
      perform public.afiliado_reverter_comissao_da_fatura(new.invoice_id, 'payment_' || new.status);
    end if;
  exception when others then
    raise warning '[afiliados] falha ao reverter a comissão do pagamento %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists afiliado_ao_estornar_pagamento on public.payment_transactions;
create trigger afiliado_ao_estornar_pagamento
  after update of status on public.payment_transactions
  for each row execute function public.afiliado_ao_estornar_pagamento();

-- ═════════════════════════════════════════════════════════════════════════
-- LIBERAR AS COMISSÕES QUE PASSARAM DA CARÊNCIA
-- ═════════════════════════════════════════════════════════════════════════
--
-- A carência existe para o estorno aparecer ANTES de o dinheiro sair. Uma
-- comissão paga no dia e estornada no seguinte vira dívida do afiliado; a
-- mesma comissão, se ainda estivesse pendente, só deixaria de valer.
--
-- Afiliado suspenso ou bloqueado não tem nada liberado: as comissões dele
-- ficam paradas em pendente até alguém decidir.

create or replace function public.afiliado_liberar_comissoes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qtd integer;
begin
  with liberadas as (
    update public.affiliate_commissions c
       set status = 'available', released_at = now()
      from public.affiliates a
     where a.id = c.affiliate_id
       and a.status = 'active'
       and c.status = 'pending'
       and c.kind = 'commission'
       and c.available_at <= now()
    returning c.id, c.affiliate_id, c.commission_amount_cents
  ), eventos as (
    insert into public.affiliate_events (affiliate_id, event_type, metadata)
    select affiliate_id, 'COMMISSION_RELEASED',
           jsonb_build_object('commission_id', id, 'commission_amount_cents', commission_amount_cents)
    from liberadas
    returning 1
  )
  select count(*) into v_qtd from eventos;
  return v_qtd;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════
-- SALDOS — SEMPRE CALCULADOS DO EXTRATO
-- ═════════════════════════════════════════════════════════════════════════
--
-- `security_invoker`: a visão enxerga só o que QUEM PERGUNTA pode enxergar.
-- O afiliado vê o próprio saldo; ninguém soma o extrato de outro por ela.

create or replace view public.affiliate_balances
with (security_invoker = true) as
select
  a.id as affiliate_id,
  coalesce(sum(c.commission_amount_cents) filter (where c.status = 'pending'), 0) as pending_cents,
  -- Os ajustes negativos entram aqui: é onde o estorno de uma comissão já
  -- sacada é compensado.
  coalesce(sum(c.commission_amount_cents) filter (where c.status = 'available'), 0) as available_cents,
  coalesce(sum(c.commission_amount_cents) filter (where c.status = 'requested'), 0) as requested_cents,
  coalesce(sum(c.commission_amount_cents) filter (where c.status = 'paid'), 0) as paid_cents,
  coalesce(sum(c.commission_amount_cents) filter (where c.status = 'reversed'), 0)
    + coalesce(-sum(c.commission_amount_cents) filter (where c.kind = 'adjustment'), 0)
    as reversed_cents,
  -- Tudo que foi ganho e não foi desfeito.
  coalesce(sum(c.commission_amount_cents)
    filter (where c.status in ('pending', 'available', 'requested', 'paid')), 0) as lifetime_cents
from public.affiliates a
left join public.affiliate_commissions c on c.affiliate_id = a.id
group by a.id;

-- ═════════════════════════════════════════════════════════════════════════
-- RASTREIO: O CLIQUE NO LINK
-- ═════════════════════════════════════════════════════════════════════════
--
-- Chamada SÓ pelo servidor (ver as permissões no fim do arquivo). Recebe o
-- código que veio no endereço, confere tudo e devolve o número sorteado que
-- vai para o cookie — ou nada, se o código não vale.
--
-- O MESMO VISITANTE NÃO VIRA MIL LINHAS
--
-- Se o mesmo IP clicou no link do mesmo afiliado na última hora, devolve a
-- atribuição que já existe em vez de criar outra. Sem isso, um robô
-- recarregando a página encheria a tabela.

create or replace function public.afiliado_registrar_visita(
  p_codigo text, p_ip_hash text, p_user_agent text
)
returns table (token uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_cfg public.affiliate_settings;
  v_afiliado public.affiliates;
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
  v_existente public.affiliate_attributions;
begin
  if v_codigo !~ '^[A-Z0-9]{4,20}$' then
    return;
  end if;

  select * into v_cfg from public.affiliate_settings where id;
  if not found or not v_cfg.program_enabled then
    return;
  end if;

  select * into v_afiliado from public.affiliates where referral_code = v_codigo;
  if not found or v_afiliado.status <> 'active' then
    return;
  end if;

  if p_ip_hash is not null then
    select * into v_existente
    from public.affiliate_attributions at
    where at.affiliate_id = v_afiliado.id
      and at.ip_hash = p_ip_hash
      and at.converted_at is null
      and at.created_at > now() - interval '1 hour'
    order by at.created_at desc
    limit 1;
    if found then
      return query select v_existente.token, v_existente.expires_at;
      return;
    end if;
  end if;

  return query
  insert into public.affiliate_attributions (affiliate_id, referral_code, expires_at, ip_hash, user_agent)
  values (v_afiliado.id, v_codigo, now() + make_interval(days => v_cfg.referral_cookie_days),
          p_ip_hash, left(p_user_agent, 300))
  returning affiliate_attributions.token, affiliate_attributions.expires_at;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════
-- RASTREIO: O CADASTRO VIRA INDICAÇÃO
-- ═════════════════════════════════════════════════════════════════════════
--
-- Chamada SÓ pelo servidor, dentro do cadastro, logo depois de a loja
-- nascer. Devolve o motivo em texto — para o log, nunca para a tela.
--
-- A REGRA DE ATRIBUIÇÃO, ESCRITA POR EXTENSO
--
--   1. PRIMEIRO CLIQUE VÁLIDO VENCE. O cookie é gravado no primeiro clique
--      válido e não é sobrescrito por cliques posteriores enquanto valer.
--   2. O clique precisa estar dentro da janela (`referral_cookie_days`).
--   3. O afiliado precisa estar ATIVO no momento do cadastro — não basta ter
--      estado no momento do clique.
--   4. Ninguém indica a si mesmo: mesmo login OU mesmo e-mail que o
--      afiliado é recusado.
--   5. Uma loja tem um afiliado só. Se já existe, nada é trocado.
--   6. Um clique converte uma loja só.

create or replace function public.afiliado_converter_indicacao(
  p_token uuid, p_establishment_id uuid, p_owner_user_id uuid, p_owner_email text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg public.affiliate_settings;
  v_at public.affiliate_attributions;
  v_afiliado public.affiliates;
  v_indicacao uuid;
begin
  if p_token is null or p_establishment_id is null then
    return 'sem_token';
  end if;

  select * into v_cfg from public.affiliate_settings where id;
  if not found or not v_cfg.program_enabled then
    return 'programa_desligado';
  end if;

  select * into v_at from public.affiliate_attributions where token = p_token for update;
  if not found then
    return 'token_desconhecido';
  end if;
  if v_at.converted_at is not null then
    return 'token_ja_usado';
  end if;
  if v_at.expires_at < now() then
    return 'token_vencido';
  end if;

  select * into v_afiliado from public.affiliates where id = v_at.affiliate_id;
  if not found or v_afiliado.status <> 'active' then
    return 'afiliado_inativo';
  end if;

  if v_afiliado.user_id = p_owner_user_id
     or lower(trim(v_afiliado.email)) = lower(trim(coalesce(p_owner_email, ''))) then
    insert into public.affiliate_events (affiliate_id, user_id, event_type, metadata)
    values (v_afiliado.id, p_owner_user_id, 'REFERRAL_REJECTED',
            jsonb_build_object('reason', 'autoindicacao', 'establishment_id', p_establishment_id));
    return 'autoindicacao';
  end if;

  insert into public.affiliate_referrals (
    affiliate_id, customer_user_id, establishment_id, referral_code,
    attribution_id, referred_at, converted_at
  ) values (
    v_afiliado.id, p_owner_user_id, p_establishment_id, v_at.referral_code,
    v_at.id, v_at.created_at, now()
  )
  -- Loja que já tem afiliado mantém o que tem.
  on conflict (establishment_id) do nothing
  returning id into v_indicacao;

  if v_indicacao is null then
    return 'loja_ja_indicada';
  end if;

  update public.affiliate_attributions
     set converted_at = now(), converted_establishment_id = p_establishment_id
   where id = v_at.id;

  insert into public.affiliate_events (affiliate_id, user_id, event_type, metadata) values
    (v_afiliado.id, p_owner_user_id, 'REFERRAL_CREATED',
     jsonb_build_object('referral_id', v_indicacao, 'establishment_id', p_establishment_id)),
    (v_afiliado.id, p_owner_user_id, 'CUSTOMER_CONVERTED',
     jsonb_build_object('referral_id', v_indicacao, 'attribution_id', v_at.id,
                        'clicked_at', v_at.created_at));

  return 'ok';
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════
-- QUEM É O AFILIADO DE QUEM ESTÁ LOGADO
-- ═════════════════════════════════════════════════════════════════════════
--
-- Usada pelas regras de acesso abaixo. `security definer` para as regras não
-- entrarem em círculo (a regra de `affiliates` consultando `affiliates`).

create or replace function public.afiliado_do_usuario()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.affiliates where user_id = auth.uid();
$$;

create or replace function public.afiliado_eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(auth.uid(), 'super_admin');
$$;

-- ═════════════════════════════════════════════════════════════════════════
-- SAQUE: O AFILIADO PEDE
-- ═════════════════════════════════════════════════════════════════════════
--
-- O VALOR NÃO VEM DA TELA
--
-- Não existe parâmetro de valor. O saque é SEMPRE de tudo o que está
-- disponível, somado aqui dentro, do extrato. Pedir "R$ 10.000" pela tela
-- não tem onde entrar.
--
-- As comissões entram TRAVADAS (`for update`): se um estorno chegar no mesmo
-- segundo, ele espera este pedido terminar em vez de mexer numa linha que
-- está sendo reservada.

create or replace function public.afiliado_solicitar_saque()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg public.affiliate_settings;
  v_afiliado public.affiliates;
  v_total bigint;
  v_saque uuid;
begin
  select * into v_afiliado from public.affiliates where user_id = auth.uid() for update;
  if not found then
    raise exception 'Você não está cadastrado como afiliado.';
  end if;
  if v_afiliado.status <> 'active' then
    raise exception 'Sua conta de afiliado não está ativa.';
  end if;
  if coalesce(trim(v_afiliado.pix_key), '') = '' then
    raise exception 'Cadastre uma chave Pix antes de pedir o saque.';
  end if;

  select * into v_cfg from public.affiliate_settings where id;

  perform 1 from public.affiliate_commissions
   where affiliate_id = v_afiliado.id and status = 'available'
   for update;

  select coalesce(sum(commission_amount_cents), 0) into v_total
  from public.affiliate_commissions
  where affiliate_id = v_afiliado.id and status = 'available';

  if v_total <= 0 then
    raise exception 'Você não tem saldo disponível para saque.';
  end if;
  if v_total < v_cfg.minimum_withdrawal_cents then
    raise exception 'O saque mínimo é de % centavos.', v_cfg.minimum_withdrawal_cents;
  end if;

  insert into public.affiliate_withdrawals (affiliate_id, amount_cents, pix_key)
  values (v_afiliado.id, v_total, v_afiliado.pix_key)
  returning id into v_saque;

  update public.affiliate_commissions
     set status = 'requested', requested_at = now(), withdrawal_id = v_saque
   where affiliate_id = v_afiliado.id and status = 'available';

  insert into public.affiliate_events (affiliate_id, user_id, event_type, metadata)
  values (v_afiliado.id, auth.uid(), 'WITHDRAWAL_REQUESTED',
          jsonb_build_object('withdrawal_id', v_saque, 'amount_cents', v_total));

  return v_saque;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════
-- SAQUE: O ADMINISTRADOR DECIDE
-- ═════════════════════════════════════════════════════════════════════════
--
--   approve → pedido conferido, vai ser pago.
--   pay     → o Pix saiu. As comissões do saque viram `paid`.
--   reject  → as comissões voltam a ficar disponíveis.
--
-- Cada decisão confere o estado anterior: não se paga saque rejeitado, nem
-- se aprova duas vezes.

create or replace function public.afiliado_decidir_saque(
  p_withdrawal_id uuid, p_decisao text, p_notas text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.affiliate_withdrawals;
begin
  if not public.afiliado_eh_admin() then
    raise exception 'Somente administradores decidem saques.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_s from public.affiliate_withdrawals where id = p_withdrawal_id for update;
  if not found then
    raise exception 'Saque não encontrado.';
  end if;

  if p_decisao = 'approve' then
    if v_s.status <> 'requested' then
      raise exception 'Só um saque pedido pode ser aprovado (este está %).', v_s.status;
    end if;
    update public.affiliate_withdrawals
       set status = 'approved', approved_at = now(), decided_by = auth.uid(),
           admin_notes = coalesce(p_notas, admin_notes)
     where id = v_s.id;
    insert into public.affiliate_events (affiliate_id, admin_id, event_type, metadata)
    values (v_s.affiliate_id, auth.uid(), 'WITHDRAWAL_APPROVED',
            jsonb_build_object('withdrawal_id', v_s.id, 'amount_cents', v_s.amount_cents));

  elsif p_decisao = 'pay' then
    if v_s.status <> 'approved' then
      raise exception 'Só um saque aprovado pode ser pago (este está %).', v_s.status;
    end if;
    update public.affiliate_withdrawals
       set status = 'paid', paid_at = now(), decided_by = auth.uid(),
           admin_notes = coalesce(p_notas, admin_notes)
     where id = v_s.id;
    update public.affiliate_commissions
       set status = 'paid', paid_at = now()
     where withdrawal_id = v_s.id and status = 'requested';
    insert into public.affiliate_events (affiliate_id, admin_id, event_type, metadata)
    values (v_s.affiliate_id, auth.uid(), 'WITHDRAWAL_PAID',
            jsonb_build_object('withdrawal_id', v_s.id, 'amount_cents', v_s.amount_cents));

  elsif p_decisao = 'reject' then
    if v_s.status not in ('requested', 'approved') then
      raise exception 'Este saque não pode mais ser rejeitado (está %).', v_s.status;
    end if;
    update public.affiliate_withdrawals
       set status = 'rejected', rejected_at = now(), decided_by = auth.uid(),
           admin_notes = coalesce(p_notas, admin_notes)
     where id = v_s.id;
    update public.affiliate_commissions
       set status = 'available', requested_at = null, withdrawal_id = null
     where withdrawal_id = v_s.id and status = 'requested';
    insert into public.affiliate_events (affiliate_id, admin_id, event_type, metadata)
    values (v_s.affiliate_id, auth.uid(), 'WITHDRAWAL_REJECTED',
            jsonb_build_object('withdrawal_id', v_s.id, 'notes', p_notas));

  else
    raise exception 'Decisão desconhecida: %', p_decisao;
  end if;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════
-- ADMINISTRADOR: TAXA E SITUAÇÃO DO AFILIADO
-- ═════════════════════════════════════════════════════════════════════════
--
-- Mudar a taxa NÃO mexe em comissão nenhuma já registrada — cada uma tem a
-- sua taxa congelada. Vale só daqui para a frente, e fica registrado quem
-- mudou, de quanto para quanto.

create or replace function public.afiliado_definir_taxa(p_affiliate_id uuid, p_bps integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes integer;
begin
  if not public.afiliado_eh_admin() then
    raise exception 'Somente administradores mudam a comissão.' using errcode = 'insufficient_privilege';
  end if;
  if p_bps is not null and (p_bps < 0 or p_bps > 10000) then
    raise exception 'Comissão fora do intervalo (0 a 10000 pontos-base).';
  end if;

  select commission_bps into v_antes from public.affiliates where id = p_affiliate_id for update;
  if not found then
    raise exception 'Afiliado não encontrado.';
  end if;

  update public.affiliates set commission_bps = p_bps where id = p_affiliate_id;

  insert into public.affiliate_events (affiliate_id, admin_id, event_type, metadata)
  values (p_affiliate_id, auth.uid(), 'COMMISSION_RATE_CHANGED',
          jsonb_build_object('old_bps', v_antes, 'new_bps', p_bps));
end;
$$;

create or replace function public.afiliado_definir_status(p_affiliate_id uuid, p_status text, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes text;
begin
  if not public.afiliado_eh_admin() then
    raise exception 'Somente administradores mudam a situação do afiliado.' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('pending', 'active', 'suspended', 'blocked') then
    raise exception 'Situação desconhecida: %', p_status;
  end if;

  select status into v_antes from public.affiliates where id = p_affiliate_id for update;
  if not found then
    raise exception 'Afiliado não encontrado.';
  end if;

  update public.affiliates set status = p_status where id = p_affiliate_id;

  insert into public.affiliate_events (affiliate_id, admin_id, event_type, metadata)
  values (p_affiliate_id, auth.uid(),
          case when p_status = 'blocked' then 'AFFILIATE_BLOCKED' else 'AFFILIATE_STATUS_CHANGED' end,
          jsonb_build_object('old_status', v_antes, 'new_status', p_status, 'reason', p_motivo));
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════
-- REGRAS DE ACESSO (RLS)
-- ═════════════════════════════════════════════════════════════════════════
--
-- O AFILIADO SÓ LÊ. E SÓ O QUE É DELE.
--
-- Nenhuma tabela deste programa aceita escrita direta de quem está logado —
-- nem do próprio afiliado. Toda mudança passa por uma das funções acima,
-- que conferem quem está pedindo e o que pode ser mudado.
--
-- O motivo é concreto: uma regra "o afiliado pode editar a própria linha"
-- deixaria ele editar a própria linha INTEIRA — inclusive `commission_bps`
-- e `status`. RLS decide QUAIS LINHAS, não QUAIS COLUNAS.

alter table public.affiliate_settings enable row level security;
alter table public.affiliates enable row level security;
alter table public.affiliate_attributions enable row level security;
alter table public.affiliate_referrals enable row level security;
alter table public.affiliate_commissions enable row level security;
alter table public.affiliate_withdrawals enable row level security;
alter table public.affiliate_events enable row level security;

drop policy if exists "Logado le a configuracao do programa" on public.affiliate_settings;
create policy "Logado le a configuracao do programa" on public.affiliate_settings
  for select to authenticated using (true);

drop policy if exists "Afiliado le o proprio perfil" on public.affiliates;
create policy "Afiliado le o proprio perfil" on public.affiliates
  for select to authenticated
  using (user_id = auth.uid() or public.afiliado_eh_admin());

drop policy if exists "Afiliado le as proprias indicacoes" on public.affiliate_referrals;
create policy "Afiliado le as proprias indicacoes" on public.affiliate_referrals
  for select to authenticated
  using (affiliate_id = public.afiliado_do_usuario() or public.afiliado_eh_admin());

drop policy if exists "Afiliado le as proprias comissoes" on public.affiliate_commissions;
create policy "Afiliado le as proprias comissoes" on public.affiliate_commissions
  for select to authenticated
  using (affiliate_id = public.afiliado_do_usuario() or public.afiliado_eh_admin());

drop policy if exists "Afiliado le os proprios saques" on public.affiliate_withdrawals;
create policy "Afiliado le os proprios saques" on public.affiliate_withdrawals
  for select to authenticated
  using (affiliate_id = public.afiliado_do_usuario() or public.afiliado_eh_admin());

drop policy if exists "Afiliado le os proprios eventos" on public.affiliate_events;
create policy "Afiliado le os proprios eventos" on public.affiliate_events
  for select to authenticated
  using (affiliate_id = public.afiliado_do_usuario() or public.afiliado_eh_admin());

-- `affiliate_attributions` fica SEM regra nenhuma de propósito: nem o
-- afiliado lê. São os cliques crus, com rastro de IP — dado só do servidor.

-- Cinto e suspensório: além de não haver regra de escrita, a permissão de
-- escrever é retirada. Se um dia alguém criar uma regra de escrita por
-- descuido, ela continua sem efeito.
revoke insert, update, delete on
  public.affiliate_settings, public.affiliates, public.affiliate_attributions,
  public.affiliate_referrals, public.affiliate_commissions,
  public.affiliate_withdrawals, public.affiliate_events
from anon, authenticated;

revoke all on public.affiliate_attributions from anon, authenticated;
revoke all on public.affiliate_balances from anon;
grant select on public.affiliate_balances to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- QUEM PODE CHAMAR CADA FUNÇÃO
-- ═════════════════════════════════════════════════════════════════════════
--
-- ─────────────────────────────────────────────────────────────────────────
-- A ARMADILHA DO SECURITY DEFINER
-- ─────────────────────────────────────────────────────────────────────────
--
-- No Postgres, uma função nova pode ser chamada por QUALQUER UM por padrão.
-- E uma função `security definer` roda com os poderes de quem a criou — o
-- dono do banco. Juntas, as duas coisas querem dizer: sem as linhas abaixo,
-- qualquer visitante anônimo chamaria `afiliado_criar_comissao_da_fatura`
-- direto pela API e fabricaria comissão.
--
-- É o cofre com a chave pendurada na porta. Então primeiro tira-se a chave de
-- todo mundo, e depois entrega-se só a quem precisa.

revoke execute on function
  public.afiliado_valor_elegivel(uuid, text),
  public.afiliado_criar_comissao_da_fatura(uuid),
  public.afiliado_reverter_comissao_da_fatura(uuid, text),
  public.afiliado_liberar_comissoes(),
  public.afiliado_registrar_visita(text, text, text),
  public.afiliado_converter_indicacao(uuid, uuid, uuid, text),
  public.afiliado_solicitar_saque(),
  public.afiliado_decidir_saque(uuid, text, text),
  public.afiliado_definir_taxa(uuid, integer),
  public.afiliado_definir_status(uuid, text, text),
  public.afiliado_ao_mudar_fatura(),
  public.afiliado_ao_estornar_pagamento(),
  public.afiliado_indicacao_imutavel(),
  public.afiliado_evento_somente_leitura()
from public, anon, authenticated;

-- As de dinheiro e de rastreio: só o servidor (chave de serviço).
grant execute on function
  public.afiliado_valor_elegivel(uuid, text),
  public.afiliado_criar_comissao_da_fatura(uuid),
  public.afiliado_reverter_comissao_da_fatura(uuid, text),
  public.afiliado_liberar_comissoes(),
  public.afiliado_registrar_visita(text, text, text),
  public.afiliado_converter_indicacao(uuid, uuid, uuid, text)
to service_role;

-- As que um usuário logado chama — cada uma confere, lá dentro, se ele pode.
grant execute on function
  public.afiliado_solicitar_saque(),
  public.afiliado_decidir_saque(uuid, text, text),
  public.afiliado_definir_taxa(uuid, integer),
  public.afiliado_definir_status(uuid, text, text)
to authenticated, service_role;

-- As das regras de acesso precisam ser chamáveis por quem está logado — e só
-- por ele. Um visitante anônimo não tem regra nenhuma que as use.
revoke execute on function public.afiliado_do_usuario(), public.afiliado_eh_admin()
  from public, anon;
grant execute on function public.afiliado_do_usuario(), public.afiliado_eh_admin()
  to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- O ROBÔ DE LIBERAÇÃO
-- ═════════════════════════════════════════════════════════════════════════
--
-- Uma vez por hora, as comissões que passaram da carência viram
-- disponíveis. Usa o `pg_cron` que o banco já tem (é ele que fecha os ciclos
-- do Clube CENTS às 3h).

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('afiliados-liberar-comissoes')
      where exists (select 1 from cron.job where jobname = 'afiliados-liberar-comissoes');
    perform cron.schedule('afiliados-liberar-comissoes', '17 * * * *',
      'select public.afiliado_liberar_comissoes();');
  end if;
end $$;
