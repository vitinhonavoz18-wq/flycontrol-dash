-- DESFAZER a Etapa 1 da auditoria (20260901120000_trancar_coluna_is_admin.sql).
--
-- ESTE ARQUIVO NÃO É UMA MIGRATION. Ele mora fora de supabase/migrations/ de
-- propósito: nada aqui roda sozinho. É o roteiro de volta, escrito junto com o
-- de ida, para o caso de a correção causar algum efeito que não previmos.
--
-- Rodar isto devolve exatamente o estado anterior: qualquer usuário logado
-- volta a conseguir marcar a si mesmo como administrador do FlyControl. Ou
-- seja, é a reabertura da falha SEC-01 — só use se algo realmente quebrar, e
-- avise antes de deixar assim.
--
-- Nenhum dado é tocado, nem na ida nem na volta.

DROP TRIGGER IF EXISTS trg_protect_is_admin_column ON public.profiles;
DROP FUNCTION IF EXISTS public.protect_is_admin_column();
