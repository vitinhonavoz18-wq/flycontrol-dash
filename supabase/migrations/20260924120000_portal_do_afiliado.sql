-- ═════════════════════════════════════════════════════════════════════════
-- PROGRAMA DE AFILIADOS — PARTE 2: O PORTAL DO AFILIADO
-- ═════════════════════════════════════════════════════════════════════════
--
-- A parte 1 (20260923120000_programa_de_afiliados.sql) montou o caixa: quem
-- indica quem, quanto cada fatura paga rende, quando a comissão libera e como
-- o saque sai. Esta parte monta o BALCÃO: o que o próprio afiliado consegue
-- ver e fazer pelo portal em flycontrol.conectfly.com.br/affiliates.
--
-- A REGRA DE OURO DESTE ARQUIVO
--
-- Nenhuma função aqui recebe "qual afiliado" do navegador. Todas descobrem
-- sozinhas quem está logado (`auth.uid()`) e só enxergam o que é dele. Mudar
-- um número no endereço da página ou na chamada não muda nada: é como o
-- garçom que só entrega a comanda da mesa onde a pessoa está sentada, por
-- mais que ela diga "é a da mesa 7".
--
-- E o afiliado continua sem escrever direto em tabela nenhuma. Tudo que ele
-- pode mudar (nome, telefone, Pix, pedir saque) passa por uma função que
-- confere as regras antes.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. CONFIGURAÇÃO: CADASTRO PRECISA DE APROVAÇÃO?
-- ─────────────────────────────────────────────────────────────────────────
--
-- Ligado (padrão): quem se cadastra fica "em análise" até a equipe aprovar,
-- e o link dele não conta nada até lá. Desligado: o cadastro já sai ativo.

alter table public.affiliate_settings
  add column if not exists approval_required boolean not null default true;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. DADOS DO AFILIADO: TIPO DA CHAVE PIX E ACEITE DOS TERMOS
-- ─────────────────────────────────────────────────────────────────────────

alter table public.affiliates
  add column if not exists pix_key_type text
    check (pix_key_type is null or pix_key_type in ('cpf', 'cnpj', 'email', 'phone', 'random')),
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

-- Novos tipos de evento da trilha de auditoria. A lista é fechada de
-- propósito: evento com nome inventado é recusado.
alter table public.affiliate_events drop constraint if exists affiliate_events_event_type_check;
alter table public.affiliate_events add constraint affiliate_events_event_type_check
  check (event_type in (
    'REFERRAL_CREATED', 'CUSTOMER_CONVERTED', 'COMMISSION_CREATED',
    'COMMISSION_RELEASED', 'COMMISSION_REVERSED', 'WITHDRAWAL_REQUESTED',
    'WITHDRAWAL_APPROVED', 'WITHDRAWAL_PAID', 'WITHDRAWAL_REJECTED',
    'AFFILIATE_BLOCKED', 'AFFILIATE_STATUS_CHANGED', 'COMMISSION_RATE_CHANGED',
    'SETTINGS_CHANGED', 'REFERRAL_REJECTED',
    'AFFILIATE_REGISTERED', 'PROFILE_UPDATED', 'PIX_KEY_CHANGED'
  ));

-- ─────────────────────────────────────────────────────────────────────────
-- 3. MATERIAIS DE DIVULGAÇÃO
-- ─────────────────────────────────────────────────────────────────────────
--
-- A prateleira onde a equipe vai colocar banners, stories, posts, logos,
-- vídeos, textos prontos e links. Nasce VAZIA: nenhum arquivo é inventado.
-- Quem coloca material aqui é a equipe (parte 3); o afiliado só lê o que
-- estiver publicado.

create table if not exists public.affiliate_materials (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('banner', 'story', 'post', 'logo', 'video', 'copy', 'link')),
  title text not null check (length(trim(title)) between 1 and 120),
  description text,
  -- Arquivo para baixar (imagem, vídeo, logo). Nulo para texto e link.
  file_url text check (file_url is null or file_url ~ '^https://'),
  -- Texto pronto para copiar (legenda, mensagem de WhatsApp).
  body_text text,
  -- Página do site para onde o link aponta. O portal acrescenta o `?ref=`
  -- do afiliado sozinho — ninguém precisa montar o link à mão.
  target_path text check (target_path is null or target_path ~ '^/[A-Za-z0-9/_\-]*$'),
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists affiliate_materials_publicados_idx
  on public.affiliate_materials (kind, sort_order) where is_published;

drop trigger if exists affiliate_materials_updated on public.affiliate_materials;
create trigger affiliate_materials_updated before update on public.affiliate_materials
  for each row execute function public.set_updated_at();

alter table public.affiliate_materials enable row level security;

drop policy if exists "Afiliado ativo le materiais publicados" on public.affiliate_materials;
create policy "Afiliado ativo le materiais publicados" on public.affiliate_materials
  for select to authenticated
  using (
    (is_published and exists (
      select 1 from public.affiliates a where a.user_id = auth.uid() and a.status = 'active'
    ))
    or public.afiliado_eh_admin()
  );

revoke insert, update, delete on public.affiliate_materials from anon, authenticated;
revoke all on public.affiliate_materials from anon;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. FERRAMENTAS INTERNAS
-- ─────────────────────────────────────────────────────────────────────────

-- Centavos → "R$ 1.234,56". Só para mensagens de erro; a tela formata sozinha.
create or replace function public.afiliado_reais(p_cents bigint)
returns text
language sql
immutable
set search_path = public
as $$
  select 'R$ ' || case when p_cents < 0 then '-' else '' end
    || replace(to_char(abs(p_cents) / 100, 'FM999G999G999G990'), ',', '.')
    || ',' || lpad((abs(p_cents) % 100)::text, 2, '0');
$$;

-- O afiliado de quem está logado, SE estiver ativo. Qualquer outra situação
-- vira erro com um código curto que a tela sabe traduzir.
create or replace function public.afiliado_ativo_do_usuario()
returns public.affiliates
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.affiliates;
begin
  if auth.uid() is null then
    raise exception 'nao_autenticado' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.affiliates where user_id = auth.uid();
  if not found then
    raise exception 'nao_afiliado' using errcode = 'insufficient_privilege';
  end if;
  if v.status <> 'active' then
    raise exception 'afiliado_%', v.status using errcode = 'insufficient_privilege';
  end if;
  return v;
end;
$$;

-- A situação da loja indicada, nas quatro palavras que o afiliado vê.
-- Lê só a situação da loja — nunca dono, e-mail, telefone ou endereço.
--
--   CANCELADO    → loja apagada/desativada, assinatura cancelada ou vencida;
--   INADIMPLENTE → cobrança em atraso ou loja suspensa;
--   ATIVO        → assinatura ativa, pagando;
--   CADASTRADO   → criou a conta mas ainda não virou cliente pagante
--                  (período gratuito, aguardando ativação ou pagamento).
create or replace function public.afiliado_situacao_da_loja(
  p_indicacao_status text, p_loja_status text, p_loja_ativa boolean, p_assinatura text
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_indicacao_status = 'cancelled'
      or p_loja_status is null
      or p_loja_status in ('deleted', 'inactive')
      or p_loja_ativa is false
      or p_assinatura in ('canceled', 'expired') then 'CANCELADO'
    when p_assinatura in ('past_due', 'suspended') then 'INADIMPLENTE'
    when p_assinatura = 'active' then 'ATIVO'
    else 'CADASTRADO'
  end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. CADASTRO DO AFILIADO (chamado SÓ pelo servidor)
-- ─────────────────────────────────────────────────────────────────────────
--
-- O login (conta de acesso) é criado antes pelo servidor, com a chave de
-- serviço. Esta função cria a ficha de afiliado ligada a ele e escolhe o
-- código de indicação.
--
-- O CÓDIGO É DO SISTEMA, NÃO DA PESSOA. Ele nasce do primeiro nome + três
-- números ("JOAO482") e nunca mais muda: se o afiliado pudesse trocar o
-- código, todo link que ele já espalhou pelo Instagram pararia de funcionar
-- de um dia para o outro — é como trocar o número do telefone da pizzaria
-- depois de imprimir mil panfletos.

create or replace function public.afiliado_cadastrar(
  p_user_id uuid, p_nome text, p_email text, p_telefone text, p_termos_versao text
)
returns table (affiliate_id uuid, referral_code text, status text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_cfg public.affiliate_settings;
  v_nome text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_tel text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_base text;
  v_codigo text;
  v_status text;
  v_id uuid;
  v_tentativa integer := 0;
begin
  if p_user_id is null then
    raise exception 'usuario_obrigatorio';
  end if;
  if length(v_nome) < 3 or length(v_nome) > 120 then
    raise exception 'nome_invalido';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_invalido';
  end if;
  if v_tel is not null and length(v_tel) not between 10 and 13 then
    raise exception 'telefone_invalido';
  end if;
  if exists (select 1 from public.affiliates a where a.user_id = p_user_id) then
    raise exception 'ja_afiliado';
  end if;

  select * into v_cfg from public.affiliate_settings where id;
  if not found or not v_cfg.program_enabled then
    raise exception 'programa_desligado';
  end if;
  v_status := case when v_cfg.approval_required then 'pending' else 'active' end;

  -- Primeiro nome, sem acento, só letras e números, até 8 caracteres.
  v_base := upper(translate(split_part(v_nome, ' ', 1),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'));
  v_base := left(regexp_replace(v_base, '[^A-Z0-9]', '', 'g'), 8);
  if length(v_base) < 3 then
    v_base := 'FLY' || v_base;
  end if;

  loop
    v_tentativa := v_tentativa + 1;
    if v_tentativa <= 30 then
      v_codigo := v_base || lpad((floor(random() * 1000))::int::text, 3, '0');
    else
      -- Nome muito comum: parte para um código sorteado inteiro.
      v_codigo := 'FLY' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7));
    end if;
    exit when not exists (select 1 from public.affiliates a where a.referral_code = v_codigo);
    if v_tentativa > 60 then
      raise exception 'codigo_indisponivel';
    end if;
  end loop;

  insert into public.affiliates (
    user_id, name, email, phone, referral_code, status, terms_accepted_at, terms_version
  ) values (
    p_user_id, v_nome, v_email, v_tel, v_codigo, v_status, now(), p_termos_versao
  )
  returning id into v_id;

  insert into public.affiliate_events (affiliate_id, user_id, event_type, metadata)
  values (v_id, p_user_id, 'AFFILIATE_REGISTERED',
          jsonb_build_object('referral_code', v_codigo, 'status', v_status,
                             'terms_version', p_termos_versao));

  return query select v_id, v_codigo, v_status;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. O QUE O PORTAL LÊ
-- ─────────────────────────────────────────────────────────────────────────

-- O perfil de quem está logado. Funciona em QUALQUER situação (em análise,
-- suspenso, bloqueado): é com ele que a tela decide o que mostrar. Devolve
-- nulo para quem não é afiliado.
create or replace function public.afiliado_meu_perfil()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'nome', a.name,
    'email', a.email,
    'telefone', a.phone,
    'pix_tipo', a.pix_key_type,
    'pix_chave', a.pix_key,
    'codigo', a.referral_code,
    'status', a.status,
    'criado_em', a.created_at,
    'comissao_bps', coalesce(a.commission_bps, s.default_commission_bps),
    'comissao_tipo', s.commission_type,
    'comissao_meses', s.commission_duration_months,
    'dias_para_liberar', s.commission_release_days,
    'saque_minimo_cents', s.minimum_withdrawal_cents,
    'programa_ativo', s.program_enabled
  )
  from public.affiliates a
  cross join public.affiliate_settings s
  where a.user_id = auth.uid() and s.id;
$$;

-- Os oito números do painel. Tudo calculado aqui, a partir do livro-caixa
-- das comissões — a tela não soma nada.
create or replace function public.afiliado_meu_resumo()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_af public.affiliates := public.afiliado_ativo_do_usuario();
  v_saldo record;
  v_receita bigint;
  v_indicacoes integer;
  v_ativos integer;
  v_cliques integer;
  v_cfg public.affiliate_settings;
begin
  select * into v_cfg from public.affiliate_settings where id;

  select
    coalesce(sum(commission_amount_cents) filter (where status = 'available'), 0) as disponivel,
    coalesce(sum(commission_amount_cents) filter (where status = 'pending'), 0) as pendente,
    coalesce(sum(commission_amount_cents) filter (where status = 'requested'), 0) as solicitado,
    coalesce(sum(commission_amount_cents) filter (where status = 'paid'), 0) as pago,
    coalesce(sum(commission_amount_cents)
      filter (where status in ('pending', 'available', 'requested', 'paid')), 0) as acumulado
  into v_saldo
  from public.affiliate_commissions
  where affiliate_id = v_af.id;

  -- Receita que os clientes indicados pagaram e que entrou na conta da
  -- comissão. Fatura estornada sai da soma.
  select coalesce(sum(c.eligible_amount_cents), 0) into v_receita
  from public.affiliate_commissions c
  where c.affiliate_id = v_af.id
    and c.kind = 'commission'
    and c.status not in ('reversed', 'cancelled')
    and not exists (
      select 1 from public.affiliate_commissions aj
      where aj.reverses_commission_id = c.id
    );

  select count(*),
         count(*) filter (where public.afiliado_situacao_da_loja(
           r.status, p.status, p.is_active, p.subscription_status) = 'ATIVO')
    into v_indicacoes, v_ativos
  from public.affiliate_referrals r
  left join public.pizzerias p on p.id = r.establishment_id
  where r.affiliate_id = v_af.id;

  select count(*) into v_cliques
  from public.affiliate_attributions
  where affiliate_id = v_af.id;

  return jsonb_build_object(
    'disponivel_cents', v_saldo.disponivel,
    'pendente_cents', v_saldo.pendente,
    'solicitado_cents', v_saldo.solicitado,
    'recebido_cents', v_saldo.pago,
    'acumulado_cents', v_saldo.acumulado,
    'receita_gerada_cents', v_receita,
    'clientes_ativos', v_ativos,
    'total_indicacoes', v_indicacoes,
    'cliques', v_cliques,
    -- Em décimos de ponto percentual (125 = 12,5%), para não usar vírgula
    -- no banco. Nulo quando ninguém clicou ainda: 0 de 0 não é 0%.
    'conversao_milesimos', case when v_cliques = 0 then null
                                else (v_indicacoes * 1000) / v_cliques end,
    'comissao_bps', coalesce(v_af.commission_bps, v_cfg.default_commission_bps),
    'comissao_tipo', v_cfg.commission_type,
    'comissao_meses', v_cfg.commission_duration_months
  );
end;
$$;

-- Ganhos e novas indicações ao longo do tempo, para os gráficos.
--   7 e 30 dias → um ponto por dia;
--   3 meses     → um ponto por semana;
--   6 e 12 meses → um ponto por mês.
-- As datas seguem o horário de Brasília: comissão das 23h de uma segunda
-- não pode cair na terça do gráfico.
create or replace function public.afiliado_minha_serie(p_dias integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_af public.affiliates := public.afiliado_ativo_do_usuario();
  v_passo text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio date;
  v_pontos jsonb;
begin
  if p_dias not in (7, 30, 90, 180, 365) then
    raise exception 'periodo_invalido';
  end if;
  v_passo := case when p_dias <= 30 then 'day' when p_dias = 90 then 'week' else 'month' end;
  v_inicio := date_trunc(v_passo, (v_hoje - (p_dias - 1))::timestamp)::date;

  with baldes as (
    select g::date as inicio
    from generate_series(v_inicio::timestamp, v_hoje::timestamp, ('1 ' || v_passo)::interval) g
  ),
  ganhos as (
    select date_trunc(v_passo, (c.created_at at time zone 'America/Sao_Paulo'))::date as inicio,
           sum(c.commission_amount_cents) as cents
    from public.affiliate_commissions c
    where c.affiliate_id = v_af.id
      and c.status not in ('reversed', 'cancelled')
      and (c.created_at at time zone 'America/Sao_Paulo')::date >= v_inicio
    group by 1
  ),
  novas as (
    select date_trunc(v_passo, (r.converted_at at time zone 'America/Sao_Paulo'))::date as inicio,
           count(*) as qtd
    from public.affiliate_referrals r
    where r.affiliate_id = v_af.id
      and (r.converted_at at time zone 'America/Sao_Paulo')::date >= v_inicio
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'inicio', b.inicio,
           'ganhos_cents', coalesce(g.cents, 0),
           'indicacoes', coalesce(n.qtd, 0)
         ) order by b.inicio), '[]'::jsonb)
    into v_pontos
  from baldes b
  left join ganhos g on g.inicio = b.inicio
  left join novas n on n.inicio = b.inicio;

  return jsonb_build_object('passo', v_passo, 'pontos', v_pontos);
end;
$$;

-- As lojas indicadas, com busca, filtro de situação e páginas.
-- Mostra só nome da loja, data, situação e valores — nada do dono.
create or replace function public.afiliado_minhas_indicacoes(
  p_busca text default null, p_situacao text default null,
  p_pagina integer default 1, p_por_pagina integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_af public.affiliates := public.afiliado_ativo_do_usuario();
  v_por integer := least(greatest(coalesce(p_por_pagina, 10), 1), 50);
  v_pag integer := greatest(coalesce(p_pagina, 1), 1);
  v_busca text := nullif(trim(coalesce(p_busca, '')), '');
  v_situacao text := nullif(upper(trim(coalesce(p_situacao, ''))), '');
  v_total integer;
  v_itens jsonb;
begin
  if v_situacao is not null and v_situacao not in ('CADASTRADO', 'ATIVO', 'INADIMPLENTE', 'CANCELADO') then
    raise exception 'situacao_invalida';
  end if;
  if v_busca is not null then
    -- A busca é por texto puro: `%` e `_` digitados valem como letra.
    v_busca := '%' || replace(replace(replace(left(v_busca, 60), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with base as (
    select r.id, r.converted_at,
           coalesce(p.name, 'Loja removida') as loja,
           public.afiliado_situacao_da_loja(r.status, p.status, p.is_active, p.subscription_status) as situacao
    from public.affiliate_referrals r
    left join public.pizzerias p on p.id = r.establishment_id
    where r.affiliate_id = v_af.id
  ),
  filtrada as (
    select * from base
    where (v_busca is null or loja ilike v_busca)
      and (v_situacao is null or situacao = v_situacao)
  ),
  pagina as (
    select f.*,
      coalesce((select sum(c.eligible_amount_cents) from public.affiliate_commissions c
                where c.referral_id = f.id and c.kind = 'commission'
                  and c.status not in ('reversed', 'cancelled')), 0) as receita_cents,
      coalesce((select sum(c.commission_amount_cents) from public.affiliate_commissions c
                where c.referral_id = f.id
                  and c.status not in ('reversed', 'cancelled')), 0) as comissao_cents
    from filtrada f
    order by f.converted_at desc, f.id
    limit v_por offset (v_pag - 1) * v_por
  )
  select (select count(*) from filtrada),
         coalesce((select jsonb_agg(jsonb_build_object(
           'id', id, 'loja', loja, 'data', converted_at, 'situacao', situacao,
           'receita_cents', receita_cents, 'comissao_cents', comissao_cents
         ) order by converted_at desc, id) from pagina), '[]'::jsonb)
    into v_total, v_itens;

  return jsonb_build_object('total', v_total, 'pagina', v_pag, 'por_pagina', v_por, 'itens', v_itens);
end;
$$;

-- O extrato das comissões. Filtros: situação e período.
create or replace function public.afiliado_minhas_comissoes(
  p_situacao text default null, p_dias integer default null,
  p_pagina integer default 1, p_por_pagina integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_af public.affiliates := public.afiliado_ativo_do_usuario();
  v_por integer := least(greatest(coalesce(p_por_pagina, 10), 1), 50);
  v_pag integer := greatest(coalesce(p_pagina, 1), 1);
  v_situacao text := nullif(lower(trim(coalesce(p_situacao, ''))), '');
  v_desde timestamptz;
  v_total integer;
  v_itens jsonb;
begin
  -- "estornada" junta os dois jeitos de uma comissão deixar de valer.
  if v_situacao is not null
     and v_situacao not in ('pending', 'available', 'requested', 'paid', 'reversed') then
    raise exception 'situacao_invalida';
  end if;
  if p_dias is not null then
    if p_dias not in (7, 30, 90, 180, 365) then
      raise exception 'periodo_invalido';
    end if;
    v_desde := now() - make_interval(days => p_dias);
  end if;

  with filtrada as (
    select c.*
    from public.affiliate_commissions c
    where c.affiliate_id = v_af.id
      and (v_desde is null or c.created_at >= v_desde)
      and (v_situacao is null
           or (v_situacao = 'reversed' and c.status in ('reversed', 'cancelled'))
           or (v_situacao <> 'reversed' and c.status = v_situacao))
  ),
  pagina as (
    select f.*, coalesce(p.name, 'Loja removida') as loja
    from filtrada f
    left join public.pizzerias p on p.id = f.establishment_id
    order by f.created_at desc, f.id
    limit v_por offset (v_pag - 1) * v_por
  )
  select (select count(*) from filtrada),
         coalesce((select jsonb_agg(jsonb_build_object(
           'id', id,
           'data', created_at,
           'loja', loja,
           'tipo', kind,
           'valor_elegivel_cents', eligible_amount_cents,
           'bps', commission_bps,
           'comissao_cents', commission_amount_cents,
           'situacao', case when status = 'cancelled' then 'reversed' else status end,
           'libera_em', case when status = 'pending' then available_at end
         ) order by created_at desc, id) from pagina), '[]'::jsonb)
    into v_total, v_itens;

  return jsonb_build_object('total', v_total, 'pagina', v_pag, 'por_pagina', v_por, 'itens', v_itens);
end;
$$;

-- Os saques do afiliado. A chave Pix aparece mascarada: só o fim dela, o
-- bastante para a pessoa reconhecer qual usou.
create or replace function public.afiliado_meus_saques(
  p_pagina integer default 1, p_por_pagina integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_af public.affiliates := public.afiliado_ativo_do_usuario();
  v_por integer := least(greatest(coalesce(p_por_pagina, 10), 1), 50);
  v_pag integer := greatest(coalesce(p_pagina, 1), 1);
  v_total integer;
  v_itens jsonb;
begin
  select count(*) into v_total from public.affiliate_withdrawals where affiliate_id = v_af.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', w.id,
           'valor_cents', w.amount_cents,
           'pix_final', right(w.pix_key, 4),
           'situacao', w.status,
           'pedido_em', w.requested_at,
           'aprovado_em', w.approved_at,
           'pago_em', w.paid_at,
           'recusado_em', w.rejected_at,
           -- O motivo só aparece quando o saque foi recusado: é o recado da
           -- equipe para o afiliado entender o que houve.
           'motivo', case when w.status = 'rejected' then w.admin_notes end
         ) order by w.requested_at desc, w.id), '[]'::jsonb)
    into v_itens
  from (
    select * from public.affiliate_withdrawals
    where affiliate_id = v_af.id
    order by requested_at desc, id
    limit v_por offset (v_pag - 1) * v_por
  ) w;

  return jsonb_build_object('total', v_total, 'pagina', v_pag, 'por_pagina', v_por, 'itens', v_itens);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. O QUE O AFILIADO PODE MUDAR: NOME, TELEFONE E PIX
-- ─────────────────────────────────────────────────────────────────────────
--
-- Código de indicação, porcentagem e situação NÃO passam por aqui — nem
-- existem como parâmetro. Não há como pedir para mudá-los.
--
-- Troca de Pix fica anotada na trilha de auditoria (só o final da chave):
-- se alguém entrar na conta de um afiliado e trocar o Pix para receber no
-- lugar dele, a equipe consegue ver quando aconteceu.

create or replace function public.afiliado_atualizar_meus_dados(
  p_nome text, p_telefone text, p_pix_tipo text, p_pix_chave text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_af public.affiliates;
  v_nome text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_tel text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_tipo text := nullif(lower(trim(coalesce(p_pix_tipo, ''))), '');
  v_chave text := nullif(trim(coalesce(p_pix_chave, '')), '');
begin
  if auth.uid() is null then
    raise exception 'nao_autenticado' using errcode = 'insufficient_privilege';
  end if;
  select * into v_af from public.affiliates where user_id = auth.uid() for update;
  if not found then
    raise exception 'nao_afiliado' using errcode = 'insufficient_privilege';
  end if;
  if v_af.status = 'blocked' then
    raise exception 'afiliado_blocked' using errcode = 'insufficient_privilege';
  end if;

  if length(v_nome) < 3 or length(v_nome) > 120 then
    raise exception 'nome_invalido';
  end if;
  if v_tel is not null and length(v_tel) not between 10 and 13 then
    raise exception 'telefone_invalido';
  end if;

  -- Pix: os dois juntos ou nenhum.
  if (v_tipo is null) <> (v_chave is null) then
    raise exception 'pix_incompleto';
  end if;
  if v_tipo is not null then
    if v_tipo not in ('cpf', 'cnpj', 'email', 'phone', 'random') then
      raise exception 'pix_tipo_invalido';
    end if;
    if v_tipo in ('cpf', 'cnpj', 'phone') then
      v_chave := regexp_replace(v_chave, '\D', '', 'g');
    elsif v_tipo = 'email' then
      v_chave := lower(v_chave);
    else
      v_chave := lower(v_chave);
    end if;
    if (v_tipo = 'cpf' and v_chave !~ '^\d{11}$')
       or (v_tipo = 'cnpj' and v_chave !~ '^\d{14}$')
       or (v_tipo = 'phone' and v_chave !~ '^\d{10,13}$')
       or (v_tipo = 'email' and (v_chave !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_chave) > 77))
       or (v_tipo = 'random' and v_chave !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception 'pix_chave_invalida';
    end if;
  end if;

  update public.affiliates
     set name = v_nome, phone = v_tel, pix_key_type = v_tipo, pix_key = v_chave
   where id = v_af.id;

  if v_af.pix_key is distinct from v_chave or v_af.pix_key_type is distinct from v_tipo then
    insert into public.affiliate_events (affiliate_id, user_id, event_type, metadata)
    values (v_af.id, auth.uid(), 'PIX_KEY_CHANGED',
            jsonb_build_object('old_type', v_af.pix_key_type, 'old_end', right(v_af.pix_key, 4),
                               'new_type', v_tipo, 'new_end', right(v_chave, 4)));
  end if;
  if v_af.name is distinct from v_nome or v_af.phone is distinct from v_tel then
    insert into public.affiliate_events (affiliate_id, user_id, event_type, metadata)
    values (v_af.id, auth.uid(), 'PROFILE_UPDATED',
            jsonb_build_object('name_changed', v_af.name is distinct from v_nome,
                               'phone_changed', v_af.phone is distinct from v_tel));
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 8. PEDIR SAQUE — AGORA COM CONFERÊNCIA DO VALOR
-- ─────────────────────────────────────────────────────────────────────────
--
-- O saque continua sendo do SALDO DISPONÍVEL INTEIRO, calculado aqui pelo
-- banco. A novidade: a tela manda junto o valor que a pessoa VIU na hora de
-- clicar. Esse número não decide nada — serve só de conferência. Se o saldo
-- mudou entre a pessoa abrir a tela e clicar (uma comissão liberou, um
-- estorno entrou), o pedido é recusado com o valor novo, em vez de sair um
-- saque diferente do que ela leu.
--
-- É o caixa que confere o total com o cliente antes de passar o cartão: se
-- a conta mudou, ele avisa antes de cobrar.

drop function if exists public.afiliado_solicitar_saque();

create or replace function public.afiliado_solicitar_saque(p_valor_confirmado_cents bigint)
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
  if auth.uid() is null then
    raise exception 'nao_autenticado' using errcode = 'insufficient_privilege';
  end if;
  select * into v_afiliado from public.affiliates where user_id = auth.uid() for update;
  if not found then
    raise exception 'Você não está cadastrado como afiliado.';
  end if;
  if v_afiliado.status <> 'active' then
    raise exception 'Sua conta de afiliado não está ativa.';
  end if;
  if coalesce(trim(v_afiliado.pix_key), '') = '' then
    raise exception 'Cadastre uma chave Pix em Configurações antes de pedir o saque.';
  end if;
  if p_valor_confirmado_cents is null or p_valor_confirmado_cents <= 0 then
    raise exception 'O valor do saque precisa ser maior que zero.';
  end if;
  if exists (
    select 1 from public.affiliate_withdrawals
    where affiliate_id = v_afiliado.id and status in ('requested', 'approved')
  ) then
    raise exception 'Você já tem um saque em andamento. Aguarde a conclusão para pedir outro.';
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
    raise exception 'O saque mínimo é de %. Seu saldo disponível é de %.',
      public.afiliado_reais(v_cfg.minimum_withdrawal_cents), public.afiliado_reais(v_total);
  end if;
  if p_valor_confirmado_cents <> v_total then
    raise exception 'Seu saldo disponível mudou para %. Confira o valor e peça de novo.',
      public.afiliado_reais(v_total);
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

-- ─────────────────────────────────────────────────────────────────────────
-- 9. QUEM PODE CHAMAR CADA FUNÇÃO
-- ─────────────────────────────────────────────────────────────────────────
--
-- Mesma regra da parte 1: primeiro tira-se a chave de todo mundo, depois
-- entrega-se só a quem precisa.

revoke execute on function
  public.afiliado_reais(bigint),
  public.afiliado_ativo_do_usuario(),
  public.afiliado_situacao_da_loja(text, text, boolean, text),
  public.afiliado_cadastrar(uuid, text, text, text, text),
  public.afiliado_meu_perfil(),
  public.afiliado_meu_resumo(),
  public.afiliado_minha_serie(integer),
  public.afiliado_minhas_indicacoes(text, text, integer, integer),
  public.afiliado_minhas_comissoes(text, integer, integer, integer),
  public.afiliado_meus_saques(integer, integer),
  public.afiliado_atualizar_meus_dados(text, text, text, text),
  public.afiliado_solicitar_saque(bigint)
from public, anon, authenticated;

-- Cadastro: só o servidor, depois de criar o login.
grant execute on function public.afiliado_cadastrar(uuid, text, text, text, text) to service_role;

-- O portal: quem está logado. Cada uma descobre sozinha QUEM é.
grant execute on function
  public.afiliado_meu_perfil(),
  public.afiliado_meu_resumo(),
  public.afiliado_minha_serie(integer),
  public.afiliado_minhas_indicacoes(text, text, integer, integer),
  public.afiliado_minhas_comissoes(text, integer, integer, integer),
  public.afiliado_meus_saques(integer, integer),
  public.afiliado_atualizar_meus_dados(text, text, text, text),
  public.afiliado_solicitar_saque(bigint)
to authenticated, service_role;

-- As internas: chamadas de dentro das funções acima (que rodam como dono do
-- banco), nunca direto pela internet.
grant execute on function
  public.afiliado_reais(bigint),
  public.afiliado_ativo_do_usuario(),
  public.afiliado_situacao_da_loja(text, text, boolean, text)
to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 10. AS REGRAS DO PROGRAMA, PARA A PÁGINA DE APRESENTAÇÃO
-- ─────────────────────────────────────────────────────────────────────────
--
-- A página /affiliates é aberta (qualquer visitante vê). Ela mostra a
-- porcentagem, o prazo de liberação e o saque mínimo DE VERDADE, lidos
-- daqui — nada de número escrito à mão na tela que fica velho no dia em
-- que a equipe muda a regra. Só saem as regras gerais do programa; nada de
-- nenhum afiliado.

create or replace function public.afiliado_regras_publicas()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'programa_ativo', program_enabled,
    'comissao_bps', default_commission_bps,
    'comissao_tipo', commission_type,
    'comissao_meses', commission_duration_months,
    'dias_para_liberar', commission_release_days,
    'saque_minimo_cents', minimum_withdrawal_cents,
    'dias_do_link', referral_cookie_days,
    'aprovacao_manual', approval_required
  )
  from public.affiliate_settings
  where id;
$$;

revoke execute on function public.afiliado_regras_publicas() from public;
grant execute on function public.afiliado_regras_publicas() to anon, authenticated, service_role;
