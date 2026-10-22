-- =============================================================================
-- REVERTER NO SUPABASE — volta a pasta do Chat à lista de tipos anterior
-- (foto, áudio, vídeo e PDF). Arquivos de Word/Excel já guardados continuam
-- lá e continuam abrindo; só param de entrar novos.
-- =============================================================================
BEGIN;
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'image/jpeg','image/jpg','image/png','image/webp','image/gif',
      'audio/ogg','audio/mpeg','audio/mp4','audio/webm','audio/wav','audio/aac',
      'video/mp4','video/webm','video/quicktime',
      'application/pdf'
    ]
WHERE id = 'crm-chat-media';
COMMIT;
