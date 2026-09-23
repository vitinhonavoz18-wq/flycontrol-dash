-- ═════════════════════════════════════════════════════════════════════════
-- PROGRAMA DE AFILIADOS — PARTE 3: A GESTÃO DA EQUIPE FLYCONTROL
-- ═════════════════════════════════════════════════════════════════════════
--
-- Parte 1: o caixa (comissões, estornos, saques). Parte 2: o balcão do
-- parceiro. Esta parte: o ESCRITÓRIO — o que a equipe FlyControl vê e faz no
-- Painel Admin → Afiliados.
--
-- A REGRA DE OURO DESTE ARQUIVO
--
-- Toda função daqui começa perguntando ao banco "quem está chamando é
-- administrador de verdade?" (`afiliado_exigir_admin`). A tela do painel
-- também esconde o menu de quem não é, mas isso é conforto: a porta que
-- vale é esta. É o cofre que confere a digital, e não o crachá pendurado
-- no pescoço de quem chega.
--
-- E nada aqui APAGA dinheiro. Estorno vira uma linha nova de ajuste;
-- bloqueio de parceiro não some com o histórico; toda ação fica na trilha
-- de auditoria com quem fez, quando, o antes e o depois.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. NOVOS TIPOS DE EVENTO NA TRILHA DE AUDITORIA
-- ─────────────────────────────────────────────────────────────────────────

alter table public.affiliate_events drop constraint if exists affiliate_events_event_type_check;
alter table public.affiliate_events add constraint affiliate_events_event_type_check
  check (event_type in (
    'REFERRAL_CREATED', 'CUSTOMER_CONVERTED', 'COMMISSION_CREATED',
    'COMMISSION_RELEASED', 'COMMISSION_REVERSED', 'WITHDRAWAL_REQUESTED',
    'WITHDRAWAL_APPROVED', 'WITHDRAWAL_PAID', 'WITHDRAWAL_REJECTED',
    'AFFILIATE_BLOCKED', 'AFFILIATE_STATUS_CHANGED', 'COMMISSION_RATE_CHANGED',
    'SETTINGS_CHANGED', 'REFERRAL_REJECTED',
    'AFFILIATE_REGISTERED', 'PROFILE_UPDATED', 'PIX_KEY_CHANGED',
    -- parte 3
    'AFFILIATE_APPROVED', 'AFFILIATE_SUSPENDED', 'AFFILIATE_REACTIVATED',
    'REFERRAL_CANCELLED', 'REFERRAL_RESTORED', 'REFERRAL_ASSIGNED_MANUALLY',
    'COMMISSION_ADJUSTED', 'SUSPICIOUS_ACTIVITY'
  ));

create index if not exists affiliate_events_criado_idx
  on public.affiliate_events (created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. SAQUE: QUEM APROVOU, QUEM PAGOU, E O COMPROVANTE
-- ─────────────────────────────────────────────────────────────────────────
--
-- `decided_by` (parte 1) guardava só a ÚLTIMA pessoa que mexeu. Agora cada
-- etapa tem o seu responsável, e o pagamento guarda a referência do Pix
-- (o código da transação que o banco mostra no comprovante).

alter table public.affiliate_withdrawals
  add column if not exists approved_by uuid,
  add column if not exists paid_by uuid,
  add column if not exists rejected_by uuid,
  add column if not exists payment_reference text
    check (payment_reference is null or length(payment_reference) <= 200);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. A PORTA: SÓ ADMINISTRADOR
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.afiliado_exigir_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.afiliado_eh_admin() then
    raise exception 'somente_admin' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- E-mail de uma conta, para a auditoria mostrar "quem fez" em vez de um
-- número. Só usada por dentro das funções de administrador.
create or replace function public.afiliado_email_da_conta(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select email::text from auth.users where id = p_user_id;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. SITUAÇÃO DO PARCEIRO: APROVAR, SUSPENDER, REATIVAR, BLOQUEAR
-- ─────────────────────────────────────────────────────────────────────────
--
-- Mesma assinatura da parte 1, agora com:
--   - um tipo de evento para cada ação (a auditoria lê "Afiliado aprovado",
--     e não "status mudou");
--   - motivo OBRIGATÓRIO para suspender e bloquear — decisão que corta a
--     renda de alguém precisa ficar explicada;
--   - volta para "em análise" proibida: não há motivo para desaprovar.
--
-- Bloquear NÃO apaga nada: comissões, indicações e saques ficam como estão.
-- Comissão pendente de parceiro que não está ativo simplesmente não libera
-- (o robô da parte 1 só libera para ativos).

create or replace function public.afiliado_definir_status(
  p_affiliate_id uuid, p_status text, p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes text;
  v_evento text;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  perform public.afiliado_exigir_admin();
  if p_status not in ('active', 'suspended', 'blocked') then
    raise exception 'Situação inválida: %', p_status;
  end if;
  if p_status in ('suspended', 'blocked') and (v_motivo is null or length(v_motivo) < 5) then
    raise exception 'Informe o motivo (mínimo de 5 letras) para suspender ou bloquear.';
  end if;

  select status into v_antes from public.affiliates where id = p_affiliate_id for update;
  if not found then
    raise exception 'Afiliado não encontrado.';
  end if;
  if v_antes = p_status then
    raise exception 'O afiliado já está nessa situação.';
  end if;

  v_evento := case
    when p_status = 'blocked' then 'AFFILIATE_BLOCKED'
    when p_status = 'suspended' then 'AFFILIATE_SUSPENDED'
    when v_antes = 'pending' then 'AFFILIATE_APPROVED'
    else 'AFFILIATE_REACTIVATED'
  end;

  update public.affiliates set status = p_status where id = p_affiliate_id;

  insert into public.affiliate_events (affiliate_id, admin_id, event_type, metadata)
  values (p_affiliate_id, auth.uid(), v_evento,
          jsonb_build_object('old_status', v_antes, 'new_status', p_status, 'reason', v_motivo));
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. PORCENTAGEM INDIVIDUAL
-- ─────────────────────────────────────────────────────────────────────────
--
-- Nulo = volta a usar a porcentagem padrão do programa. Cada comissão já
-- criada guarda a porcentagem do dia em que nasceu (parte 1), então mudar
-- aqui NÃO recalcula nada do passado — só vale para as próximas.

create or replace function public.afiliado_definir_taxa(p_affiliate_id uuid, p_bps integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes integer;
  v_padrao integer;
begin
  perform public.afiliado_exigir_admin();
  if p_bps is not null and (p_bps < 0 or p_bps > 10000) then
    raise exception 'Porcentagem fora do intervalo (0%% a 100%%).';
  end if;
  select commission_bps into v_antes from public.affiliates where id = p_affiliate_id for update;
  if not found then
    raise exception 'Afiliado não encontrado.';
  end if;
  if v_antes is not distinct from p_bps then
    raise exception 'A porcentagem já é essa.';
  end if;
  select default_commission_bps into v_padrao from public.affiliate_settings where id;

  update public.affiliates set commission_bps = p_bps where id = p_affiliate_id;
  insert into public.affiliate_events (affiliate_id, admin_id, event_type, metadata)
  values (p_affiliate_id, auth.uid(), 'COMMISSION_RATE_CHANGED',
          jsonb_build_object(
            'old_bps', v_antes, 'new_bps', p_bps,
            'old_effective_bps', coalesce(v_antes, v_padrao),
            'new_effective_bps', coalesce(p_bps, v_padrao)));
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. DECIDIR SAQUE — APROVAR, RECUSAR, MARCAR COMO PAGO
-- ─────────────────────────────────────────────────────────────────────────
--
-- CONTRA O PAGAMENTO EM DOBRO
--
-- A linha do saque é trancada (`for update`) antes de qualquer conferência.
-- Dois administradores clicando "pago" ao mesmo tempo: o segundo espera o
-- primeiro terminar, e aí encontra o saque já "pago" e é recusado. Só um
-- saque "aprovado" pode virar "pago", e "pago" não volta a lugar nenhum.
--
-- É a comanda que, depois de carimbada "PAGO" no caixa, não passa de novo
-- na maquininha — nem se dois atendentes pegarem ao mesmo tempo.

drop function if exists public.afiliado_decidir_saque(uuid, text, text);

create or replace function public.afiliado_decidir_saque(
  p_withdrawal_id uuid, p_decisao text, p_notas text default null, p_referencia text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.affiliate_withdrawals;
  v_notas text := nullif(trim(coalesce(p_notas, '')), '');
  v_ref text := nullif(trim(coalesce(p_referencia, '')), '');
  v_ligadas bigint;
begin
  perform public.afiliado_exigir_admin();

  select * into v_s from public.affiliate_withdrawals where id = p_withdrawal_id for update;
  if not found then
    raise exception 'Saque não encontrado.';
  end if;

  -- O dinheiro que o saque leva tem de ser o das comissões presas a ele.
  -- Se não bater, alguém mexeu por fora — melhor parar e investigar.
  select coalesce(sum(commission_amount_cents), 0) into v_ligadas
  from public.affiliate_commissions
  where withdrawal_id = v_s.id and status in ('requested', 'paid');

  if p_decisao = 'approve' then
    if v_s.status <> 'requested' then
      raise exception 'Só um saque em análise pode ser aprovado (este está %).', v_s.status;
    end if;
    if v_ligadas <> v_s.amount_cents then
      raise exception 'O valor do saque (%) não bate com as comissões ligadas a ele (%). Investigue antes de aprovar.',
        public.afiliado_reais(v_s.amount_cents), public.afiliado_reais(v_ligadas);
    end if;
    update public.affiliate_withdrawals
       set status = 'approved', approved_at = now(), approved_by = auth.uid(), decided_by = auth.uid(),
           admin_notes = coalesce(v_notas, admin_notes)
     where id = v_s.id;
    insert into public.affiliate_events (affiliate_id, admin_id, event_type, metadata)
    values (v_s.affiliate_id, auth.uid(), 'WITHDRAWAL_APPROVED',
            jsonb_build_object('withdrawal_id', v_s.id, 'amount_cents', v_s.amount_cents, 'notes', v_notas));

  elsif p_decisao = 'pay' then
    if v_s.status <> 'approved' then
      raise exception 'Só um saque aprovado pode ser marcado como pago (este está %).', v_s.status;
    end if;
    if v_ligadas <> v_s.amount_cents then
      raise exception 'O valor do saque (%) não bate com as comissões ligadas a ele (%). Investigue antes de pagar.',
        public.afiliado_reais(v_s.amount_cents), public.afiliado_reais(v_ligadas);
    end if;
    update public.affiliate_withdrawals
       set status = 'paid', paid_at = now(), paid_by = auth.uid(), decided_by = auth.uid(),
           payment_reference = v_ref,
           admin_notes = coalesce(v_notas, admin_notes)
     where id = v_s.id;
    update public.affiliate_commissions
       set status = 'paid', paid_at = now()
     where withdrawal_id = v_s.id and status = 'requested';
    insert into public.affiliate_events (affiliate_id, admin_id, event_type, metadata)
    values (v_s.affiliate_id, auth.uid(), 'WITHDRAWAL_PAID',
            jsonb_build_object('withdrawal_id', v_s.id, 'amount_cents', v_s.amount_cents,
                               'pix_key_end', right(v_s.pix_key, 4), 'payment_reference', v_ref));

  elsif p_decisao = 'reject' then
    if v_s.status not in ('requested', 'approved') then
      raise exception 'Este saque não pode mais ser recusado (está %).', v_s.status;
    end if;
    if v_notas is null or length(v_notas) < 5 then
      raise exception 'Informe o motivo da recusa (o parceiro vai ler).';
    end if;
    update public.affiliate_withdrawals
       set status = 'rejected', rejected_at = now(), rejected_by = auth.uid(), decided_by = auth.uid(),
           admin_notes = v_notas
     where id = v_s.id;
    -- O dinheiro volta a ficar disponível para o parceiro.
    update public.affiliate_commissions
       set status = 'available', requested_at = null, withdrawal_id = null
     where withdrawal_id = v_s.id and status = 'requested';
    insert into public.affiliate_events (affiliate_id, admin_id, event_type, metadata)
    values (v_s.affiliate_id, auth.uid(), 'WITHDRAWAL_REJECTED',
            jsonb_build_object('withdrawal_id', v_s.id, 'amount_cents', v_s.amount_cents, 'notes', v_notas));
  else
    raise exception 'Decisão desconhecida: %', p_decisao;
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. CONFIGURAÇÕES DO PROGRAMA
-- ─────────────────────────────────────────────────────────────────────────
--
-- Cada campo é conferido, e a auditoria guarda só o que mudou, com o antes
-- e o depois. Mudança de regra NUNCA mexe no que já aconteceu: comissão
-- criada mantém a porcentagem e o prazo com que nasceu.

create or replace function public.afiliado_atualizar_configuracoes(
  p_programa_ativo boolean,
  p_comissao_bps integer,
  p_duracao_meses integer,
  p_dias_para_liberar integer,
  p_saque_minimo_cents bigint,
  p_dias_do_link integer,
  p_base text,
  p_aprovacao_manual boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes public.affiliate_settings;
  v_mudou jsonb := '{}'::jsonb;
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
  if p_dias_do_link is null or p_dias_do_link < 1 or p_dias_do_link > 365 then
    raise exception 'Janela do link: de 1 a 365 dias.';
  end if;
  if p_base not in ('cents_usage', 'recurring', 'invoice_total') then
    raise exception 'Base de comissão inválida.';
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
         updated_by = auth.uid()
   where id;

  insert into public.affiliate_events (admin_id, event_type, metadata)
  values (auth.uid(), 'SETTINGS_CHANGED', jsonb_build_object('changes', v_mudou));
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 8. INDICAÇÃO: AS DUAS ÚNICAS OPERAÇÕES MANUAIS
-- ─────────────────────────────────────────────────────────────────────────
--
-- Trocar o afiliado de uma loja continua IMPOSSÍVEL (a trava da parte 1
-- segue valendo, inclusive para a equipe). O que existe:
--
--   a) CANCELAR / RESTAURAR a indicação — enquanto cancelada, as faturas
--      novas da loja não geram comissão. O que já foi gerado fica como está.
--   b) ATRIBUIR À MÃO uma loja que NÃO TEM afiliado nenhum — para o caso do
--      cliente que veio pelo parceiro mas se cadastrou sem o link. Só vale
--      para faturas pagas dali em diante; nada retroativo.
--
-- As duas exigem motivo e ficam na auditoria com o nome de quem fez.

create or replace function public.afiliado_admin_situacao_indicacao(
  p_referral_id uuid, p_ativa boolean, p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.affiliate_referrals;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_novo text := case when p_ativa then 'active' else 'cancelled' end;
begin
  perform public.afiliado_exigir_admin();
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'Informe o motivo (mínimo de 5 letras).';
  end if;
  select * into v_r from public.affiliate_referrals where id = p_referral_id for update;
  if not found then
    raise exception 'Indicação não encontrada.';
  end if;
  if v_r.status = v_novo then
    raise exception 'A indicação já está nessa situação.';
  end if;
  update public.affiliate_referrals set status = v_novo where id = v_r.id;
  insert into public.affiliate_events (affiliate_id, admin_id, event_type, metadata)
  values (v_r.affiliate_id, auth.uid(),
          case when p_ativa then 'REFERRAL_RESTORED' else 'REFERRAL_CANCELLED' end,
          jsonb_build_object('referral_id', v_r.id, 'establishment_id', v_r.establishment_id,
                             'reason', v_motivo));
end;
$$;

create or replace function public.afiliado_admin_atribuir_indicacao(
  p_establishment_id uuid, p_affiliate_id uuid, p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_af public.affiliates;
  v_loja record;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_id uuid;
begin
  perform public.afiliado_exigir_admin();
  if v_motivo is null or length(v_motivo) < 10 then
    raise exception 'Explique o motivo da atribuição manual (mínimo de 10 letras).';
  end if;
  select * into v_af from public.affiliates where id = p_affiliate_id;
  if not found then
    raise exception 'Afiliado não encontrado.';
  end if;
  if v_af.status <> 'active' then
    raise exception 'Só é possível atribuir a um afiliado ativo.';
  end if;
  select p.id, p.owner_id, u.email::text as email
    into v_loja
  from public.pizzerias p left join auth.users u on u.id = p.owner_id
  where p.id = p_establishment_id;
  if not found then
    raise exception 'Estabelecimento não encontrado.';
  end if;
  if v_loja.owner_id = v_af.user_id
     or lower(trim(coalesce(v_loja.email, ''))) = lower(trim(v_af.email)) then
    raise exception 'O dono desta loja é o próprio afiliado: autoindicação não é permitida.';
  end if;
  if exists (select 1 from public.affiliate_referrals where establishment_id = p_establishment_id) then
    raise exception 'Esta loja já tem afiliado. Trocar o afiliado de uma loja não é permitido.';
  end if;

  insert into public.affiliate_referrals (
    affiliate_id, customer_user_id, establishment_id, referral_code, referred_at, converted_at
  ) values (
    v_af.id, v_loja.owner_id, p_establishment_id, v_af.referral_code, now(), now()
  )
  returning id into v_id;

  insert into public.affiliate_events (affiliate_id, admin_id, event_type, metadata)
  values (v_af.id, auth.uid(), 'REFERRAL_ASSIGNED_MANUALLY',
          jsonb_build_object('referral_id', v_id, 'establishment_id', p_establishment_id,
                             'reason', v_motivo));
  return v_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 9. ESTORNO MANUAL DE UMA COMISSÃO
-- ─────────────────────────────────────────────────────────────────────────
--
-- Nada de "apagar". A comissão vai pelo mesmo caminho de um estorno de
-- pagamento (parte 1): se ainda não foi sacada, vira "estornada"; se já foi,
-- nasce um ajuste negativo que desconta das próximas. E fica registrado que
-- foi a equipe, quem e por quê.

create or replace function public.afiliado_admin_estornar_comissao(p_commission_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.affiliate_commissions;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  perform public.afiliado_exigir_admin();
  if v_motivo is null or length(v_motivo) < 10 then
    raise exception 'Explique o motivo do estorno (mínimo de 10 letras).';
  end if;
  select * into v_c from public.affiliate_commissions where id = p_commission_id for update;
  if not found or v_c.kind <> 'commission' then
    raise exception 'Comissão não encontrada.';
  end if;
  if v_c.status in ('reversed', 'cancelled')
     or exists (select 1 from public.affiliate_commissions where reverses_commission_id = v_c.id) then
    raise exception 'Esta comissão já foi estornada.';
  end if;

  perform public.afiliado_reverter_comissao_da_fatura(v_c.invoice_id, 'admin: ' || v_motivo);

  insert into public.affiliate_events (affiliate_id, admin_id, event_type, metadata)
  values (v_c.affiliate_id, auth.uid(), 'COMMISSION_ADJUSTED',
          jsonb_build_object('commission_id', v_c.id, 'invoice_id', v_c.invoice_id,
                             'previous_status', v_c.status,
                             'commission_amount_cents', v_c.commission_amount_cents,
                             'reason', v_motivo));
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 10. ALERTAS DE FRAUDE (SEM BLOQUEAR NINGUÉM)
-- ─────────────────────────────────────────────────────────────────────────
--
-- As travas duras continuam onde já estavam (autoindicação por login e
-- e-mail, uma loja por afiliado, uma comissão por fatura, um saque aberto
-- por vez, saldo recalculado no banco). Aqui entram os SINAIS — coisas que
-- podem ser inocentes, mas merecem um olhar da equipe. Nada é recusado por
-- causa deles; só vira um aviso "Atividade suspeita" na auditoria.
--
--   a) a loja indicada tem o MESMO CELULAR do afiliado → provável
--      autoindicação com outro e-mail;
--   b) 3 ou mais lojas convertidas pelo MESMO APARELHO/REDE em 24 horas →
--      alguém criando várias contas para gerar indicação;
--   c) pedido de saque até 48 horas depois de TROCAR A CHAVE PIX → padrão
--      de conta invadida (troca o Pix e saca).

create or replace function public.afiliado_sinal_suspeito(
  p_affiliate_id uuid, p_regra text, p_detalhes jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.affiliate_events (affiliate_id, event_type, metadata)
  values (p_affiliate_id, 'SUSPICIOUS_ACTIVITY',
          jsonb_build_object('rule', p_regra) || coalesce(p_detalhes, '{}'::jsonb));
$$;

-- A conversão da parte 1, agora com os sinais (a) e (b) depois do sucesso.
-- Todo o resto é idêntico.
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
  v_tel_loja text;
  v_mesmo_aparelho integer;
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

  -- Sinal (a): mesmo celular.
  select nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '') into v_tel_loja
  from public.pizzerias where id = p_establishment_id;
  if v_tel_loja is not null and v_afiliado.phone is not null
     and right(v_tel_loja, 10) = right(v_afiliado.phone, 10) then
    perform public.afiliado_sinal_suspeito(v_afiliado.id, 'same_phone_as_affiliate',
      jsonb_build_object('referral_id', v_indicacao, 'establishment_id', p_establishment_id));
  end if;

  -- Sinal (b): muitas lojas pelo mesmo aparelho/rede em 24 horas.
  if v_at.ip_hash is not null then
    select count(*) into v_mesmo_aparelho
    from public.affiliate_attributions
    where affiliate_id = v_afiliado.id
      and ip_hash = v_at.ip_hash
      and converted_at > now() - interval '24 hours';
    if v_mesmo_aparelho >= 3 then
      perform public.afiliado_sinal_suspeito(v_afiliado.id, 'many_conversions_same_device',
        jsonb_build_object('referral_id', v_indicacao, 'conversions_24h', v_mesmo_aparelho));
    end if;
  end if;

  return 'ok';
end;
$$;

-- O pedido de saque da parte 2, agora com o sinal (c). Todo o resto é
-- idêntico.
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

  -- Sinal (c): Pix trocado há pouco.
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

-- ─────────────────────────────────────────────────────────────────────────
-- 11. O QUE O PAINEL ADMIN LÊ
-- ─────────────────────────────────────────────────────────────────────────

-- Os números da Visão Geral.
create or replace function public.afiliado_admin_resumo()
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
      where event_type = 'SUSPICIOUS_ACTIVITY' and created_at > now() - interval '30 days')
  ) into v;
  return v;
end;
$$;

-- Os quatro gráficos da Visão Geral, no mesmo recorte de tempo.
create or replace function public.afiliado_admin_serie(p_dias integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_passo text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio date;
  v_pontos jsonb;
begin
  perform public.afiliado_exigir_admin();
  if p_dias not in (7, 30, 90, 180, 365) then
    raise exception 'periodo_invalido';
  end if;
  v_passo := case when p_dias <= 30 then 'day' when p_dias = 90 then 'week' else 'month' end;
  v_inicio := date_trunc(v_passo, (v_hoje - (p_dias - 1))::timestamp)::date;

  with baldes as (
    select g::date as inicio
    from generate_series(v_inicio::timestamp, v_hoje::timestamp, ('1 ' || v_passo)::interval) g
  ),
  comissoes as (
    select date_trunc(v_passo, (c.created_at at time zone 'America/Sao_Paulo'))::date as inicio,
           sum(c.eligible_amount_cents) filter (where c.kind = 'commission') as receita,
           sum(c.commission_amount_cents) as comissao
    from public.affiliate_commissions c
    where c.status not in ('reversed', 'cancelled')
      and (c.created_at at time zone 'America/Sao_Paulo')::date >= v_inicio
    group by 1
  ),
  afiliados as (
    select date_trunc(v_passo, (a.created_at at time zone 'America/Sao_Paulo'))::date as inicio, count(*) as qtd
    from public.affiliates a
    where (a.created_at at time zone 'America/Sao_Paulo')::date >= v_inicio
    group by 1
  ),
  indicacoes as (
    select date_trunc(v_passo, (r.converted_at at time zone 'America/Sao_Paulo'))::date as inicio, count(*) as qtd
    from public.affiliate_referrals r
    where (r.converted_at at time zone 'America/Sao_Paulo')::date >= v_inicio
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'inicio', b.inicio,
           'receita_cents', coalesce(c.receita, 0),
           'comissoes_cents', coalesce(c.comissao, 0),
           'novos_afiliados', coalesce(a.qtd, 0),
           'novas_indicacoes', coalesce(i.qtd, 0)
         ) order by b.inicio), '[]'::jsonb)
    into v_pontos
  from baldes b
  left join comissoes c on c.inicio = b.inicio
  left join afiliados a on a.inicio = b.inicio
  left join indicacoes i on i.inicio = b.inicio;

  return jsonb_build_object('passo', v_passo, 'pontos', v_pontos);
end;
$$;

-- Texto de busca → padrão do ILIKE, com % e _ valendo como letra.
create or replace function public.afiliado_padrao_de_busca(p_busca text)
returns text
language sql
immutable
set search_path = public
as $$
  select case when nullif(trim(coalesce(p_busca, '')), '') is null then null
    else '%' || replace(replace(replace(left(trim(p_busca), 80), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;
$$;

-- A lista de afiliados, com os números de cada um.
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
           'disponivel_cents', disponivel, 'criado_em', created_at
         ) order by case status when 'pending' then 0 else 1 end, created_at desc, id) from pagina), '[]'::jsonb)
    into v_total, v_itens;

  return jsonb_build_object('total', v_total, 'pagina', v_pag, 'por_pagina', v_por, 'itens', v_itens);
end;
$$;

-- A ficha de um afiliado. A chave Pix sai COMPLETA aqui: é a equipe quem
-- faz a transferência.
create or replace function public.afiliado_admin_afiliado(p_affiliate_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_a public.affiliates;
  v_padrao integer;
  v jsonb;
begin
  perform public.afiliado_exigir_admin();
  select * into v_a from public.affiliates where id = p_affiliate_id;
  if not found then
    return null;
  end if;
  select default_commission_bps into v_padrao from public.affiliate_settings where id;

  select jsonb_build_object(
    'id', v_a.id, 'nome', v_a.name, 'email', v_a.email, 'telefone', v_a.phone,
    'documento', v_a.document, 'pix_tipo', v_a.pix_key_type, 'pix_chave', v_a.pix_key,
    'codigo', v_a.referral_code, 'status', v_a.status, 'criado_em', v_a.created_at,
    'termos_versao', v_a.terms_version, 'termos_aceitos_em', v_a.terms_accepted_at,
    'comissao_bps', coalesce(v_a.commission_bps, v_padrao),
    'comissao_propria_bps', v_a.commission_bps,
    'comissao_padrao_bps', v_padrao,
    'indicacoes', (select count(*) from public.affiliate_referrals where affiliate_id = v_a.id),
    'clientes_ativos', (
      select count(*) from public.affiliate_referrals r left join public.pizzerias p on p.id = r.establishment_id
      where r.affiliate_id = v_a.id
        and public.afiliado_situacao_da_loja(r.status, p.status, p.is_active, p.subscription_status) = 'ATIVO'),
    'cliques', (select count(*) from public.affiliate_attributions where affiliate_id = v_a.id),
    'receita_cents', (
      select coalesce(sum(c.eligible_amount_cents), 0) from public.affiliate_commissions c
      where c.affiliate_id = v_a.id and c.kind = 'commission' and c.status not in ('reversed', 'cancelled')
        and not exists (select 1 from public.affiliate_commissions x where x.reverses_commission_id = c.id)),
    'acumulado_cents', (
      select coalesce(sum(commission_amount_cents), 0) from public.affiliate_commissions
      where affiliate_id = v_a.id and status in ('pending', 'available', 'requested', 'paid')),
    'pendente_cents', (
      select coalesce(sum(commission_amount_cents), 0) from public.affiliate_commissions
      where affiliate_id = v_a.id and status = 'pending'),
    'disponivel_cents', (
      select coalesce(sum(commission_amount_cents), 0) from public.affiliate_commissions
      where affiliate_id = v_a.id and status = 'available'),
    'solicitado_cents', (
      select coalesce(sum(commission_amount_cents), 0) from public.affiliate_commissions
      where affiliate_id = v_a.id and status = 'requested'),
    'pago_cents', (
      select coalesce(sum(commission_amount_cents), 0) from public.affiliate_commissions
      where affiliate_id = v_a.id and status = 'paid'),
    'alertas', (
      select count(*) from public.affiliate_events
      where affiliate_id = v_a.id and event_type = 'SUSPICIOUS_ACTIVITY')
  ) into v;
  return v;
end;
$$;

-- Todas as indicações, com o afiliado de cada uma.
create or replace function public.afiliado_admin_indicacoes(
  p_busca text default null, p_situacao text default null, p_affiliate_id uuid default null,
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
  v_situacao text := nullif(upper(trim(coalesce(p_situacao, ''))), '');
  v_total integer;
  v_itens jsonb;
begin
  perform public.afiliado_exigir_admin();
  if v_situacao is not null and v_situacao not in ('CADASTRADO', 'ATIVO', 'INADIMPLENTE', 'CANCELADO') then
    raise exception 'situacao_invalida';
  end if;

  with base as (
    select r.id, r.affiliate_id, r.establishment_id, r.referral_code, r.converted_at, r.status,
           r.attribution_id is null as manual,
           a.name as afiliado, a.referral_code as codigo_do_afiliado,
           coalesce(p.name, 'Loja removida') as loja,
           public.afiliado_situacao_da_loja(r.status, p.status, p.is_active, p.subscription_status) as situacao
    from public.affiliate_referrals r
    join public.affiliates a on a.id = r.affiliate_id
    left join public.pizzerias p on p.id = r.establishment_id
    where (p_affiliate_id is null or r.affiliate_id = p_affiliate_id)
  ),
  filtrada as (
    select * from base
    where (v_busca is null or loja ilike v_busca or afiliado ilike v_busca or referral_code ilike v_busca)
      and (v_situacao is null or situacao = v_situacao)
  ),
  pagina as (
    select f.*,
      coalesce((select sum(c.eligible_amount_cents) from public.affiliate_commissions c
                where c.referral_id = f.id and c.kind = 'commission'
                  and c.status not in ('reversed', 'cancelled')), 0) as receita,
      coalesce((select sum(c.commission_amount_cents) from public.affiliate_commissions c
                where c.referral_id = f.id and c.status not in ('reversed', 'cancelled')), 0) as comissao
    from filtrada f
    order by f.converted_at desc, f.id
    limit v_por offset (v_pag - 1) * v_por
  )
  select (select count(*) from filtrada),
         coalesce((select jsonb_agg(jsonb_build_object(
           'id', id, 'afiliado_id', affiliate_id, 'afiliado', afiliado, 'loja_id', establishment_id,
           'loja', loja, 'codigo', referral_code, 'data', converted_at, 'situacao', situacao,
           'indicacao_ativa', status = 'active', 'manual', manual,
           'receita_cents', receita, 'comissao_cents', comissao
         ) order by converted_at desc, id) from pagina), '[]'::jsonb)
    into v_total, v_itens;

  return jsonb_build_object('total', v_total, 'pagina', v_pag, 'por_pagina', v_por, 'itens', v_itens);
end;
$$;

-- Lojas SEM afiliado, para a atribuição manual. Só nome e cidade.
create or replace function public.afiliado_admin_lojas_sem_afiliado(p_busca text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_busca text := public.afiliado_padrao_de_busca(p_busca);
begin
  perform public.afiliado_exigir_admin();
  if v_busca is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'nome', name, 'criado_em', created_at) order by name)
    from (
      select p.id, p.name, p.created_at from public.pizzerias p
      where p.name ilike v_busca
        and coalesce(p.status, 'active') not in ('deleted')
        and not exists (select 1 from public.affiliate_referrals r where r.establishment_id = p.id)
      order by p.name limit 20
    ) x), '[]'::jsonb);
end;
$$;

-- Todas as comissões.
create or replace function public.afiliado_admin_comissoes(
  p_status text default null, p_affiliate_id uuid default null, p_busca text default null,
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
  v_status text := nullif(lower(trim(coalesce(p_status, ''))), '');
  v_total integer;
  v_itens jsonb;
begin
  perform public.afiliado_exigir_admin();
  if v_status is not null and v_status not in ('pending', 'available', 'requested', 'paid', 'reversed') then
    raise exception 'situacao_invalida';
  end if;

  with base as (
    select c.*, a.name as afiliado, coalesce(p.name, 'Loja removida') as loja, i.invoice_number
    from public.affiliate_commissions c
    join public.affiliates a on a.id = c.affiliate_id
    left join public.pizzerias p on p.id = c.establishment_id
    left join public.invoices i on i.id = c.invoice_id
    where (p_affiliate_id is null or c.affiliate_id = p_affiliate_id)
      and (v_status is null
           or (v_status = 'reversed' and c.status in ('reversed', 'cancelled'))
           or (v_status <> 'reversed' and c.status = v_status))
  ),
  filtrada as (
    select * from base
    where v_busca is null or afiliado ilike v_busca or loja ilike v_busca or coalesce(invoice_number, '') ilike v_busca
  ),
  pagina as (
    select * from filtrada order by created_at desc, id
    limit v_por offset (v_pag - 1) * v_por
  )
  select (select count(*) from filtrada),
         coalesce((select jsonb_agg(jsonb_build_object(
           'id', id, 'afiliado_id', affiliate_id, 'afiliado', afiliado, 'loja', loja,
           'fatura_id', invoice_id, 'fatura_numero', invoice_number, 'tipo', kind,
           'bruto_cents', gross_amount_cents, 'elegivel_cents', eligible_amount_cents,
           'bps', commission_bps, 'comissao_cents', commission_amount_cents,
           'situacao', case when status = 'cancelled' then 'reversed' else status end,
           'data', created_at, 'libera_em', available_at
         ) order by created_at desc, id) from pagina), '[]'::jsonb)
    into v_total, v_itens;

  return jsonb_build_object('total', v_total, 'pagina', v_pag, 'por_pagina', v_por, 'itens', v_itens);
end;
$$;

-- A lupa de uma comissão: de onde ela veio, passo a passo.
create or replace function public.afiliado_admin_comissao(p_commission_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.affiliate_commissions;
  v jsonb;
begin
  perform public.afiliado_exigir_admin();
  select * into v_c from public.affiliate_commissions where id = p_commission_id;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'comissao', to_jsonb(v_c),
    'afiliado', (select jsonb_build_object('id', a.id, 'nome', a.name, 'codigo', a.referral_code)
                 from public.affiliates a where a.id = v_c.affiliate_id),
    'loja', (select jsonb_build_object('id', p.id, 'nome', p.name, 'plano', p.plan_type,
                                       'assinatura', p.subscription_status)
             from public.pizzerias p where p.id = v_c.establishment_id),
    'indicacao', (select jsonb_build_object('id', r.id, 'codigo', r.referral_code, 'convertida_em', r.converted_at,
                                            'ativa', r.status = 'active', 'manual', r.attribution_id is null)
                  from public.affiliate_referrals r where r.id = v_c.referral_id),
    'fatura', (select jsonb_build_object(
                 'id', i.id, 'numero', i.invoice_number, 'status', i.status,
                 'subtotal_cents', i.subtotal_cents, 'desconto_cents', i.discount_cents,
                 'total_cents', i.total_cents, 'pago_em', i.paid_at, 'criada_em', i.created_at,
                 'provedor', i.payment_provider,
                 'itens', coalesce((select jsonb_agg(jsonb_build_object(
                             'tipo', it.item_type, 'descricao', it.description, 'quantidade', it.quantity,
                             'total_cents', it.total_amount_cents) order by it.created_at)
                           from public.invoice_items it where it.invoice_id = i.id), '[]'::jsonb))
               from public.invoices i where i.id = v_c.invoice_id),
    'pagamentos', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', t.id, 'provedor', t.provider, 'status', t.status, 'valor_cents', t.amount_cents,
                    'metodo', t.payment_method, 'pago_em', t.paid_at, 'referencia', t.external_transaction_id)
                    order by t.created_at)
                  from public.payment_transactions t where t.invoice_id = v_c.invoice_id), '[]'::jsonb),
    'ajustes', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', x.id, 'valor_cents', x.commission_amount_cents, 'situacao', x.status,
                  'data', x.created_at, 'motivo', x.metadata->>'reason') order by x.created_at)
                from public.affiliate_commissions x where x.reverses_commission_id = v_c.id), '[]'::jsonb),
    'saque', (select jsonb_build_object('id', w.id, 'situacao', w.status, 'valor_cents', w.amount_cents,
                                        'pedido_em', w.requested_at, 'pago_em', w.paid_at)
              from public.affiliate_withdrawals w where w.id = v_c.withdrawal_id),
    'eventos', coalesce((select jsonb_agg(jsonb_build_object(
                  'tipo', e.event_type, 'data', e.created_at,
                  'admin', public.afiliado_email_da_conta(e.admin_id), 'dados', e.metadata)
                  order by e.created_at)
                from public.affiliate_events e
                where e.metadata->>'commission_id' = v_c.id::text), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

-- A central de saques.
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
           a.pix_key as pix_atual, a.pix_key_type as pix_tipo,
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
           'afiliado_status', afiliado_status,
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

-- A trilha de auditoria.
create or replace function public.afiliado_admin_eventos(
  p_tipo text default null, p_affiliate_id uuid default null,
  p_pagina integer default 1, p_por_pagina integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_por integer := least(greatest(coalesce(p_por_pagina, 30), 1), 100);
  v_pag integer := greatest(coalesce(p_pagina, 1), 1);
  v_tipo text := nullif(trim(coalesce(p_tipo, '')), '');
  v_total integer;
  v_itens jsonb;
begin
  perform public.afiliado_exigir_admin();

  select count(*) into v_total from public.affiliate_events e
  where (v_tipo is null or e.event_type = v_tipo)
    and (p_affiliate_id is null or e.affiliate_id = p_affiliate_id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'tipo', x.event_type, 'data', x.created_at,
           'afiliado_id', x.affiliate_id, 'afiliado', x.afiliado, 'codigo', x.codigo,
           'admin', public.afiliado_email_da_conta(x.admin_id),
           'usuario', public.afiliado_email_da_conta(x.user_id),
           'dados', x.metadata
         ) order by x.created_at desc, x.id), '[]'::jsonb)
    into v_itens
  from (
    select e.*, a.name as afiliado, a.referral_code as codigo
    from public.affiliate_events e
    left join public.affiliates a on a.id = e.affiliate_id
    where (v_tipo is null or e.event_type = v_tipo)
      and (p_affiliate_id is null or e.affiliate_id = p_affiliate_id)
    order by e.created_at desc, e.id
    limit v_por offset (v_pag - 1) * v_por
  ) x;

  return jsonb_build_object('total', v_total, 'pagina', v_pag, 'por_pagina', v_por, 'itens', v_itens);
end;
$$;

-- As configurações atuais, para o formulário.
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
    'atualizado_em', s.updated_at,
    'atualizado_por', public.afiliado_email_da_conta(s.updated_by)
  ) into v
  from public.affiliate_settings s where s.id;
  return v;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 12. QUEM PODE CHAMAR
-- ─────────────────────────────────────────────────────────────────────────
--
-- As de administrador ficam abertas a "quem está logado" — e cada uma
-- confere, na primeira linha, se é administrador. As internas ficam só com
-- o servidor.

revoke execute on function
  public.afiliado_exigir_admin(),
  public.afiliado_email_da_conta(uuid),
  public.afiliado_sinal_suspeito(uuid, text, jsonb),
  public.afiliado_padrao_de_busca(text),
  public.afiliado_definir_status(uuid, text, text),
  public.afiliado_definir_taxa(uuid, integer),
  public.afiliado_decidir_saque(uuid, text, text, text),
  public.afiliado_atualizar_configuracoes(boolean, integer, integer, integer, bigint, integer, text, boolean),
  public.afiliado_admin_situacao_indicacao(uuid, boolean, text),
  public.afiliado_admin_atribuir_indicacao(uuid, uuid, text),
  public.afiliado_admin_estornar_comissao(uuid, text),
  public.afiliado_converter_indicacao(uuid, uuid, uuid, text),
  public.afiliado_solicitar_saque(bigint),
  public.afiliado_admin_resumo(),
  public.afiliado_admin_serie(integer),
  public.afiliado_admin_afiliados(text, text, integer, integer),
  public.afiliado_admin_afiliado(uuid),
  public.afiliado_admin_indicacoes(text, text, uuid, integer, integer),
  public.afiliado_admin_lojas_sem_afiliado(text),
  public.afiliado_admin_comissoes(text, uuid, text, integer, integer),
  public.afiliado_admin_comissao(uuid),
  public.afiliado_admin_saques(text, uuid, integer, integer),
  public.afiliado_admin_eventos(text, uuid, integer, integer),
  public.afiliado_admin_configuracoes()
from public, anon, authenticated;

grant execute on function
  public.afiliado_exigir_admin(),
  public.afiliado_email_da_conta(uuid),
  public.afiliado_sinal_suspeito(uuid, text, jsonb),
  public.afiliado_padrao_de_busca(text),
  public.afiliado_converter_indicacao(uuid, uuid, uuid, text)
to service_role;

grant execute on function
  public.afiliado_definir_status(uuid, text, text),
  public.afiliado_definir_taxa(uuid, integer),
  public.afiliado_decidir_saque(uuid, text, text, text),
  public.afiliado_atualizar_configuracoes(boolean, integer, integer, integer, bigint, integer, text, boolean),
  public.afiliado_admin_situacao_indicacao(uuid, boolean, text),
  public.afiliado_admin_atribuir_indicacao(uuid, uuid, text),
  public.afiliado_admin_estornar_comissao(uuid, text),
  public.afiliado_solicitar_saque(bigint),
  public.afiliado_admin_resumo(),
  public.afiliado_admin_serie(integer),
  public.afiliado_admin_afiliados(text, text, integer, integer),
  public.afiliado_admin_afiliado(uuid),
  public.afiliado_admin_indicacoes(text, text, uuid, integer, integer),
  public.afiliado_admin_lojas_sem_afiliado(text),
  public.afiliado_admin_comissoes(text, uuid, text, integer, integer),
  public.afiliado_admin_comissao(uuid),
  public.afiliado_admin_saques(text, uuid, integer, integer),
  public.afiliado_admin_eventos(text, uuid, integer, integer),
  public.afiliado_admin_configuracoes()
to authenticated, service_role;
