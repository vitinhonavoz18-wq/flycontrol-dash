-- ═════════════════════════════════════════════════════════════════════════
-- PROGRAMA DE AFILIADOS — AS REGRAS DEFINIDAS PELO DONO DO PROGRAMA
-- ═════════════════════════════════════════════════════════════════════════
--
-- Decisões tomadas depois das três partes:
--
--   1. Comissão padrão de 15%, que a equipe pode mudar quando quiser.
--   2. Repasse nos dias 10 e 20 de todo mês: tudo o que o parceiro tiver a
--      receber nessas datas entra no repasse.
--   3. Saque mínimo de R$ 100,00.
--   4. O clique no link vale PARA SEMPRE: o primeiro parceiro que trouxe a
--      pessoa fica com ela, sem prazo.
--   5. Cadastro de parceiro passa por análise da equipe.
--   6. O pagamento é feito à mão pela empresa, que entra em contato com
--      cada parceiro.
--   7. Comissão recorrente enquanto o indicado estiver ativo e pagando.
--   9. Parceiro suspenso não gera comissão.
--  10. O parceiro NÃO pede saque. O repasse é montado sozinho nos dias 10
--      e 20, sempre com o saldo inteiro.
--
-- (A 8 — desconto de 40% no Premium para quem vem pelo link — fica para
-- depois, como combinado.)

-- ─────────────────────────────────────────────────────────────────────────
-- 1. O LINK SEM PRAZO
-- ─────────────────────────────────────────────────────────────────────────
--
-- Janela nula = sem prazo. O clique fica guardado com validade de 100 anos
-- — na prática, para sempre.

alter table public.affiliate_settings alter column referral_cookie_days drop not null;
alter table public.affiliate_settings drop constraint if exists affiliate_settings_referral_cookie_days_check;
alter table public.affiliate_settings add constraint affiliate_settings_referral_cookie_days_check
  check (referral_cookie_days is null or referral_cookie_days between 1 and 365);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. OS DIAS DO REPASSE
-- ─────────────────────────────────────────────────────────────────────────
--
-- Guardados na configuração (e não escritos no código) para a equipe
-- poder mudar pela tela. De 1 a 28 para existir em todo mês — dia 30 não
-- existe em fevereiro.

alter table public.affiliate_settings
  add column if not exists payout_days smallint[] not null default '{10,20}'
    check (
      cardinality(payout_days) between 1 and 4
      and payout_days <@ '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28}'::smallint[]
    );

-- Cada repasse automático guarda o dia em que foi montado. Um parceiro só
-- recebe UM repasse por dia de repasse — se o robô rodar duas vezes no
-- mesmo dia (ou a equipe clicar em "gerar agora" depois dele), o segundo
-- não duplica nada.
alter table public.affiliate_withdrawals
  add column if not exists payout_cycle date;

create unique index if not exists affiliate_withdrawals_um_por_ciclo
  on public.affiliate_withdrawals (affiliate_id, payout_cycle)
  where payout_cycle is not null;

-- Novo evento: o registro de cada rodada de repasse, com o resumo.
alter table public.affiliate_events drop constraint if exists affiliate_events_event_type_check;
alter table public.affiliate_events add constraint affiliate_events_event_type_check
  check (event_type in (
    'REFERRAL_CREATED', 'CUSTOMER_CONVERTED', 'COMMISSION_CREATED',
    'COMMISSION_RELEASED', 'COMMISSION_REVERSED', 'WITHDRAWAL_REQUESTED',
    'WITHDRAWAL_APPROVED', 'WITHDRAWAL_PAID', 'WITHDRAWAL_REJECTED',
    'AFFILIATE_BLOCKED', 'AFFILIATE_STATUS_CHANGED', 'COMMISSION_RATE_CHANGED',
    'SETTINGS_CHANGED', 'REFERRAL_REJECTED',
    'AFFILIATE_REGISTERED', 'PROFILE_UPDATED', 'PIX_KEY_CHANGED',
    'AFFILIATE_APPROVED', 'AFFILIATE_SUSPENDED', 'AFFILIATE_REACTIVATED',
    'REFERRAL_CANCELLED', 'REFERRAL_RESTORED', 'REFERRAL_ASSIGNED_MANUALLY',
    'COMMISSION_ADJUSTED', 'SUSPICIOUS_ACTIVITY',
    'PAYOUT_CYCLE_RUN'
  ));

-- ─────────────────────────────────────────────────────────────────────────
-- 3. O CLIQUE: SEM PRAZO QUANDO A JANELA É NULA
-- ─────────────────────────────────────────────────────────────────────────

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
  v_vence timestamptz;
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

  v_vence := case
    when v_cfg.referral_cookie_days is null then now() + interval '100 years'
    else now() + make_interval(days => v_cfg.referral_cookie_days)
  end;

  return query
  insert into public.affiliate_attributions (affiliate_id, referral_code, expires_at, ip_hash, user_agent)
  values (v_afiliado.id, v_codigo, v_vence, p_ip_hash, left(p_user_agent, 300))
  returning affiliate_attributions.token, affiliate_attributions.expires_at;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. O REPASSE AUTOMÁTICO
-- ─────────────────────────────────────────────────────────────────────────
--
-- Roda todo dia de madrugada e só age nos dias de repasse (horário de
-- Brasília). Para cada parceiro ATIVO:
--
--   - libera antes o que já pode ser liberado;
--   - soma o saldo disponível (o livro-caixa, nunca um número de tela);
--   - se for de pelo menos o saque mínimo e houver chave Pix, monta o
--     repasse com o saldo inteiro e prende a ele as comissões somadas;
--   - se não bater o mínimo, o saldo espera o próximo dia de repasse;
--   - sem Pix, fica de fora e aparece para a equipe cobrar a chave;
--   - com um repasse anterior ainda não pago, espera (um aberto por vez).
--
-- Um parceiro com problema não trava os outros: cada um é montado à parte.
-- No fim, uma linha na auditoria resume a rodada.

create or replace function public.afiliado_gerar_repasses(p_forcar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg public.affiliate_settings;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_af public.affiliates;
  v_ids uuid[];
  v_total bigint;
  v_saque uuid;
  v_troca_pix timestamptz;
  v_criados integer := 0;
  v_valor bigint := 0;
  v_abaixo integer := 0;
  v_sem_pix integer := 0;
  v_em_aberto integer := 0;
  v_falhas integer := 0;
  v_resumo jsonb;
begin
  select * into v_cfg from public.affiliate_settings where id;
  if not p_forcar and not (extract(day from v_hoje)::smallint = any(v_cfg.payout_days)) then
    return jsonb_build_object('executado', false, 'motivo', 'nao_e_dia_de_repasse', 'data', v_hoje);
  end if;

  perform public.afiliado_liberar_comissoes();

  for v_af in
    select * from public.affiliates a
    where a.status = 'active'
      and exists (select 1 from public.affiliate_commissions c
                  where c.affiliate_id = a.id and c.status = 'available')
    order by a.created_at
  loop
    begin
      -- Tranca o parceiro: nada muda no saldo dele enquanto o repasse é montado.
      select * into v_af from public.affiliates where id = v_af.id and status = 'active' for update;
      if not found then
        continue;
      end if;

      if exists (select 1 from public.affiliate_withdrawals
                 where affiliate_id = v_af.id and status in ('requested', 'approved')) then
        v_em_aberto := v_em_aberto + 1;
        continue;
      end if;
      if exists (select 1 from public.affiliate_withdrawals
                 where affiliate_id = v_af.id and payout_cycle = v_hoje) then
        continue;
      end if;

      select array_agg(id) into v_ids
      from (
        select id from public.affiliate_commissions
        where affiliate_id = v_af.id and status = 'available'
        for update
      ) travadas;

      select coalesce(sum(commission_amount_cents), 0) into v_total
      from public.affiliate_commissions
      where id = any(coalesce(v_ids, '{}'::uuid[]));

      if v_total <= 0 or v_total < v_cfg.minimum_withdrawal_cents then
        v_abaixo := v_abaixo + 1;
        continue;
      end if;
      if coalesce(trim(v_af.pix_key), '') = '' then
        v_sem_pix := v_sem_pix + 1;
        continue;
      end if;

      insert into public.affiliate_withdrawals (affiliate_id, amount_cents, pix_key, payout_cycle)
      values (v_af.id, v_total, v_af.pix_key, v_hoje)
      returning id into v_saque;

      update public.affiliate_commissions
         set status = 'requested', requested_at = now(), withdrawal_id = v_saque
       where id = any(v_ids) and status = 'available';

      insert into public.affiliate_events (affiliate_id, event_type, metadata)
      values (v_af.id, 'WITHDRAWAL_REQUESTED',
              jsonb_build_object('withdrawal_id', v_saque, 'amount_cents', v_total,
                                 'origin', 'automatic_payout', 'payout_cycle', v_hoje));

      -- Pix trocado há pouco antes do repasse: padrão de conta invadida.
      select max(created_at) into v_troca_pix
      from public.affiliate_events
      where affiliate_id = v_af.id and event_type = 'PIX_KEY_CHANGED';
      if v_troca_pix is not null and v_troca_pix > now() - interval '48 hours' then
        perform public.afiliado_sinal_suspeito(v_af.id, 'withdrawal_soon_after_pix_change',
          jsonb_build_object('withdrawal_id', v_saque, 'pix_changed_at', v_troca_pix,
                             'amount_cents', v_total));
      end if;

      v_criados := v_criados + 1;
      v_valor := v_valor + v_total;
    exception when others then
      v_falhas := v_falhas + 1;
      raise warning '[afiliados] repasse do afiliado % falhou: %', v_af.id, sqlerrm;
    end;
  end loop;

  v_resumo := jsonb_build_object(
    'executado', true, 'data', v_hoje, 'forcado', p_forcar,
    'repasses', v_criados, 'valor_cents', v_valor,
    'abaixo_do_minimo', v_abaixo, 'sem_pix', v_sem_pix,
    'com_repasse_em_aberto', v_em_aberto, 'falhas', v_falhas);

  insert into public.affiliate_events (admin_id, event_type, metadata)
  values (case when p_forcar then auth.uid() end, 'PAYOUT_CYCLE_RUN', v_resumo);

  return v_resumo;
end;
$$;

-- A equipe também pode montar os repasses na hora (se o robô falhar num
-- dia 10, por exemplo). Sem risco de duplicar: um por parceiro por dia.
create or replace function public.afiliado_admin_gerar_repasses()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.afiliado_exigir_admin();
  return public.afiliado_gerar_repasses(true);
end;
$$;

-- O parceiro não pede mais saque: a porta do pedido manual fecha. A função
-- continua existindo só para o servidor, caso um dia volte a ser usada.
revoke execute on function public.afiliado_solicitar_saque(bigint) from public, anon, authenticated;
grant execute on function public.afiliado_solicitar_saque(bigint) to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. O QUE AS TELAS LEEM PASSA A INCLUIR OS DIAS DE REPASSE
-- ─────────────────────────────────────────────────────────────────────────

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
    'programa_ativo', s.program_enabled,
    'dias_de_repasse', to_jsonb(s.payout_days)
  )
  from public.affiliates a
  cross join public.affiliate_settings s
  where a.user_id = auth.uid() and s.id;
$$;

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
    'aprovacao_manual', approval_required,
    'dias_de_repasse', to_jsonb(payout_days)
  )
  from public.affiliate_settings
  where id;
$$;

create or replace function public.afiliado_admin_configuracoes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform public.afiliado_exigir_admin();
  select jsonb_build_object(
    'programa_ativo', s.program_enabled,
    'comissao_bps', s.default_commission_bps,
    'comissao_tipo', s.commission_type,
    'duracao_meses', s.commission_duration_months,
    'dias_para_liberar', s.commission_release_days,
    'saque_minimo_cents', s.minimum_withdrawal_cents,
    'dias_do_link', s.referral_cookie_days,
    'base', s.commission_base,
    'aprovacao_manual', s.approval_required,
    'dias_de_repasse', to_jsonb(s.payout_days),
    'atualizado_em', s.updated_at,
    'atualizado_por', public.afiliado_email_da_conta(s.updated_by)
  ) into v
  from public.affiliate_settings s where s.id;
  return v;
end;
$$;

-- Configurações: ganha os dias de repasse e aceita "link sem prazo".
drop function if exists public.afiliado_atualizar_configuracoes(boolean, integer, integer, integer, bigint, integer, text, boolean);

create or replace function public.afiliado_atualizar_configuracoes(
  p_programa_ativo boolean,
  p_comissao_bps integer,
  p_duracao_meses integer,
  p_dias_para_liberar integer,
  p_saque_minimo_cents bigint,
  p_dias_do_link integer,
  p_base text,
  p_aprovacao_manual boolean,
  p_dias_de_repasse smallint[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes public.affiliate_settings;
  v_mudou jsonb := '{}'::jsonb;
  v_dias smallint[];
begin
  perform public.afiliado_exigir_admin();

  if p_programa_ativo is null or p_aprovacao_manual is null then
    raise exception 'Preencha todas as opções.';
  end if;
  if p_comissao_bps is null or p_comissao_bps < 0 or p_comissao_bps > 10000 then
    raise exception 'Comissão padrão fora do intervalo (0%% a 100%%).';
  end if;
  if p_duracao_meses is not null and (p_duracao_meses < 1 or p_duracao_meses > 120) then
    raise exception 'Duração deve ser de 1 a 120 meses, ou sem limite.';
  end if;
  if p_dias_para_liberar is null or p_dias_para_liberar < 0 or p_dias_para_liberar > 365 then
    raise exception 'Dias para liberar: de 0 a 365.';
  end if;
  if p_saque_minimo_cents is null or p_saque_minimo_cents < 0 or p_saque_minimo_cents > 10000000 then
    raise exception 'Saque mínimo: de R$ 0,00 a R$ 100.000,00.';
  end if;
  if p_dias_do_link is not null and (p_dias_do_link < 1 or p_dias_do_link > 365) then
    raise exception 'Janela do link: de 1 a 365 dias, ou sem prazo.';
  end if;
  if p_base not in ('cents_usage', 'recurring', 'invoice_total') then
    raise exception 'Base de comissão inválida.';
  end if;
  select array_agg(distinct d order by d) into v_dias from unnest(p_dias_de_repasse) d;
  if v_dias is null or cardinality(v_dias) < 1 or cardinality(v_dias) > 4
     or exists (select 1 from unnest(v_dias) d where d < 1 or d > 28) then
    raise exception 'Dias de repasse: de 1 a 4 dias, cada um entre 1 e 28.';
  end if;

  select * into v_antes from public.affiliate_settings where id for update;

  if v_antes.program_enabled is distinct from p_programa_ativo then
    v_mudou := v_mudou || jsonb_build_object('program_enabled', jsonb_build_object('old', v_antes.program_enabled, 'new', p_programa_ativo));
  end if;
  if v_antes.default_commission_bps is distinct from p_comissao_bps then
    v_mudou := v_mudou || jsonb_build_object('default_commission_bps', jsonb_build_object('old', v_antes.default_commission_bps, 'new', p_comissao_bps));
  end if;
  if v_antes.commission_duration_months is distinct from p_duracao_meses then
    v_mudou := v_mudou || jsonb_build_object('commission_duration_months', jsonb_build_object('old', v_antes.commission_duration_months, 'new', p_duracao_meses));
  end if;
  if v_antes.commission_release_days is distinct from p_dias_para_liberar then
    v_mudou := v_mudou || jsonb_build_object('commission_release_days', jsonb_build_object('old', v_antes.commission_release_days, 'new', p_dias_para_liberar));
  end if;
  if v_antes.minimum_withdrawal_cents is distinct from p_saque_minimo_cents then
    v_mudou := v_mudou || jsonb_build_object('minimum_withdrawal_cents', jsonb_build_object('old', v_antes.minimum_withdrawal_cents, 'new', p_saque_minimo_cents));
  end if;
  if v_antes.referral_cookie_days is distinct from p_dias_do_link then
    v_mudou := v_mudou || jsonb_build_object('referral_cookie_days', jsonb_build_object('old', v_antes.referral_cookie_days, 'new', p_dias_do_link));
  end if;
  if v_antes.commission_base is distinct from p_base then
    v_mudou := v_mudou || jsonb_build_object('commission_base', jsonb_build_object('old', v_antes.commission_base, 'new', p_base));
  end if;
  if v_antes.approval_required is distinct from p_aprovacao_manual then
    v_mudou := v_mudou || jsonb_build_object('approval_required', jsonb_build_object('old', v_antes.approval_required, 'new', p_aprovacao_manual));
  end if;
  if v_antes.payout_days is distinct from v_dias then
    v_mudou := v_mudou || jsonb_build_object('payout_days', jsonb_build_object('old', to_jsonb(v_antes.payout_days), 'new', to_jsonb(v_dias)));
  end if;

  if v_mudou = '{}'::jsonb then
    raise exception 'Nada mudou.';
  end if;

  update public.affiliate_settings
     set program_enabled = p_programa_ativo,
         default_commission_bps = p_comissao_bps,
         commission_duration_months = p_duracao_meses,
         commission_release_days = p_dias_para_liberar,
         minimum_withdrawal_cents = p_saque_minimo_cents,
         referral_cookie_days = p_dias_do_link,
         commission_base = p_base,
         approval_required = p_aprovacao_manual,
         payout_days = v_dias,
         updated_by = auth.uid()
   where id;

  insert into public.affiliate_events (admin_id, event_type, metadata)
  values (auth.uid(), 'SETTINGS_CHANGED', jsonb_build_object('changes', v_mudou));
end;
$$;

-- Visão Geral da equipe: ganha "parceiros com saldo para receber e sem
-- Pix" — são os que o repasse vai deixar de fora até cadastrarem a chave.
create or replace function public.afiliado_admin_resumo()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_minimo bigint;
begin
  perform public.afiliado_exigir_admin();
  select minimum_withdrawal_cents into v_minimo from public.affiliate_settings where id;
  select jsonb_build_object(
    'afiliados_ativos', (select count(*) from public.affiliates where status = 'active'),
    'afiliados_pendentes', (select count(*) from public.affiliates where status = 'pending'),
    'afiliados_suspensos', (select count(*) from public.affiliates where status = 'suspended'),
    'afiliados_bloqueados', (select count(*) from public.affiliates where status = 'blocked'),
    'clientes_indicados', (select count(*) from public.affiliate_referrals),
    'clientes_ativos', (
      select count(*) from public.affiliate_referrals r
      left join public.pizzerias p on p.id = r.establishment_id
      where public.afiliado_situacao_da_loja(r.status, p.status, p.is_active, p.subscription_status) = 'ATIVO'),
    'receita_gerada_cents', (
      select coalesce(sum(c.eligible_amount_cents), 0) from public.affiliate_commissions c
      where c.kind = 'commission' and c.status not in ('reversed', 'cancelled')
        and not exists (select 1 from public.affiliate_commissions a where a.reverses_commission_id = c.id)),
    'comissoes_pendentes_cents', (
      select coalesce(sum(commission_amount_cents), 0) from public.affiliate_commissions where status = 'pending'),
    'comissoes_disponiveis_cents', (
      select coalesce(sum(commission_amount_cents), 0) from public.affiliate_commissions where status = 'available'),
    'comissoes_solicitadas_cents', (
      select coalesce(sum(commission_amount_cents), 0) from public.affiliate_commissions where status = 'requested'),
    'comissoes_pagas_cents', (
      select coalesce(sum(commission_amount_cents), 0) from public.affiliate_commissions where status = 'paid'),
    'saques_em_analise', (select count(*) from public.affiliate_withdrawals where status = 'requested'),
    'saques_em_analise_cents', (
      select coalesce(sum(amount_cents), 0) from public.affiliate_withdrawals where status = 'requested'),
    'saques_a_pagar', (select count(*) from public.affiliate_withdrawals where status = 'approved'),
    'saques_a_pagar_cents', (
      select coalesce(sum(amount_cents), 0) from public.affiliate_withdrawals where status = 'approved'),
    'alertas_30_dias', (
      select count(*) from public.affiliate_events
      where event_type = 'SUSPICIOUS_ACTIVITY' and created_at > now() - interval '30 days'),
    'com_saldo_sem_pix', (
      select count(*) from public.affiliates a
      where a.status = 'active' and coalesce(trim(a.pix_key), '') = ''
        and (select coalesce(sum(c.commission_amount_cents), 0) from public.affiliate_commissions c
             where c.affiliate_id = a.id and c.status in ('pending', 'available')) >= v_minimo),
    'dias_de_repasse', (select to_jsonb(payout_days) from public.affiliate_settings where id)
  ) into v;
  return v;
end;
$$;

-- Central de saques: ganha o telefone do parceiro (a equipe entra em
-- contato para pagar) e o dia do repasse que gerou cada saque.
create or replace function public.afiliado_admin_saques(
  p_status text default null, p_affiliate_id uuid default null,
  p_pagina integer default 1, p_por_pagina integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_por integer := least(greatest(coalesce(p_por_pagina, 20), 1), 100);
  v_pag integer := greatest(coalesce(p_pagina, 1), 1);
  v_status text := nullif(trim(coalesce(p_status, '')), '');
  v_total integer;
  v_itens jsonb;
begin
  perform public.afiliado_exigir_admin();
  if v_status is not null and v_status not in ('requested', 'approved', 'paid', 'rejected', 'open') then
    raise exception 'situacao_invalida';
  end if;
  with filtrada as (
    select w.* from public.affiliate_withdrawals w
    where (p_affiliate_id is null or w.affiliate_id = p_affiliate_id)
      and (v_status is null
           or (v_status = 'open' and w.status in ('requested', 'approved'))
           or w.status = v_status)
  ),
  pagina as (
    select f.*, a.name as afiliado, a.referral_code as codigo, a.status as afiliado_status,
           a.pix_key as pix_atual, a.pix_key_type as pix_tipo, a.phone as telefone,
      (select coalesce(sum(c.commission_amount_cents), 0) from public.affiliate_commissions c
        where c.withdrawal_id = f.id and c.status in ('requested', 'paid')) as elegivel,
      (select count(*) from public.affiliate_events e
        where e.affiliate_id = f.affiliate_id and e.event_type = 'SUSPICIOUS_ACTIVITY'
          and e.metadata->>'withdrawal_id' = f.id::text) as alertas
    from filtrada f
    join public.affiliates a on a.id = f.affiliate_id
    order by case f.status when 'requested' then 0 when 'approved' then 1 else 2 end,
             f.requested_at desc, f.id
    limit v_por offset (v_pag - 1) * v_por
  )
  select (select count(*) from filtrada),
         coalesce((select jsonb_agg(jsonb_build_object(
           'id', id, 'afiliado_id', affiliate_id, 'afiliado', afiliado, 'codigo', codigo,
           'afiliado_status', afiliado_status, 'telefone', telefone, 'ciclo', payout_cycle,
           'valor_cents', amount_cents, 'elegivel_cents', elegivel,
           'pix', pix_key, 'pix_tipo', pix_tipo, 'pix_mudou', pix_atual is distinct from pix_key,
           'situacao', status, 'pedido_em', requested_at,
           'aprovado_em', approved_at, 'aprovado_por', public.afiliado_email_da_conta(approved_by),
           'pago_em', paid_at, 'pago_por', public.afiliado_email_da_conta(paid_by),
           'recusado_em', rejected_at, 'recusado_por', public.afiliado_email_da_conta(rejected_by),
           'referencia', payment_reference, 'notas', admin_notes, 'alertas', alertas
         ) order by case status when 'requested' then 0 when 'approved' then 1 else 2 end,
                    requested_at desc, id) from pagina), '[]'::jsonb)
    into v_total, v_itens;
  return jsonb_build_object('total', v_total, 'pagina', v_pag, 'por_pagina', v_por, 'itens', v_itens);
end;
$$;

-- A lista de afiliados passa a mostrar o celular e quem está SEM chave Pix:
-- sem Pix, o repasse não é montado, e a equipe precisa saber quem avisar.
create or replace function public.afiliado_admin_afiliados(
  p_busca text default null, p_status text default null,
  p_pagina integer default 1, p_por_pagina integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_por integer := least(greatest(coalesce(p_por_pagina, 20), 1), 100);
  v_pag integer := greatest(coalesce(p_pagina, 1), 1);
  v_busca text := public.afiliado_padrao_de_busca(p_busca);
  v_status text := nullif(trim(coalesce(p_status, '')), '');
  v_padrao integer;
  v_total integer;
  v_itens jsonb;
begin
  perform public.afiliado_exigir_admin();
  if v_status is not null and v_status not in ('pending', 'active', 'suspended', 'blocked') then
    raise exception 'situacao_invalida';
  end if;
  select default_commission_bps into v_padrao from public.affiliate_settings where id;

  with filtrados as (
    select a.* from public.affiliates a
    where (v_status is null or a.status = v_status)
      and (v_busca is null or a.name ilike v_busca or a.email ilike v_busca or a.referral_code ilike v_busca)
  ),
  pagina as (
    select f.*,
      (select count(*) from public.affiliate_referrals r where r.affiliate_id = f.id) as indicacoes,
      (select count(*) from public.affiliate_referrals r
         left join public.pizzerias p on p.id = r.establishment_id
        where r.affiliate_id = f.id
          and public.afiliado_situacao_da_loja(r.status, p.status, p.is_active, p.subscription_status) = 'ATIVO') as clientes_ativos,
      (select coalesce(sum(c.eligible_amount_cents), 0) from public.affiliate_commissions c
        where c.affiliate_id = f.id and c.kind = 'commission' and c.status not in ('reversed', 'cancelled')
          and not exists (select 1 from public.affiliate_commissions x where x.reverses_commission_id = c.id)) as receita,
      (select coalesce(sum(c.commission_amount_cents), 0) from public.affiliate_commissions c
        where c.affiliate_id = f.id and c.status = 'available') as disponivel
    from filtrados f
    order by case f.status when 'pending' then 0 else 1 end, f.created_at desc, f.id
    limit v_por offset (v_pag - 1) * v_por
  )
  select (select count(*) from filtrados),
         coalesce((select jsonb_agg(jsonb_build_object(
           'id', id, 'nome', name, 'email', email, 'codigo', referral_code, 'status', status,
           'indicacoes', indicacoes, 'clientes_ativos', clientes_ativos, 'receita_cents', receita,
           'comissao_bps', coalesce(commission_bps, v_padrao), 'comissao_propria', commission_bps is not null,
           'disponivel_cents', disponivel, 'criado_em', created_at,
           'telefone', phone, 'sem_pix', coalesce(trim(pix_key), '') = ''
         ) order by case status when 'pending' then 0 else 1 end, created_at desc, id) from pagina), '[]'::jsonb)
    into v_total, v_itens;

  return jsonb_build_object('total', v_total, 'pagina', v_pag, 'por_pagina', v_por, 'itens', v_itens);
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────
-- 6. QUEM PODE CHAMAR
-- ─────────────────────────────────────────────────────────────────────────

revoke execute on function
  public.afiliado_gerar_repasses(boolean),
  public.afiliado_admin_gerar_repasses(),
  public.afiliado_atualizar_configuracoes(boolean, integer, integer, integer, bigint, integer, text, boolean, smallint[]),
  public.afiliado_registrar_visita(text, text, text),
  public.afiliado_meu_perfil(),
  public.afiliado_regras_publicas(),
  public.afiliado_admin_configuracoes(),
  public.afiliado_admin_resumo(),
  public.afiliado_admin_saques(text, uuid, integer, integer),
  public.afiliado_admin_afiliados(text, text, integer, integer)
from public, anon, authenticated;

-- O robô (e só ele) monta o repasse sozinho.
grant execute on function public.afiliado_gerar_repasses(boolean) to service_role;
grant execute on function public.afiliado_registrar_visita(text, text, text) to service_role;
grant execute on function public.afiliado_regras_publicas() to anon, authenticated, service_role;
grant execute on function
  public.afiliado_admin_gerar_repasses(),
  public.afiliado_atualizar_configuracoes(boolean, integer, integer, integer, bigint, integer, text, boolean, smallint[]),
  public.afiliado_meu_perfil(),
  public.afiliado_admin_configuracoes(),
  public.afiliado_admin_resumo(),
  public.afiliado_admin_saques(text, uuid, integer, integer),
  public.afiliado_admin_afiliados(text, text, integer, integer)
to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. O ROBÔ DO REPASSE
-- ─────────────────────────────────────────────────────────────────────────
--
-- Todo dia às 04:00 de Brasília (07:00 UTC). Nos dias de repasse, monta os
-- repasses; nos outros, só anota que não era dia e não faz nada. Rodar todo
-- dia (e não só em 10 e 20) é o que deixa a equipe mudar os dias pela tela
-- sem mexer no robô.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('afiliados-repasses')
      where exists (select 1 from cron.job where jobname = 'afiliados-repasses');
    perform cron.schedule('afiliados-repasses', '0 7 * * *',
      'select public.afiliado_gerar_repasses(false);');
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 8. OS VALORES DECIDIDOS
-- ─────────────────────────────────────────────────────────────────────────
--
-- Comissão 15%, recorrente sem prazo (enquanto o indicado pagar), saque
-- mínimo R$ 100,00, aprovação manual e base CENTS continuam como estavam.
-- Mudam:
--   - liberação: 0 dia — o que o cliente pagou entra no próximo repasse
--     (10 ou 20), sem esperar 15 dias;
--   - link sem prazo;
--   - repasse nos dias 10 e 20.
-- A mudança fica na auditoria, como qualquer outra.

do $$
declare
  v_antes public.affiliate_settings;
begin
  select * into v_antes from public.affiliate_settings where id for update;
  update public.affiliate_settings
     set default_commission_bps = 1500,
         commission_duration_months = null,
         commission_release_days = 0,
         minimum_withdrawal_cents = 10000,
         referral_cookie_days = null,
         approval_required = true,
         payout_days = '{10,20}'
   where id;
  insert into public.affiliate_events (event_type, metadata)
  values ('SETTINGS_CHANGED', jsonb_build_object(
    'reason', 'Regras definidas pelo dono do programa',
    'changes', jsonb_build_object(
      'commission_release_days', jsonb_build_object('old', v_antes.commission_release_days, 'new', 0),
      'referral_cookie_days', jsonb_build_object('old', v_antes.referral_cookie_days, 'new', null),
      'payout_days', jsonb_build_object('old', null, 'new', to_jsonb('{10,20}'::smallint[])))));
end;
$$;
