-- Liga o modelo de faixas do CENTS nos ciclos que já estão abertos.
--
-- O QUE ESTAVA ACONTECENDO
--
-- Cada ciclo de cobrança carrega, gravado na própria linha, QUAL tabela de
-- preço vai usar. Isso existe para que mudar o preço amanhã não reescreva a
-- fatura de ontem — é o cardápio com data.
--
-- O efeito colateral: quando o modelo de faixas entrou, ele passou a ser
-- carimbado só nos ciclos NOVOS. Os ciclos que já estavam abertos continuaram
-- com o carimbo antigo (`cents_v1`, preço único de R$ 0,70). Como ninguém
-- fechou o mês desde então, na prática NENHUMA loja estava no modelo novo —
-- ele existia no código e não valia para ninguém.
--
-- POR QUE É SEGURO TROCAR NO MEIO DO CICLO, NESTE CASO
--
-- Normalmente trocar a tabela de preço no meio do mês é errado: muda o preço
-- depois de o cliente já ter vendido. Aqui não prejudica ninguém, e dá para
-- provar:
--
--   • até o pedido 100, as duas tabelas cobram exatamente o mesmo (R$ 0,70);
--   • do 101 em diante, a nova cobra MENOS (0,60, depois 0,50, depois 0,40).
--
-- Ou seja, a conta de qualquer loja ou fica igual, ou fica menor. Nunca
-- maior. É o supermercado aplicando a promoção nova nas compras que já estão
-- no carrinho.
--
-- Além disso, no momento desta migração os ciclos abertos somavam 3 pedidos
-- no total — nem chegam perto da primeira faixa.
--
-- Só os ciclos ABERTOS são tocados. Ciclo fechado é conta já emitida, e conta
-- emitida não se reescreve.

UPDATE public.billing_cycles
   SET cents_policy = 'cents_v2',
       updated_at = now()
 WHERE status = 'open'
   AND coalesce(cents_policy, 'cents_v1') <> 'cents_v2';
