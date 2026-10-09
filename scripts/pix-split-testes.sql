-- TESTES DAS REGRAS DO PIX COM SPLIT (SyncPay), direto no banco.
--
-- Rodam contra um Postgres de verdade, com a migração de verdade aplicada
-- (ver como rodar em scripts/pix-split-harness.sql). Cada caso diz o que
-- esperava; o resultado sai numa tabela no fim e o script FALHA se algum caso
-- não passou — ninguém precisa ler log procurando erro.

\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema teste;
create table teste.ctx (k text primary key, v text not null);
create table teste.resultado (ordem serial, caso text, veredito text, detalhe text);
grant usage on schema teste to anon, authenticated, service_role;
grant select, insert on teste.ctx to anon, authenticated, service_role;
grant insert, select on teste.resultado to anon, authenticated, service_role;
grant usage on sequence teste.resultado_ordem_seq to anon, authenticated, service_role;

create function teste.v(p_k text) returns text language sql stable as $$ select v from teste.ctx where k = p_k $$;
create function teste.id(p_k text) returns uuid language sql stable as $$ select v::uuid from teste.ctx where k = p_k $$;
create function teste.ok(p_caso text, p_cond boolean, p_detalhe text default null) returns void
language sql as $$
  insert into teste.resultado (caso, veredito, detalhe)
  values (p_caso, case when p_cond then 'OK' else 'FALHOU' end, p_detalhe)
$$;
grant execute on all functions in schema teste to anon, authenticated, service_role;

-- Quem está "logado" agora.
create function teste.como(p_role text, p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('test.role', p_role, false);
  perform set_config('test.uid', coalesce(p_uid::text, ''), false);
end $$;
grant execute on function teste.como(text, uuid) to anon, authenticated, service_role;

-- Linha de pedido pronta, como a função de pedido do FlyDelivery calcula.
create function teste.snapshot(p_store uuid, p_customer uuid, p_subtotal numeric, p_fee numeric, p_discount numeric)
returns jsonb language sql as $$
  select jsonb_build_object(
    'tenant_id', p_store, 'customer_id', p_customer, 'customer_name', 'Ana Cliente',
    'customer_phone', '11999990000', 'customer_address', 'Rua A, 10', 'neighborhood', 'Centro',
    'items', jsonb_build_array(jsonb_build_object('name', 'Pizza', 'quantity', 1, 'unit_price', p_subtotal, 'total_price', p_subtotal)),
    'subtotal', p_subtotal, 'delivery_fee', p_fee, 'discount', p_discount,
    'total', p_subtotal + p_fee - p_discount,
    'order_type', 'delivery', 'service_mode', 'delivery', 'delivery_type', 'delivery',
    'notes', '', 'source', 'flydelivery', 'status', 'novo')
$$;

-- ------------------------------------------------------------------ cenário --
do $$
declare
  v_dono_a uuid := gen_random_uuid(); v_dono_b uuid := gen_random_uuid();
  v_cliente uuid := gen_random_uuid(); v_outro uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_a uuid; v_b uuid; v_c uuid; v_cupom uuid;
begin
  insert into auth.users (id, email) values (v_dono_a, 'a@x'), (v_dono_b, 'b@x'), (v_cliente, 'c@x'),
    (v_outro, 'o@x'), (v_admin, 'adm@x');
  insert into public.user_roles values (v_admin, 'super_admin');
  insert into public.pizzerias (owner_id, name) values (v_dono_a, 'Pizzaria A') returning id into v_a;
  insert into public.pizzerias (owner_id, name) values (v_dono_b, 'Lanches B') returning id into v_b;
  insert into public.pizzerias (owner_id, name) values (v_dono_b, 'Loja sem Pix') returning id into v_c;
  insert into public.flydelivery_coupons (code) values ('FLY10') returning id into v_cupom;
  insert into teste.ctx values ('dono_a', v_dono_a), ('dono_b', v_dono_b), ('cliente', v_cliente),
    ('outro', v_outro), ('admin', v_admin), ('loja_a', v_a), ('loja_b', v_b), ('loja_c', v_c), ('cupom', v_cupom);
end $$;

-- ------------------------------------------- conta recebedora (pela loja) --
set role authenticated;
select teste.como('authenticated', teste.id('dono_a')) \g /dev/null

do $$
declare v jsonb; v_err text;
begin
  v := public.flydelivery_store_set_recipient(teste.id('loja_a'), 'syncpay-loja-a-001');
  perform teste.ok('01 loja informa a conta recebedora e fica aguardando verificação',
                   v->>'status' = 'aguardando_verificacao', v::text);

  begin
    perform public.flydelivery_store_set_recipient(teste.id('loja_b'), 'invasor-123456');
    perform teste.ok('02 dono de A NÃO altera a conta de B', false);
  exception when insufficient_privilege then
    perform teste.ok('02 dono de A NÃO altera a conta de B', true);
  end;

  begin
    perform public.flydelivery_store_set_pix_enabled(teste.id('loja_a'), true);
    perform teste.ok('03 Pix não liga antes de o administrador ativar a conta', false);
  exception when others then
    get stacked diagnostics v_err = message_text;
    perform teste.ok('03 Pix não liga antes de o administrador ativar a conta', v_err = 'conta_nao_ativa', v_err);
  end;

  begin
    perform public.flydelivery_admin_set_store_fee(teste.id('loja_a'), 1);
    perform teste.ok('04 loja NÃO muda a própria comissão', false);
  exception when insufficient_privilege then
    perform teste.ok('04 loja NÃO muda a própria comissão', true);
  end;

  begin
    perform public.flydelivery_admin_set_account_status(teste.id('loja_a'), 'ativa', null);
    perform teste.ok('05 loja NÃO ativa a própria conta', false);
  exception when insufficient_privilege then
    perform teste.ok('05 loja NÃO ativa a própria conta', true);
  end;

  begin
    perform public.flydelivery_store_set_recipient(teste.id('loja_a'), 'tem espaço e ç');
    perform teste.ok('06 identificador com formato inválido é recusado', false);
  exception when invalid_parameter_value then
    perform teste.ok('06 identificador com formato inválido é recusado', true);
  end;
end $$;

select teste.como('authenticated', teste.id('dono_b')) \g /dev/null
do $$
begin
  begin
    perform public.flydelivery_store_set_recipient(teste.id('loja_b'), 'SYNCPAY-LOJA-A-001');
    perform teste.ok('07 a mesma conta recebedora não serve para duas lojas', false);
  exception when unique_violation then
    perform teste.ok('07 a mesma conta recebedora não serve para duas lojas', true);
  end;
  perform public.flydelivery_store_set_recipient(teste.id('loja_b'), 'syncpay-loja-b-002');
end $$;

-- ------------------------------------------------------ administrador --
select teste.como('authenticated', teste.id('admin')) \g /dev/null
do $$
declare v_err text;
begin
  perform public.flydelivery_admin_set_account_status(teste.id('loja_a'), 'ativa', 'Conferido com a SyncPay');
  perform public.flydelivery_admin_set_account_status(teste.id('loja_b'), 'ativa', 'Conferido com a SyncPay');

  begin
    perform public.flydelivery_admin_set_default_fee(0);
    perform teste.ok('08 comissão 0% é recusada', false);
  exception when invalid_parameter_value then
    perform teste.ok('08 comissão 0% é recusada', true);
  end;
  begin
    perform public.flydelivery_admin_set_default_fee(97);
    perform teste.ok('09 comissão 97% (erro de digitação) é recusada', false);
  exception when invalid_parameter_value then
    perform teste.ok('09 comissão 97% (erro de digitação) é recusada', true);
  end;
  begin
    execute 'select public.flydelivery_admin_set_default_fee(2.5)';
    perform teste.ok('10 comissão fracionária (2,5%) não existe para o Pix', false);
  exception when undefined_function then
    perform teste.ok('10 comissão fracionária (2,5%) não existe para o Pix', true);
  end;

  perform public.flydelivery_admin_set_store_fee(teste.id('loja_b'), 5);
end $$;
reset role;
-- A comissão efetiva só o servidor consulta.
select teste.ok('11 comissão própria da loja B vale no lugar da padrão',
                public.flydelivery_effective_fee_percent(teste.id('loja_b')) = 5) \g /dev/null
select teste.ok('12 loja A segue com a padrão de 3%',
                public.flydelivery_effective_fee_percent(teste.id('loja_a')) = 3) \g /dev/null
-- 2 contas informadas + 2 ativações + 1 comissão própria. As tentativas
-- recusadas (comissão 0%, 97%, recebedor repetido) não deixam rastro de
-- mudança, porque nada mudou.
select teste.ok('13 toda mudança financeira foi para a auditoria (e só as que aconteceram)',
  (select count(*) filter (where action = 'conta_recebedora_alterada') = 2
      and count(*) filter (where action = 'situacao_da_conta_alterada') = 2
      and count(*) filter (where action = 'comissao_da_loja_alterada') = 1
      and count(*) = 5
     from public.flydelivery_finance_audit),
  (select string_agg(action, ', ') from public.flydelivery_finance_audit)) \g /dev/null

set role authenticated;
select teste.como('authenticated', teste.id('dono_a')) \g /dev/null
select public.flydelivery_store_set_pix_enabled(teste.id('loja_a'), true) \g /dev/null
select teste.como('authenticated', teste.id('dono_b')) \g /dev/null
select public.flydelivery_store_set_pix_enabled(teste.id('loja_b'), true) \g /dev/null
reset role;

select teste.ok('14 aplicativo enxerga Pix disponível na loja ativa e ligada',
  public.flydelivery_online_pix_available(teste.id('loja_a'))) \g /dev/null
select teste.ok('15 loja sem conta não oferece Pix pelo app',
  not public.flydelivery_online_pix_available(teste.id('loja_c'))) \g /dev/null

-- ------------------------------------------------ sala de espera (servidor) --
set role service_role;
select teste.como('service_role', null) \g /dev/null

do $$
declare v jsonb; v2 jsonb;
begin
  begin
    perform public.flydelivery_checkout_create('req-outro-dono-1', teste.id('outro'),
      teste.snapshot(teste.id('loja_a'), teste.id('cliente'), 90, 10, 0));
    perform teste.ok('16 pedido em nome de outra conta é recusado', false);
  exception when insufficient_privilege then
    perform teste.ok('16 pedido em nome de outra conta é recusado', true);
  end;

  begin
    perform public.flydelivery_checkout_create('req-loja-c-0001', teste.id('cliente'),
      teste.snapshot(teste.id('loja_c'), teste.id('cliente'), 90, 10, 0));
    perform teste.ok('17 loja sem conta recebedora não gera pedido de Pix', false);
  exception when raise_exception then
    perform teste.ok('17 loja sem conta recebedora não gera pedido de Pix', sqlerrm = 'pix_indisponivel', sqlerrm);
  end;

  begin
    perform public.flydelivery_checkout_create('req-manipulado1', teste.id('cliente'),
      teste.snapshot(teste.id('loja_a'), teste.id('cliente'), 90, 10, 0) || '{"total": 0.5}'::jsonb);
    perform teste.ok('18 total que não fecha com produtos + entrega - desconto é recusado', false);
  exception when invalid_parameter_value then
    perform teste.ok('18 total que não fecha com produtos + entrega - desconto é recusado', true);
  end;

  v := public.flydelivery_checkout_create('req-pedido-0001', teste.id('cliente'),
    teste.snapshot(teste.id('loja_a'), teste.id('cliente'), 90, 10, 0));
  v2 := public.flydelivery_checkout_create('req-pedido-0001', teste.id('cliente'),
    teste.snapshot(teste.id('loja_a'), teste.id('cliente'), 90, 10, 0));
  perform teste.ok('19 reabrir o checkout devolve a MESMA sala de espera',
    v->>'checkout_id' = v2->>'checkout_id' and (v2->>'duplicate')::boolean, v2::text);
  perform teste.ok('20 total guardado em centavos inteiros (R$ 100,00 = 10000)', (v->>'total_cents')::bigint = 10000);
  insert into teste.ctx values ('ck1', v->>'checkout_id');
end $$;

-- ------------------------------------------------------- reservar cobrança --
do $$
declare v jsonb; v2 jsonb; v3 jsonb; v_n int;
begin
  v := public.flydelivery_pix_reserve(teste.id('ck1'), teste.id('outro'));
  perform teste.ok('21 outra pessoa não gera Pix do pedido alheio', v->>'acao' = 'nao_encontrado', v::text);

  v := public.flydelivery_pix_reserve(teste.id('ck1'), teste.id('cliente'));
  perform teste.ok('22 primeira reserva manda criar a cobrança', v->>'acao' = 'criar', v::text);
  perform teste.ok('23 split 3% plataforma / 97% loja',
    (v->>'fee_percent')::int = 3 and (v->>'store_percent')::int = 97, v::text);
  perform teste.ok('24 recebedor é a conta da LOJA, não a da plataforma',
    v->>'recipient_user_id' = 'syncpay-loja-a-001');
  insert into teste.ctx values ('pay1', v->>'payment_id');

  v2 := public.flydelivery_pix_reserve(teste.id('ck1'), teste.id('cliente'));
  perform teste.ok('25 segundo toque enquanto cria: não nasce outra cobrança', v2->>'acao' = 'em_andamento', v2::text);

  perform public.flydelivery_pix_register_charge(teste.id('pay1'), 'SYNC-REF-0001', '00020126PIXCOPIAECOLA');
  v3 := public.flydelivery_pix_reserve(teste.id('ck1'), teste.id('cliente'));
  perform teste.ok('26 tela reaberta devolve o MESMO QR Code',
    v3->>'acao' = 'existente' and v3->>'pix_code' = '00020126PIXCOPIAECOLA', v3::text);

  select count(*) into v_n from public.flydelivery_payments where checkout_id = teste.id('ck1');
  perform teste.ok('27 uma cobrança só para o pedido', v_n = 1, v_n::text);

  select count(*) into v_n from public.flydelivery_payments
   where id = teste.id('pay1') and store_amount_cents = 9700 and platform_amount_cents = 300;
  perform teste.ok('28 R$ 100,00 → R$ 97,00 da loja e R$ 3,00 da plataforma', v_n = 1);

  begin
    insert into public.flydelivery_payments (checkout_id, store_id, customer_id, status, amount_cents,
      fee_percent, store_percent, recipient_user_id, platform_amount_cents, store_amount_cents)
    values (teste.id('ck1'), teste.id('loja_a'), teste.id('cliente'), 'pendente', 10000, 3, 97, 'x', 300, 9700);
    perform teste.ok('29 o banco barra uma segunda cobrança viva para o mesmo pedido', false);
  exception when unique_violation then
    perform teste.ok('29 o banco barra uma segunda cobrança viva para o mesmo pedido', true);
  end;

  select count(*) into v_n from public.orders;
  perform teste.ok('30 QR Code gerado NÃO cria pedido na cozinha', v_n = 0, v_n::text);
end $$;

-- ----------------------------------------------- confirmação (reconferida) --
do $$
declare v jsonb; v_n int; v_order record;
begin
  v := public.flydelivery_pix_apply_provider_status(teste.id('pay1'), 'pending', null, '{}'::jsonb);
  perform teste.ok('31 "pending" mantém pendente', v->>'resultado' = 'sem_mudanca', v::text);

  v := public.flydelivery_pix_apply_provider_status(teste.id('pay1'), 'completed', 10000, '{"status":"completed"}'::jsonb);
  perform teste.ok('32 pago e reconferido: pedido criado', v->>'resultado' = 'confirmado', v::text);

  select * into v_order from public.orders where id = (v->>'order_id')::uuid;
  perform teste.ok('33 pedido entra como NOVO, PAGO, com o carimbo do app',
    v_order.status = 'novo' and v_order.payment_status = 'paid'
      and v_order.payment_method = 'Pix (pago no app)'
      and v_order.flydelivery_payment_id = teste.id('pay1')
      and v_order.total = 100.00 and v_order.tenant_id = teste.id('loja_a'),
    row_to_json(v_order)::text);

  v := public.flydelivery_pix_apply_provider_status(teste.id('pay1'), 'completed', 10000, '{}'::jsonb);
  select count(*) into v_n from public.orders;
  perform teste.ok('34 aviso repetido NÃO cria segundo pedido', v_n = 1 and v->>'resultado' = 'sem_mudanca', v::text);

  v := public.flydelivery_pix_apply_provider_status(teste.id('pay1'), 'pending', null, '{}'::jsonb);
  perform teste.ok('35 "pending" atrasado (fora de ordem) não desfaz o pago',
    v->>'resultado' = 'fora_de_ordem' and v->>'status' = 'pago', v::text);

  v := public.flydelivery_pix_reserve(teste.id('ck1'), teste.id('cliente'));
  perform teste.ok('36 pedido pago não aceita gerar outro Pix', v->>'acao' = 'pago', v::text);

  v := public.flydelivery_pix_apply_provider_status(teste.id('pay1'), 'refunded', 10000, '{}'::jsonb);
  select count(*) into v_n from public.flydelivery_payments
   where id = teste.id('pay1') and status = 'estornado' and needs_reconciliation;
  perform teste.ok('37 estorno marca o pagamento e pede conciliação', v_n = 1, v::text);
  select count(*) into v_n from public.orders where status = 'novo';
  perform teste.ok('38 estorno NÃO apaga nem cancela o pedido sozinho', v_n = 1);

  v := public.flydelivery_pix_apply_provider_status(teste.id('pay1'), 'completed', 10000, '{}'::jsonb);
  perform teste.ok('39 "completed" depois de estorno não volta a pago', v->>'resultado' = 'ignorado_pos_estorno', v::text);
end $$;

-- -------------------------------------- valor errado, prazo, cupom, rateio --
do $$
declare v jsonb; v_ck uuid; v_pay uuid; v_n int;
begin
  -- Valor que não confere.
  v := public.flydelivery_checkout_create('req-pedido-0002', teste.id('cliente'),
    teste.snapshot(teste.id('loja_a'), teste.id('cliente'), 50, 0, 0));
  v_ck := (v->>'checkout_id')::uuid;
  v := public.flydelivery_pix_reserve(v_ck, teste.id('cliente'));
  v_pay := (v->>'payment_id')::uuid;
  perform public.flydelivery_pix_register_charge(v_pay, 'SYNC-REF-0002', 'PIX2');
  v := public.flydelivery_pix_apply_provider_status(v_pay, 'completed', 1, '{}'::jsonb);
  select count(*) into v_n from public.orders where flydelivery_payment_id = v_pay;
  perform teste.ok('40 "pago" com valor diferente vira divergente e NÃO libera pedido',
    v->>'resultado' = 'divergente' and v_n = 0, v::text);

  v := public.flydelivery_pix_apply_provider_status(v_pay, 'completed', 5000, '{}'::jsonb);
  perform teste.ok('41 divergente só sai pela mão do administrador', v->>'status' = 'divergente', v::text);

  -- Split informado pela SyncPay não confere.
  v := public.flydelivery_checkout_create('req-pedido-0003', teste.id('cliente'),
    teste.snapshot(teste.id('loja_a'), teste.id('cliente'), 40, 0, 0));
  v_ck := (v->>'checkout_id')::uuid;
  v := public.flydelivery_pix_reserve(v_ck, teste.id('cliente'));
  v_pay := (v->>'payment_id')::uuid;
  perform public.flydelivery_pix_register_charge(v_pay, 'SYNC-REF-0003', 'PIX3');
  v := public.flydelivery_pix_apply_provider_status(v_pay, 'completed', 4000, '{}'::jsonb, false);
  perform teste.ok('42 recebedor/percentual diferente do esperado vira divergente', v->>'resultado' = 'divergente', v::text);

  -- Pago depois do prazo.
  v := public.flydelivery_checkout_create('req-pedido-0004', teste.id('cliente'),
    teste.snapshot(teste.id('loja_a'), teste.id('cliente'), 30, 5, 0));
  v_ck := (v->>'checkout_id')::uuid;
  v := public.flydelivery_pix_reserve(v_ck, teste.id('cliente'));
  v_pay := (v->>'payment_id')::uuid;
  perform public.flydelivery_pix_register_charge(v_pay, 'SYNC-REF-0004', 'PIX4');
  update public.flydelivery_checkouts set expires_at = now() - interval '1 minute' where id = v_ck;
  v := public.flydelivery_pix_apply_provider_status(v_pay, 'completed', 3500, '{}'::jsonb);
  select count(*) into v_n from public.orders where flydelivery_payment_id = v_pay;
  perform teste.ok('43 pago depois do prazo: sem pedido na cozinha, vai para conciliação',
    v->>'resultado' = 'pago_fora_do_prazo' and v_n = 0, v::text);

  -- Cupom só conta no pagamento confirmado.
  v := public.flydelivery_checkout_create('req-pedido-0005', teste.id('cliente'),
    teste.snapshot(teste.id('loja_b'), teste.id('cliente'), 100, 0, 10)
      || jsonb_build_object('flydelivery_coupon_id', teste.id('cupom'), 'flydelivery_coupon_code', 'FLY10'),
    teste.id('cupom'));
  v_ck := (v->>'checkout_id')::uuid;
  perform teste.ok('44 cupom NÃO é gasto só por abrir o checkout',
    (select used_count from public.flydelivery_coupons where id = teste.id('cupom')) = 0);
  v := public.flydelivery_pix_reserve(v_ck, teste.id('cliente'));
  perform teste.ok('45 loja B cobra a comissão própria de 5%', (v->>'fee_percent')::int = 5, v::text);
  v_pay := (v->>'payment_id')::uuid;
  perform public.flydelivery_pix_register_charge(v_pay, 'SYNC-REF-0005', 'PIX5');
  v := public.flydelivery_pix_apply_provider_status(v_pay, 'completed', 9000, '{}'::jsonb);
  perform teste.ok('46 cupom registrado junto com o pedido pago',
    (select used_count from public.flydelivery_coupons where id = teste.id('cupom')) = 1
    and (select count(*) from public.flydelivery_coupon_redemptions where order_id = (v->>'order_id')::uuid) = 1, v::text);
  perform teste.ok('47 R$ 90,00 com 5%: R$ 85,50 loja + R$ 4,50 plataforma',
    (select store_amount_cents = 8550 and platform_amount_cents = 450 from public.flydelivery_payments where id = v_pay));

  -- Arredondamento: R$ 33,33 com 3% → loja 97% = 3233,01 → 3233; plataforma 100.
  v := public.flydelivery_checkout_create('req-pedido-0006', teste.id('cliente'),
    teste.snapshot(teste.id('loja_a'), teste.id('cliente'), 33.33, 0, 0));
  v := public.flydelivery_pix_reserve((v->>'checkout_id')::uuid, teste.id('cliente'));
  perform teste.ok('48 centavo do arredondamento fica com a plataforma (regra escrita)',
    (select store_amount_cents = 3233 and platform_amount_cents = 100
       from public.flydelivery_payments where id = (v->>'payment_id')::uuid), v::text);
  insert into teste.ctx values ('pay6', v->>'payment_id'), ('ck6', v->>'checkout_id');
end $$;

-- ------------------------------- criação interrompida e cobrança duplicada --
do $$
declare v jsonb; v_old uuid; v_new uuid; v_n int;
begin
  -- A criação de pay6 "travou" (servidor caiu antes de anotar a resposta).
  update public.flydelivery_payments set created_at = now() - interval '5 minutes' where id = teste.id('pay6');
  v := public.flydelivery_pix_reserve(teste.id('ck6'), teste.id('cliente'));
  perform teste.ok('49 criação interrompida vira "incerto" e libera nova tentativa',
    v->>'acao' = 'criar'
    and (select status from public.flydelivery_payments where id = teste.id('pay6')) = 'incerto', v::text);
  v_old := teste.id('pay6');
  v_new := (v->>'payment_id')::uuid;
  perform public.flydelivery_pix_register_charge(v_new, 'SYNC-REF-0007', 'PIX7');
  v := public.flydelivery_pix_apply_provider_status(v_new, 'completed', 3333, '{}'::jsonb);
  perform teste.ok('50 a nova cobrança paga libera o pedido', v->>'resultado' = 'confirmado', v::text);

  -- A cobrança "incerta" apareceu paga também (caso raro).
  update public.flydelivery_payments set provider_reference = 'SYNC-REF-0006' where id = v_old;
  v := public.flydelivery_pix_apply_provider_status(v_old, 'completed', 3333, '{}'::jsonb);
  select count(*) into v_n from public.orders where flydelivery_request_id = 'req-pedido-0006';
  perform teste.ok('51 duas cobranças pagas: UM pedido só, e a duplicada vai para devolução',
    v->>'resultado' = 'duplicidade' and v_n = 1
    and (select needs_reconciliation from public.flydelivery_payments where id = v_old), v::text);
end $$;

-- ------------------- cobrança antiga paga com outra aberta para o pedido --
do $$
declare v jsonb; v_ck uuid; v_velha uuid; v_nova uuid; v_n int;
begin
  v := public.flydelivery_checkout_create('req-pedido-0010', teste.id('cliente'),
    teste.snapshot(teste.id('loja_a'), teste.id('cliente'), 60, 0, 0));
  v_ck := (v->>'checkout_id')::uuid;
  v := public.flydelivery_pix_reserve(v_ck, teste.id('cliente'));
  v_velha := (v->>'payment_id')::uuid;
  perform public.flydelivery_pix_creation_failed(v_velha, 'incerto', 'resposta perdida');
  update public.flydelivery_payments set provider_reference = 'SYNC-REF-0010A' where id = v_velha;
  v := public.flydelivery_pix_reserve(v_ck, teste.id('cliente'));
  v_nova := (v->>'payment_id')::uuid;
  perform public.flydelivery_pix_register_charge(v_nova, 'SYNC-REF-0010B', 'PIX10B');

  -- A "incerta" aparece paga enquanto a nova ainda está aberta.
  v := public.flydelivery_pix_apply_provider_status(v_velha, 'completed', 6000, '{}'::jsonb);
  perform teste.ok('52b cobrança antiga paga com outra aberta: pedido criado sem travar o banco',
    v->>'resultado' = 'confirmado', v::text);
  perform teste.ok('52c a cobrança que ficou aberta é encerrada',
    (select status from public.flydelivery_payments where id = v_nova) = 'expirado');
  v := public.flydelivery_pix_apply_provider_status(v_nova, 'completed', 6000, '{}'::jsonb);
  select count(*) into v_n from public.orders where flydelivery_request_id = 'req-pedido-0010';
  perform teste.ok('52d se pagarem a encerrada também: um pedido só e devolução marcada',
    v->>'resultado' = 'duplicidade' and v_n = 1, v::text);
end $$;

-- ------------------------------------------------- limite de tentativas --
do $$
declare v jsonb; v_ck uuid; i int;
begin
  v := public.flydelivery_checkout_create('req-pedido-0008', teste.id('cliente'),
    teste.snapshot(teste.id('loja_a'), teste.id('cliente'), 20, 0, 0));
  v_ck := (v->>'checkout_id')::uuid;
  for i in 1..5 loop
    v := public.flydelivery_pix_reserve(v_ck, teste.id('cliente'));
    perform public.flydelivery_pix_creation_failed((v->>'payment_id')::uuid, 'falhou', 'teste');
  end loop;
  v := public.flydelivery_pix_reserve(v_ck, teste.id('cliente'));
  perform teste.ok('52 depois de 5 tentativas, para de gerar cobrança', v->>'acao' = 'limite_tentativas', v::text);
end $$;

-- ------------------------------------------------ avisos (webhooks) --
do $$
declare v1 boolean; v2 boolean;
begin
  v1 := public.flydelivery_payment_event_record('id:evt-1', 'transaction', 'SYNC-REF-0001', 'hmac', '{}'::jsonb);
  v2 := public.flydelivery_payment_event_record('id:evt-1', 'transaction', 'SYNC-REF-0001', 'hmac', '{}'::jsonb);
  perform teste.ok('53 o mesmo aviso só é registrado uma vez', v1 and not v2);

  perform public.flydelivery_payment_event_finish('id:evt-1', 'erro', 'banco fora do ar');
  v2 := public.flydelivery_payment_event_record('id:evt-1', 'transaction', 'SYNC-REF-0001', 'hmac', '{}'::jsonb);
  perform teste.ok('53b aviso que deu erro pode ser processado de novo na próxima entrega', v2);
  perform public.flydelivery_payment_event_finish('id:evt-1', 'confirmado', null);
  v2 := public.flydelivery_payment_event_record('id:evt-1', 'transaction', 'SYNC-REF-0001', 'hmac', '{}'::jsonb);
  perform teste.ok('53c aviso já processado com sucesso não é reprocessado', not v2);
end $$;

-- ------------------------------------- trava do carimbo "pago no app" --
reset role;
set role anon;
select teste.como('anon', null) \g /dev/null
do $$
begin
  begin
    insert into public.orders (tenant_id, customer_name, customer_phone, total, payment_method, status)
    values (teste.id('loja_a'), 'Golpista', '11900000000', 50, 'Pix (pago no app)', 'novo');
    perform teste.ok('54 site/anônimo NÃO cria pedido com o carimbo "pago no app"', false);
  exception when insufficient_privilege then
    perform teste.ok('54 site/anônimo NÃO cria pedido com o carimbo "pago no app"', true);
  end;
  insert into public.orders (tenant_id, customer_name, customer_phone, total, payment_method, status)
  values (teste.id('loja_a'), 'Cliente do site', '11900000001', 50, 'Dinheiro', 'novo');
  perform teste.ok('55 pedido comum do site continua entrando normalmente', true);
end $$;
reset role;

set role authenticated;
select teste.como('authenticated', teste.id('dono_a')) \g /dev/null
do $$
declare v_id uuid;
begin
  select id into v_id from public.orders where customer_name = 'Cliente do site';
  begin
    update public.orders set payment_method = 'Pix (pago no app)' where id = v_id;
    perform teste.ok('56 painel NÃO carimba pedido comum como "pago no app"', false);
  exception when insufficient_privilege then
    perform teste.ok('56 painel NÃO carimba pedido comum como "pago no app"', true);
  end;
  begin
    update public.orders set flydelivery_payment_id = teste.id('pay1') where id = v_id;
    perform teste.ok('57 painel NÃO pendura um pagamento em outro pedido', false);
  exception when insufficient_privilege then
    perform teste.ok('57 painel NÃO pendura um pagamento em outro pedido', true);
  end;
  update public.orders set status = 'preparando' where flydelivery_payment_id = teste.id('pay1');
  perform teste.ok('58 loja segue aceitando/preparando o pedido pago normalmente',
    (select status from public.orders where flydelivery_payment_id = teste.id('pay1')) = 'preparando');
end $$;

-- ----------------------------------------- isolamento entre lojas (RLS) --
do $$
declare v_n int; v_err text;
begin
  select count(*) into v_n from public.flydelivery_payments where store_id = teste.id('loja_b');
  perform teste.ok('59 dono de A NÃO vê pagamentos de B', v_n = 0, v_n::text);
  select count(*) into v_n from public.flydelivery_payments where store_id = teste.id('loja_a');
  perform teste.ok('60 dono de A vê os pagamentos de A', v_n > 0, v_n::text);
  select count(*) into v_n from public.flydelivery_payment_accounts;
  perform teste.ok('61 dono de A vê só a própria conta recebedora', v_n = 1, v_n::text);
  select count(*) into v_n from public.flydelivery_payment_events;
  perform teste.ok('62 loja não lê o histórico bruto de avisos da SyncPay', v_n = 0, v_n::text);
  begin
    update public.flydelivery_payments set status = 'pago' where store_id = teste.id('loja_a');
    perform teste.ok('63 loja não altera pagamento direto na tabela', false);
  exception when insufficient_privilege then
    perform teste.ok('63 loja não altera pagamento direto na tabela', true);
  end;
  begin
    perform public.flydelivery_effective_fee_percent(teste.id('loja_b'));
    perform teste.ok('64 loja não consulta a comissão de outra loja', false);
  exception when insufficient_privilege then
    perform teste.ok('64 loja não consulta a comissão de outra loja', true);
  end;
  begin
    perform public.flydelivery_pix_apply_provider_status(teste.id('pay1'), 'completed', 10000, '{}'::jsonb);
    perform teste.ok('65 ninguém de fora chama a confirmação de pagamento', false);
  exception when insufficient_privilege then
    perform teste.ok('65 ninguém de fora chama a confirmação de pagamento', true);
  end;
end $$;

select teste.como('authenticated', teste.id('cliente')) \g /dev/null
do $$
declare v_n int;
begin
  select count(*) into v_n from public.flydelivery_payments;
  perform teste.ok('66 cliente não lê comissão nem conta recebedora (tabela de pagamentos)', v_n = 0, v_n::text);
  select count(*) into v_n from public.flydelivery_checkouts where customer_id = teste.id('cliente');
  perform teste.ok('66b cliente enxerga os próprios pedidos aguardando pagamento', v_n > 0, v_n::text);
  select count(*) into v_n from public.flydelivery_checkouts where customer_id <> teste.id('cliente');
  perform teste.ok('66c cliente não enxerga pedido de outra pessoa', v_n = 0, v_n::text);
end $$;
reset role;

-- --------------------------------------------- prazo vencido (faxina) --
set role service_role;
select teste.como('service_role', null) \g /dev/null
do $$
declare v jsonb; v_ck uuid; v_pay uuid; v_n int;
begin
  v := public.flydelivery_checkout_create('req-pedido-0009', teste.id('cliente'),
    teste.snapshot(teste.id('loja_a'), teste.id('cliente'), 25, 0, 0));
  v_ck := (v->>'checkout_id')::uuid;
  v := public.flydelivery_pix_reserve(v_ck, teste.id('cliente'));
  v_pay := (v->>'payment_id')::uuid;
  perform public.flydelivery_pix_register_charge(v_pay, 'SYNC-REF-0009', 'PIX9');
  update public.flydelivery_checkouts set expires_at = now() - interval '1 hour' where id = v_ck;
  v_n := public.flydelivery_checkouts_expire();
  perform teste.ok('67 faxina vence pedido não pago e a cobrança pendente dele',
    v_n >= 1 and (select status from public.flydelivery_payments where id = v_pay) = 'expirado');
end $$;
reset role;

-- --------------------------------------------------------- resultado --
\echo
select ordem, veredito, caso, coalesce(left(detalhe, 80), '') as detalhe from teste.resultado order by ordem;

do $$
declare v_falhas int; v_total int;
begin
  select count(*) filter (where veredito <> 'OK'), count(*) into v_falhas, v_total from teste.resultado;
  if v_falhas > 0 then
    raise exception '% de % casos FALHARAM', v_falhas, v_total;
  end if;
  raise notice 'Todos os % casos passaram.', v_total;
end $$;
