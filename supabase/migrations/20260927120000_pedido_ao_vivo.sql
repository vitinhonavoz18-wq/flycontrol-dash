-- ============================================================================
-- PEDIDO AO VIVO — FlyControl e FlyDelivery olhando o MESMO pedido
--
-- O QUE MUDA NA PRÁTICA
-- O pedido continua sendo UM só, na tabela `orders`, com UM status. O painel
-- muda o status (arrastando o card, pelo seletor, cancelando) e o cliente vê
-- a mudança no aplicativo na hora. Esta migração acrescenta três coisas:
--
--   1. HISTÓRICO GRAVADO PELO PRÓPRIO BANCO. Toda mudança de status — venha
--      do quadro, do seletor antigo, do cancelamento, do site ou de uma
--      automação — vira uma linha em `order_status_history`, na MESMA
--      operação que muda o status. Antes, só o arrastar do quadro gravava, e
--      numa segunda chamada separada (se a internet caísse no meio, o status
--      mudava e o histórico não).
--
--   2. O CLIENTE LÊ O HISTÓRICO DO PRÓPRIO PEDIDO — é o que põe o horário
--      em cada etapa da linha do tempo ("Preparando — 19:36"). Só do dele.
--
--   3. NINGUÉM "ADOTA" O PEDIDO DE OUTRA PESSOA. Quem usa o aplicativo ou o
--      site só pode gravar um pedido em nome de si mesmo; trocar o dono de um
--      pedido só o servidor pode. Sem isso, alguém poderia criar pedidos que
--      apareceriam na conta de outro cliente.
--
-- O QUE NÃO MUDA
-- Os status continuam os mesmos do painel (novo, preparando, saiu, entregue,
-- cancelado). Nenhum dado existente é alterado ou apagado. Nada aqui pode
-- impedir um pedido de ser gravado: se o histórico falhar, o pedido passa e o
-- banco só registra um aviso.
-- ============================================================================

-- A criação do pedido também entra no histórico ("Pedido criado — 19:32"), e
-- nela não existe status anterior.
alter table public.order_status_history alter column from_status drop not null;

-- 1. O banco grava o histórico -----------------------------------------------
create or replace function public.orders_record_status_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), '');
  v_source text;
begin
  if new.tenant_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  v_source := case
    when tg_op = 'INSERT' then coalesce(nullif(new.source, ''), 'pedido')
    when v_role = 'service_role' then 'sistema'
    when auth.uid() is not null then 'painel'
    else 'externo'
  end;

  begin
    -- Marca "quem está gravando é o banco": a trava de cópia abaixo deixa
    -- esta linha passar sempre.
    perform set_config('flycontrol.history_by_trigger', 'on', true);
    insert into public.order_status_history
      (order_id, tenant_id, from_status, to_status, changed_by, source, note)
    values (
      new.id, new.tenant_id,
      case when tg_op = 'INSERT' then null else old.status end,
      coalesce(new.status, ''),
      auth.uid(),
      v_source,
      case when tg_op = 'INSERT' then 'Pedido criado' else null end);
    perform set_config('flycontrol.history_by_trigger', 'off', true);
  exception when others then
    perform set_config('flycontrol.history_by_trigger', 'off', true);
    -- Histórico é registro, não trava: o pedido nunca deixa de ser gravado
    -- por causa dele.
    raise warning 'order_status_history não gravado para %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke execute on function public.orders_record_status_history() from public, anon, authenticated;

drop trigger if exists orders_record_status_history on public.orders;
create trigger orders_record_status_history
  after insert or update of status on public.orders
  for each row execute function public.orders_record_status_history();

-- A versão anterior do painel ainda grava o histórico por conta própria,
-- depois de mudar o status. Enquanto ela estiver no ar, essa segunda linha
-- seria repetida: o banco descarta a cópia (mesmo pedido, mesma mudança, nos
-- últimos 2 minutos, já registrada por ele). As linhas que o próprio banco
-- grava nunca são descartadas — voltar e avançar uma etapa rápido continua
-- aparecendo inteiro no histórico.
create or replace function public.order_status_history_skip_duplicate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('flycontrol.history_by_trigger', true), '') = 'on' then
    return new;
  end if;
  if exists (
    select 1 from public.order_status_history h
     where h.order_id = new.order_id
       and h.from_status is not distinct from new.from_status
       and h.to_status = new.to_status
       and h.created_at > now() - interval '2 minutes'
  ) then
    return null;
  end if;
  return new;
end;
$$;

revoke execute on function public.order_status_history_skip_duplicate() from public, anon, authenticated;

drop trigger if exists order_status_history_skip_duplicate on public.order_status_history;
create trigger order_status_history_skip_duplicate
  before insert on public.order_status_history
  for each row execute function public.order_status_history_skip_duplicate();

-- 2. O cliente lê o histórico do próprio pedido ---------------------------------
drop policy if exists order_status_history_customer_select on public.order_status_history;
create policy order_status_history_customer_select on public.order_status_history
  for select to authenticated
  using (exists (
    select 1 from public.orders o
     where o.id = order_status_history.order_id
       and o.customer_id is not null
       and o.customer_id = (select auth.uid())));

-- 3. Pedido só em nome de si mesmo -----------------------------------------------
create or replace function public.orders_guard_customer_id()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), '');
begin
  -- Só quem chega pela internet (site, aplicativo, painel) é conferido. O
  -- servidor (função do FlyDelivery, exclusão de conta) e rotinas internas do
  -- banco seguem livres.
  if v_role not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.customer_id is not null and new.customer_id is distinct from auth.uid() then
      raise exception 'Pedido só pode ser feito em nome da própria conta.' using errcode = '42501';
    end if;
  elsif new.customer_id is distinct from old.customer_id then
    raise exception 'O cliente de um pedido não pode ser trocado.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_guard_customer_id on public.orders;
create trigger orders_guard_customer_id
  before insert or update of customer_id on public.orders
  for each row execute function public.orders_guard_customer_id();
