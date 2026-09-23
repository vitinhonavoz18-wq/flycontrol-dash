-- ═════════════════════════════════════════════════════════════════════════
-- PROGRAMA DE AFILIADOS — AJUSTES DA AUDITORIA FINAL
-- ═════════════════════════════════════════════════════════════════════════
--
-- Achados da revisão das três partes. Nenhum muda regra de dinheiro; são
-- arrumações de desempenho e de permissão.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. ÍNDICES QUE FALTAVAM
-- ─────────────────────────────────────────────────────────────────────────
--
-- Índice é o sumário do caderno: sem ele, achar "as comissões desta
-- indicação" é folhear o caderno inteiro. Hoje o caderno está vazio e não
-- faz diferença; com milhares de comissões, faria.

-- Soma das comissões de cada indicação (listas do parceiro e do admin).
create index if not exists affiliate_commissions_referral_idx
  on public.affiliate_commissions (referral_id);

-- "Esta comissão já foi estornada?" — conferido em várias contas.
create index if not exists affiliate_commissions_reverses_idx
  on public.affiliate_commissions (reverses_commission_id)
  where reverses_commission_id is not null;

create index if not exists affiliate_referrals_attribution_idx
  on public.affiliate_referrals (attribution_id)
  where attribution_id is not null;

-- A lupa da comissão e os alertas do saque procuram eventos pelo número
-- guardado dentro dos dados do evento.
create index if not exists affiliate_events_commission_idx
  on public.affiliate_events ((metadata->>'commission_id'))
  where metadata ? 'commission_id';

create index if not exists affiliate_events_withdrawal_idx
  on public.affiliate_events ((metadata->>'withdrawal_id'))
  where metadata ? 'withdrawal_id';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. A VISÃO DE SALDOS É SÓ PARA LER
-- ─────────────────────────────────────────────────────────────────────────
--
-- Ela soma comissões; ninguém consegue escrever nela de fato (o banco
-- recusa escrever numa soma). Mesmo assim a permissão de escrita aparecia
-- concedida — tirada, para que a lista de permissões diga a verdade.

revoke insert, update, delete on public.affiliate_balances from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. SAQUE: SÓ AS COMISSÕES QUE FORAM CONTADAS ENTRAM NO SAQUE
-- ─────────────────────────────────────────────────────────────────────────
--
-- O robô de liberação (de hora em hora) pode liberar uma comissão no mesmo
-- instante em que o parceiro pede o saque. Antes, essa comissão recém-
-- liberada podia ser presa ao saque SEM entrar na soma do valor — ninguém
-- recebia errado (a aprovação recusa quando o valor não bate), mas o saque
-- ficava travado à toa.
--
-- Agora o pedido tranca e anota a lista exata das comissões que somou, e
-- só essas vão para o saque. É o caixa que conta as notas, prende com
-- elástico e entrega exatamente aquele maço — e não "o que estiver na
-- gaveta na hora de entregar".

create or replace function public.afiliado_solicitar_saque(p_valor_confirmado_cents bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg public.affiliate_settings;
  v_afiliado public.affiliates;
  v_ids uuid[];
  v_total bigint;
  v_saque uuid;
  v_troca_pix timestamptz;
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

  select array_agg(id) into v_ids
  from (
    select id from public.affiliate_commissions
    where affiliate_id = v_afiliado.id and status = 'available'
    for update
  ) travadas;

  select coalesce(sum(commission_amount_cents), 0) into v_total
  from public.affiliate_commissions
  where id = any(coalesce(v_ids, '{}'::uuid[]));

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
   where id = any(v_ids) and status = 'available';

  insert into public.affiliate_events (affiliate_id, user_id, event_type, metadata)
  values (v_afiliado.id, auth.uid(), 'WITHDRAWAL_REQUESTED',
          jsonb_build_object('withdrawal_id', v_saque, 'amount_cents', v_total));

  select max(created_at) into v_troca_pix
  from public.affiliate_events
  where affiliate_id = v_afiliado.id and event_type = 'PIX_KEY_CHANGED';
  if v_troca_pix is not null and v_troca_pix > now() - interval '48 hours' then
    perform public.afiliado_sinal_suspeito(v_afiliado.id, 'withdrawal_soon_after_pix_change',
      jsonb_build_object('withdrawal_id', v_saque, 'pix_changed_at', v_troca_pix,
                         'amount_cents', v_total));
  end if;

  return v_saque;
end;
$$;

revoke execute on function public.afiliado_solicitar_saque(bigint) from public, anon;
grant execute on function public.afiliado_solicitar_saque(bigint) to authenticated, service_role;
