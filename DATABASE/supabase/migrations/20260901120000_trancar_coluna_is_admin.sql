-- ETAPA 1 DA AUDITORIA — fecha a porta do administrador (achado SEC-01).
--
-- O PROBLEMA, EM LINGUAGEM DE RESTAURANTE
--
-- A ficha de cada usuário (`profiles`) tem um campo `is_admin`. Se ele está
-- marcado, aquela pessoa é administradora do FlyControl inteiro: vê e edita
-- todos os restaurantes, todos os pedidos e todas as faturas.
--
-- A regra que existia dizia apenas "cada pessoa pode editar a própria ficha".
-- Só que "a própria ficha" incluía esse campo. Ou seja: qualquer cliente
-- cadastrado podia se promover a administrador sozinho, sem invadir nada.
--
-- É o crachá de visitante com um campo "é o síndico?" em branco, e a caneta
-- do lado. Quem chega preenche e entra como se fosse dono do prédio.
--
-- O QUE ESTE ARQUIVO FAZ
--
-- Põe um conferente na entrada da ficha. Toda vez que uma ficha é gravada, ele
-- olha só para o campo `is_admin`:
--
--   * se quem está gravando é o servidor (que já é de confiança) ou um
--     administrador de verdade, passa direto;
--   * se é qualquer outra pessoa, o campo volta ao valor que já tinha — e o
--     resto da gravação segue normalmente.
--
-- Ele NÃO recusa o salvamento. Corrige o campo e deixa passar, no mesmo
-- espírito do gatilho que já limpa os textos do cardápio: derrubar a gravação
-- inteira faria o lojista perder o que estava editando por causa de um campo
-- que ele nem sabe que existe.
--
-- O QUE ELE NÃO MUDA
--
--   * Nenhum dado é apagado, alterado ou movido.
--   * Ninguém que é administrador hoje deixa de ser.
--   * Nenhuma tela muda: procurei no código inteiro e NADA em `src/` grava
--     `profiles.is_admin`. Os administradores são criados por `user_roles`.
--   * O servidor (chave de serviço) continua podendo gravar o campo, para o
--     dia em que existir uma tela de promoção de administrador.
--
-- POR QUE O CONFERENTE NÃO TEM PODERES ELEVADOS
--
-- Esta função é de propósito SECURITY INVOKER (o padrão), e não
-- SECURITY DEFINER. Dentro de uma função com poderes elevados, `current_user`
-- passa a ser o dono da função, e não quem realmente está gravando — o
-- conferente enxergaria "o gerente" em todo mundo que passasse, e não
-- conferiria nada. Rodando como quem chama, ele vê o visitante como visitante.

CREATE OR REPLACE FUNCTION public.protect_is_admin_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Caminhos internos de confiança: o servidor com a chave de serviço, o dono
  -- do banco, e as funções com poderes elevados que criam o perfil no cadastro
  -- (`handle_new_user` roda como `postgres`, então cai aqui).
  IF current_user IN ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  -- Administrador de verdade continua podendo mexer. `is_admin()` é a mesma
  -- função que as policies de RLS já usam, então quem é administrador hoje
  -- — pelos cargos em `user_roles` OU pela coluna antiga — segue sendo.
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Ficha nova nunca nasce administradora.
    NEW.is_admin := false;
  ELSE
    -- Ficha existente mantém o que já estava lá. O resto da gravação passa.
    NEW.is_admin := OLD.is_admin;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_is_admin_column() IS
  'Impede que um usuário comum marque a si mesmo como administrador. Corrige o campo em silêncio e deixa o resto da gravação passar.';

-- O gatilho vigia INSERT e UPDATE. Sem o INSERT, bastaria apagar a própria
-- ficha e criá-la de novo já marcada.
DROP TRIGGER IF EXISTS trg_protect_is_admin_column ON public.profiles;

CREATE TRIGGER trg_protect_is_admin_column
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_is_admin_column();

-- A função é chamada pelo gatilho, nunca pela internet. Quando o banco dispara
-- um gatilho, ele não pede permissão de quem fez a gravação — então fechar a
-- porta da rua não atrapalha o funcionamento. Mesmo tratamento que
-- `marketing_capture_customer` já recebeu.
REVOKE ALL ON FUNCTION public.protect_is_admin_column() FROM PUBLIC, anon, authenticated;
