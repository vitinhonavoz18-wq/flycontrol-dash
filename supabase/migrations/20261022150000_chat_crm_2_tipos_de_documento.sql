-- ============================================================================
-- CHAT CRM 2.0 — a pasta do Chat passa a aceitar Word, Excel e texto
--
-- O QUE MUDA: o cliente que manda um orçamento em Word ou uma planilha em
-- Excel pelo WhatsApp passa a ter o arquivo aberto/baixado pelo painel. Antes,
-- só foto, áudio, vídeo e PDF cabiam na pasta.
--
-- O QUE NÃO MUDA: a pasta continua FECHADA (nada público), o limite de 20 MB
-- continua, e as regras "cada loja só mexe na própria pasta" continuam as
-- mesmas. Nenhuma mensagem, conversa ou arquivo é alterado.
--
-- É OPCIONAL. Sem ela, o Chat CRM 2.0 funciona do mesmo jeito; só os
-- documentos de Word/Excel/texto aparecem como "veja no celular".
--
-- Para desfazer: docs/REVERTER-NO-SUPABASE-chat-crm-2.sql
-- ============================================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'image/jpeg','image/jpg','image/png','image/webp','image/gif',
      'audio/ogg','audio/mpeg','audio/mp4','audio/webm','audio/wav','audio/aac',
      'video/mp4','video/webm','video/quicktime',
      'application/pdf',
      -- novos:
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain','text/csv'
    ],
    public = FALSE
WHERE id = 'crm-chat-media';
