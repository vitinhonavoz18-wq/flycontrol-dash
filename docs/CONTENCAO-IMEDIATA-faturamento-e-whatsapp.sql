-- ============================================================================
-- CONTENÇÃO IMEDIATA — fecha só o mais grave, antes da trava completa
-- ============================================================================
--
-- Use SOMENTE se não for possível aplicar já a trava completa
-- (supabase/migrations/20261022160000_tranca_funcoes_e_visoes_expostas.sql).
-- Este arquivo é um PEDAÇO daquela trava, com as mesmas linhas, para fechar
-- em minutos as duas portas que expõem dados:
--
--   1. a fila de WhatsApp do Chat, que deixa qualquer visitante pegar as
--      mensagens no momento do envio (telefone, nome e texto) e segurá-las;
--   2. os relatórios de faturamento, que mostram o faturamento de todas as
--      lojas a qualquer visitante e a qualquer conta logada.
--
-- Não apaga nem altera nenhum dado. Rodar a trava completa depois é seguro:
-- ela repete estas linhas sem erro.
--
-- Desfazer: as seções 1 e 3 do arquivo
-- docs/REVERTER-NO-SUPABASE-tranca-funcoes-e-visoes.sql.
--
-- Como usar: Supabase > SQL Editor > colar tudo > Run. Depois, rodar
-- docs/VALIDAR-NO-SUPABASE-tranca.sql: as linhas da fila do WhatsApp e do
-- faturamento devem dar ok.
-- ============================================================================

BEGIN;

-- Se alguma tabela estiver ocupada, desiste em 5 s em vez de travar o sistema.
SET LOCAL lock_timeout = '5s';

-- 1. Fila e caixa de entrada do Chat: só o servidor (chave de serviço).
REVOKE ALL ON FUNCTION public.crm_next_outbox(uuid, integer, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_receive_message(uuid, text, text, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_attach_media(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_rename_customer(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_next_outbox(uuid, integer, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_receive_message(uuid, text, text, text, text, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_attach_media(uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_rename_customer(uuid, uuid, text, text) TO service_role;

-- 2. Faturamento: cada dono vê só a própria loja; o administrador vê todas;
--    visitante não vê nada.
ALTER VIEW public.pizzeria_financial_metrics SET (security_invoker = on);
ALTER VIEW public.admin_global_financial_metrics SET (security_invoker = on);
REVOKE ALL ON public.pizzeria_financial_metrics FROM anon;
REVOKE ALL ON public.admin_global_financial_metrics FROM anon;

COMMIT;
