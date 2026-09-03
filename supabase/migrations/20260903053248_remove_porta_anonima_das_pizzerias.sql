-- Tira a porta anônima da tabela de lojas do FlyControl.
--
-- O QUE HAVIA AQUI
--
-- Uma regra chamada `pizzerias_public_select` liberava, para o VISITANTE NÃO
-- LOGADO, a leitura de toda loja com status "ativa" — e a tabela de lojas é
-- onde mora a chave de acesso (`api_key`).
--
-- Ela não estava causando estrago hoje: por sorte, o visitante nunca tinha
-- recebido a permissão de leitura na tabela, então a regra nunca chegava a
-- ser aplicada. Conferido na prática antes desta migração: o pedido voltava
-- "permissão negada".
--
-- Mas isso é uma segurança que depende de sorte. A regra é uma porta
-- destrancada atrás de um portão trancado: no dia em que alguém abrir o
-- portão para resolver outra coisa — liberar uma consulta pública qualquer —
-- a porta cede junto, e as chaves de todas as lojas ativas saem de uma vez.
--
-- Foi exatamente esse arranjo que, no sistema do cardápio, estava vazando de
-- verdade: lá o portão estava aberto, e 20 chaves saíam numa única chamada
-- sem nenhum login.
--
-- Então: fora a regra, e fora também as permissões de escrita que o visitante
-- tinha herdado e nunca usou.

DROP POLICY IF EXISTS "pizzerias_public_select" ON public.pizzerias;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON public.pizzerias FROM anon;
