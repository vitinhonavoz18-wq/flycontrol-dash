-- SEGURANÇA: a senha da comanda deixa de ficar à vista.
--
-- O PROBLEMA
--
-- A tabela das comandas de mesa tinha uma regra de leitura escrita como "pode
-- tudo". Qualquer pessoa, sem conta nenhuma, listava as 116 comandas de TODOS
-- os restaurantes — e junto vinha o `customer_token`, que é justamente a senha
-- que o cliente usa para acompanhar e pedir o fechamento daquela mesa.
--
-- É o número da comanda escrito na porta do restaurante: quem passar na
-- calçada anota e pede a conta da mesa 5.
--
-- POR QUE A REGRA EXISTIA
--
-- O celular do garçom não faz login no banco como pessoa: ele entra com o
-- crachá próprio do garçom. Para o painel dele funcionar, alguém precisava
-- poder ler as comandas sem estar logado — e resolveram isso liberando para
-- todo mundo.
--
-- A CORREÇÃO DE AGORA
--
-- Quem não está logado continua lendo o que o painel do garçom precisa (mesa,
-- nome, situação, total), mas as duas colunas que servem de senha — o
-- `customer_token` e o `dining_session_id` — somem para ele. O dono da loja,
-- que está logado, continua enxergando tudo (o fechamento da mesa precisa
-- disso), e o painel do garçom não muda: ele lê pelo caminho de dentro do
-- sistema, que tem chave mestra.
--
-- O QUE AINDA FICA DEVENDO
--
-- Nome do cliente e valor da conta continuam legíveis por quem não está
-- logado. Fechar isso de vez exige o celular do garçom passar a se
-- identificar no banco — mudança maior, anotada como próximo passo.
revoke select on public.table_sessions from anon;

grant select (
  id, restaurant_id, table_number, table_name, table_id,
  customer_name, status,
  subtotal_amount, service_fee_enabled, service_fee_percent, service_fee_amount,
  total_amount,
  opened_at, closed_at, created_at, updated_at,
  closed_by, closure_reason, webhook_sent_at,
  waiter_id, waiter_commission_percent, waiter_commission_amount
) on public.table_sessions to anon;
