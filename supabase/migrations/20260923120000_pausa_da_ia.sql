-- ============================================================================
-- A TRAVA DA IA PASSA A MORAR AQUI, E NÃO SÓ NO REDIS DO N8N
--
-- O DEFEITO: quando o atendente respondia PELO PAINEL, a IA continuava
-- respondendo junto. A trava ("um humano assumiu, IA quieta") era montada
-- dentro do n8n, com o Redis, a partir do aviso de "a loja mandou mensagem".
-- Só que a mensagem do painel sai pela UAZAPI como envio do sistema, e o
-- aviso da UAZAPI está configurado para NÃO devolver o que o sistema enviou
-- (`wasSentByApi`) — senão a resposta da IA voltaria como eco. Resultado: o
-- n8n nunca ficava sabendo que um humano falou, e a trava nunca era ligada.
--
-- Agora a conversa guarda até quando a IA fica quieta. Quem liga a trava:
--   - o atendente respondendo pelo painel;
--   - o dono respondendo pelo celular (chega como `from_me`);
--   - o botão "Pausar IA" na tela da conversa.
-- E o /api/crm/inbox devolve `ia_pausada` para o fluxo decidir.
--
-- Vazio (ou no passado) = a IA pode responder.
-- ============================================================================

ALTER TABLE public.crm_conversations
  ADD COLUMN IF NOT EXISTS ia_pausada_ate TIMESTAMPTZ;
