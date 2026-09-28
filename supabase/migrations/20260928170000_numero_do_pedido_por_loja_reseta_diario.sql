-- Numeração do pedido, por loja, resetando todo dia.
--
-- POR QUE ISTO EXISTE
--
-- `order_number` era um `serial`: um contador ÚNICO E GLOBAL, compartilhado
-- por TODAS as lojas do FlyControl ao mesmo tempo. É como se todas as
-- padarias da cidade tirassem senha da mesma máquina — uma loja que abriu
-- hoje já recebe o pedido "Pedido #600" no primeiro cliente, porque o número
-- é da plataforma inteira, não da loja dela.
--
-- Agora cada loja tem o próprio contador, que reseta sozinho à meia-noite
-- (horário de Brasília). O primeiro pedido do dia de cada loja sempre começa
-- em #1 — sem depender de quantos pedidos outras lojas fizeram, e sem
-- precisar de nada manual todo santo dia.
--
-- NÃO MEXE EM PEDIDOS ANTIGOS. Só passa a valer para pedidos novos, a partir
-- de agora. Os números já impressos e já salvos continuam exatamente como
-- estão — reescrever pedido antigo bagunçaria relatório, comprovante já
-- entregue ao cliente e qualquer busca feita por aquele número.

-- Contador do dia, um por loja. Fica na própria tabela de lojas porque cada
-- loja só tem UM contador ativo por vez — não precisa de tabela separada.
alter table public.pizzerias
  add column if not exists daily_order_counter integer not null default 0;
alter table public.pizzerias
  add column if not exists daily_order_counter_date date;

comment on column public.pizzerias.daily_order_counter is
  'Último número de pedido dado a esta loja no dia de daily_order_counter_date. Reseta sozinho a cada novo dia (ver trigger em orders).';
comment on column public.pizzerias.daily_order_counter_date is
  'Dia (horário de Brasília) a que daily_order_counter se refere.';

create or replace function public.definir_numero_diario_do_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_numero integer;
begin
  -- UPDATE ... RETURNING numa linha só (a da loja) trava exatamente essa
  -- linha até a transação terminar. Dois pedidos chegando ao mesmo tempo
  -- para a MESMA loja ficam em fila e cada um recebe um número diferente;
  -- pedidos de lojas diferentes não se atrapalham, porque travam linhas
  -- diferentes. É a fila única do caixa da própria loja — nunca dois
  -- clientes daquela loja saem com a mesma senha, mas cada loja tem a
  -- fila dela.
  update public.pizzerias
    set daily_order_counter = case
          when daily_order_counter_date = v_hoje then daily_order_counter + 1
          else 1
        end,
        daily_order_counter_date = v_hoje
    where id = new.tenant_id
    returning daily_order_counter into v_numero;

  -- Loja não encontrada não deveria acontecer (a chave estrangeira já
  -- garante isso), mas se algum dia acontecer, o pedido não trava por
  -- causa do número — só mantém o que o `serial` antigo já tinha dado.
  if v_numero is not null then
    new.order_number := v_numero;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_numero_diario_do_pedido on public.orders;
create trigger trg_numero_diario_do_pedido
  before insert on public.orders
  for each row
  execute function public.definir_numero_diario_do_pedido();
