-- SEGURANÇA: ninguém escreve o próprio crachá de administrador.
--
-- O PROBLEMA
--
-- A ficha de cada usuário (tabela profiles) tem uma caixinha "is_admin". A
-- regra de edição dizia "cada um edita a própria ficha" e parava aí — não
-- dizia QUAIS campos. Como a caixinha de administrador está na mesma ficha,
-- qualquer pessoa logada podia marcar a própria caixinha.
--
-- É o crachá de gerente ficar dentro da gaveta do próprio funcionário: ele
-- não precisa arrombar nada, é só abrir e vestir.
--
-- Hoje isso ainda não abria porta nenhuma (as portas conferem a outra lista,
-- a de papéis), mas bastava UMA linha futura conferir a caixinha para virar
-- controle total da plataforma.
--
-- A CORREÇÃO: a caixinha sai da gaveta. Cada um continua podendo corrigir o
-- próprio nome e telefone; a caixinha de administrador e o número de
-- identificação da ficha só mudam por dentro do sistema.
revoke update (is_admin, id) on public.profiles from anon, authenticated;
revoke insert (is_admin) on public.profiles from anon, authenticated;

-- SEGURANÇA: a ficha de uma pessoa não é para os outros lerem.
--
-- Existia uma regra de leitura escrita como "pode tudo": qualquer pessoa
-- logada — inclusive o dono de uma loja concorrente — conseguia listar nome e
-- telefone de TODOS os cadastrados. É a agenda de telefones da recepção ficar
-- em cima do balcão.
--
-- Removendo essa regra, sobra a que já existia e está certa: cada um lê a
-- própria ficha, e o administrador da plataforma lê todas (é ele quem precisa
-- disso na tela de Usuários).
drop policy if exists "profiles_read_policy" on public.profiles;

-- SEGURANÇA: o porteiro passa a conferir só a lista oficial de papéis.
--
-- Esta função respondia "é administrador?" olhando PRIMEIRO a caixinha da
-- ficha e só depois a lista de papéis. Era a segunda metade da falha acima:
-- de um lado a caixinha podia ser marcada por qualquer um, do outro havia um
-- porteiro disposto a aceitá-la.
--
-- Agora ela responde pela mesma fonte que todo o resto do sistema usa.
create or replace function public.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'super_admin'::public.app_role
  );
$function$;
