-- =============================================================================
-- APLICAR NO SUPABASE (SQL Editor) — Chat CRM 2.0: Word, Excel e texto no Chat
-- Projeto: knhenchgntttraaeewlj (FlyControl)
--
-- É a migration supabase/migrations/20261022150000_chat_crm_2_tipos_de_documento.sql
-- numa transação única, com conferência no fim. OPCIONAL: o código novo
-- funciona sem ela (documentos de Word/Excel só aparecem como "veja no
-- celular"). Pode rodar de novo sem problema.
--
-- Não toca em nenhuma mensagem, conversa, cliente ou arquivo. Só aumenta a
-- lista de tipos de arquivo que a pasta FECHADA do Chat aceita.
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '10s';

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'image/jpeg','image/jpg','image/png','image/webp','image/gif',
      'audio/ogg','audio/mpeg','audio/mp4','audio/webm','audio/wav','audio/aac',
      'video/mp4','video/webm','video/quicktime',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain','text/csv'
    ],
    public = FALSE
WHERE id = 'crm-chat-media';

-- Conferência: a pasta continua fechada, com 20 MB, e aceita os novos tipos.
DO $$
DECLARE
  b storage.buckets%ROWTYPE;
BEGIN
  SELECT * INTO b FROM storage.buckets WHERE id = 'crm-chat-media';
  IF b.id IS NULL THEN RAISE EXCEPTION 'pasta crm-chat-media não existe'; END IF;
  IF b.public THEN RAISE EXCEPTION 'a pasta ficou pública — desfazendo'; END IF;
  IF b.file_size_limit IS DISTINCT FROM 20971520 THEN RAISE EXCEPTION 'limite mudou — desfazendo'; END IF;
  IF NOT ('application/pdf' = ANY(b.allowed_mime_types)
          AND 'text/plain' = ANY(b.allowed_mime_types)) THEN
    RAISE EXCEPTION 'tipos não aplicados — desfazendo';
  END IF;
END $$;

COMMIT;
