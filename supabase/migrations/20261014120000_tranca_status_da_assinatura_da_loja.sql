-- SEGURANÇA: o dono da loja não destranca a própria loja suspensa.
--
-- O PROBLEMA
--
-- A ficha da loja (tabela pizzerias) tem o campo "subscription_status". É ele
-- que a porta confere: "suspended" mostra a tela de Loja Suspensa no painel e
-- faz o site recusar pedidos novos.
--
-- A regra de edição dizia "o dono edita a própria loja" sem dizer QUAIS
-- campos. Como o campo de suspensão está na mesma ficha, um dono com um pouco
-- de conhecimento técnico conseguia trocar "suspended" por "active" direto
-- pelo navegador — sem pagar a fatura. É a chave do cadeado pendurada no
-- próprio cadeado.
--
-- Pelo mesmo caminho dava para ligar a loja desativada (is_active) e trocar o
-- próprio plano (plan_type) para um com mais recursos.
--
-- A CORREÇÃO
--
-- Esses três campos só mudam por dentro do sistema: pelo servidor (robô de
-- cobrança, confirmação de pagamento, cadastro) ou pelo administrador da
-- plataforma. O dono continua editando nome, endereço, horário, cores e todo
-- o resto normalmente.
--
-- Por que gatilho e não "revoke update (coluna)": no Supabase o papel
-- "authenticated" tem permissão de UPDATE na tabela inteira, e retirar a
-- permissão de UMA coluna não vence a permissão da tabela — a trava não
-- trancaria nada.

create or replace function public.pizzerias_protege_campos_de_assinatura()
returns trigger
language plpgsql
-- SECURITY INVOKER de propósito: a trava precisa enxergar QUEM está
-- escrevendo. Rodando como dono do banco, ela se deixaria passar sempre.
security invoker
set search_path to 'public'
as $$
begin
  -- Quem passa:
  --  * o servidor (service_role) e funções internas do banco, que rodam como
  --    o dono do banco — nesses casos o papel atual não é o do usuário;
  --  * o administrador da plataforma.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if auth.uid() is not null and public.is_admin(auth.uid()) then
    return new;
  end if;

  if new.subscription_status is distinct from old.subscription_status
     or new.is_active is distinct from old.is_active
     or new.plan_type is distinct from old.plan_type then
    raise exception 'A situação da assinatura e o plano da loja só podem ser alterados pela FlyControl.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pizzerias_protege_campos_de_assinatura on public.pizzerias;
create trigger trg_pizzerias_protege_campos_de_assinatura
  before update on public.pizzerias
  for each row
  execute function public.pizzerias_protege_campos_de_assinatura();
