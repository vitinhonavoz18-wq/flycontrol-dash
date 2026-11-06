-- ═══════════════════════════════════════════════════════════════════════════
-- DESFAZ a MAYA 2.0 no banco.
--
-- ⚠️ APAGA o histórico de conversas da MAYA 2.0 (só dela — nenhuma tabela
-- antiga é tocada). Antes de rodar, troque MAYA_V2_MODO para "desligado" no
-- Cloudflare, senão as rotas vão tentar gravar em tabelas que não existem.
--
-- Normalmente NÃO é preciso rodar isto para voltar atrás: desligar a chave
-- MAYA_V2_MODO já tira a MAYA 2.0 do ar. Use só se quiser remover tudo.
-- ═══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS public.maya_eventos;
DROP TABLE IF EXISTS public.maya_mensagens;
DROP TABLE IF EXISTS public.maya_turnos;
DROP TABLE IF EXISTS public.maya_conversas;
