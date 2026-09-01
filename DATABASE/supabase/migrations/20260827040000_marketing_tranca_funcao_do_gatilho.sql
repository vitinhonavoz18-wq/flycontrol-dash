-- ============================================================================
-- FLY MARKETING — duas frestas que ficaram abertas na fundação
--
-- Encontradas pelo verificador de segurança do próprio Supabase, logo depois
-- de a fundação ser aplicada em produção.
--
-- FRESTA 1 — a função do gatilho estava atendendo pela porta da rua
--
-- `marketing_capture_customer` é a função que cadastra o cliente a cada
-- pedido. Ela roda com poderes elevados (SECURITY DEFINER), porque precisa
-- escrever numa tabela protegida.
--
-- O problema: por estar no esquema público, o Supabase publicava um endereço
-- para ela na internet (/rest/v1/rpc/marketing_capture_customer). Qualquer
-- pessoa, até sem login, podia tentar chamá-la de fora.
--
-- É como o cozinheiro ter a chave mestra do estoque — o que é correto, ele
-- precisa dela — mas a porta dos fundos do estoque estar dando para a
-- calçada. Ele nunca vai sair por ali, mas ela não devia existir.
--
-- A correção fecha essa porta. O gatilho continua funcionando igual: quando
-- uma função é chamada por um gatilho, o banco não pede a permissão de quem
-- fez o pedido — ele confia no gatilho.
--
-- Provado num Postgres local ANTES de aplicar em produção: com a porta
-- fechada, um pedido novo continua cadastrando o cliente, e um segundo
-- pedido do mesmo cliente continua somando sem duplicar.
--
-- FRESTA 2 — a função do telefone não dizia onde procurar as coisas
--
-- Todas as outras funções do módulo já fixavam isso; esta passou batido.
-- Sem a trava, alguém com acesso ao banco poderia criar uma função com o
-- mesmo nome de uma que ela usa e fazê-la chamar a errada — como trocar a
-- placa de uma rua para o entregador ir parar no endereço errado.
--
-- Depois desta migration o verificador do Supabase não aponta mais nada
-- sobre o módulo de Marketing.
-- ============================================================================

REVOKE ALL ON FUNCTION public.marketing_capture_customer()
  FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.marketing_normalize_phone(TEXT)
  SET search_path = public;
