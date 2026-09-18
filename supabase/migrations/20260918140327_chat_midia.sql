-- ============================================================================
-- ÁUDIO, FOTO E ARQUIVO NO CHAT
--
-- O ESTRAGO QUE ISTO CONSERTA: quando o cliente mandava um áudio, a mensagem
-- chegava VAZIA no painel — um balão em branco, sem som e sem texto. O lojista
-- via um espaço vazio e não tinha como saber que alguém tinha falado com ele.
--
-- Três peças entram:
--
--   1. uma PASTA para os arquivos que a loja manda pelo painel;
--   2. a fila de saída passando a carregar o arquivo junto da mensagem;
--   3. uma função para o fluxo ANEXAR à mensagem o que entendeu do áudio.
--
-- A PASTA É FECHADA. Nada aqui é público: cada arquivo é entregue por um
-- endereço assinado com hora para vencer. Foto de comprovante de cliente em
-- pasta aberta é documento de gente na calçada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A PASTA DOS ARQUIVOS DO CHAT
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'crm-chat-media', 'crm-chat-media', FALSE, 20971520,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif',
        'audio/ogg','audio/mpeg','audio/mp4','audio/webm','audio/wav','audio/aac',
        'video/mp4','video/webm','video/quicktime',
        'application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = FALSE,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- CADA LOJA MEXE SÓ NA PRÓPRIA PASTA.
--
-- O caminho do arquivo começa pelo número da loja, e é nisso que a regra se
-- apoia: `(storage.foldername(name))[1]` é a primeira pasta do caminho. Sem
-- essa amarra, qualquer lojista leria o comprovante que o cliente do vizinho
-- mandou.
DROP POLICY IF EXISTS crm_chat_media_read ON storage.objects;
CREATE POLICY crm_chat_media_read ON storage.objects
  FOR SELECT USING (
    bucket_id = 'crm-chat-media'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.pizzerias p
        WHERE p.id::text = (storage.foldername(name))[1]
          AND p.owner_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS crm_chat_media_write ON storage.objects;
CREATE POLICY crm_chat_media_write ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'crm-chat-media'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.pizzerias p
        WHERE p.id::text = (storage.foldername(name))[1]
          AND p.owner_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS crm_chat_media_delete ON storage.objects;
CREATE POLICY crm_chat_media_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'crm-chat-media'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.pizzerias p
        WHERE p.id::text = (storage.foldername(name))[1]
          AND p.owner_id = auth.uid()
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 2. ONDE O ARQUIVO MORA (o caminho, não o endereço)
--
--    O endereço assinado VENCE. Guardar o endereço seria guardar o cupom do
--    estacionamento: vale hoje, amanhã não abre a cancela. O que fica guardado
--    é o CAMINHO dentro da pasta, e o endereço é assinado na hora de usar.
-- ----------------------------------------------------------------------------
ALTER TABLE public.crm_messages
  ADD COLUMN IF NOT EXISTS media_path TEXT;

COMMENT ON COLUMN public.crm_messages.media_path IS
  'Caminho do arquivo em crm-chat-media. O endereço assinado é gerado na hora.';

-- ----------------------------------------------------------------------------
-- 3. A FILA DE SAÍDA PASSA A LEVAR O ARQUIVO
--
--    Sem isso o fluxo recebia só o texto e não tinha como mandar a foto.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.crm_next_outbox(UUID, INT, TEXT, INT);

CREATE OR REPLACE FUNCTION public.crm_next_outbox(
  p_tenant_id UUID,
  p_limit INT DEFAULT 50,
  p_worker TEXT DEFAULT 'n8n',
  p_lease_seconds INT DEFAULT 300
)
RETURNS TABLE (
  message_id UUID,
  conversation_id UUID,
  tenant_id UUID,
  phone_e164 TEXT,
  contact_name TEXT,
  body TEXT,
  media_url TEXT,
  media_type TEXT,
  media_path TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ids UUID[];
BEGIN
  IF NOT public.company_has_crm_chat(p_tenant_id) THEN
    RETURN;
  END IF;

  WITH elegiveis AS (
    SELECT m.id
    FROM public.crm_messages m
    WHERE m.tenant_id = p_tenant_id
      AND m.direction = 'out'
      AND m.status IN ('queued', 'sending')
      AND (m.lease_until IS NULL OR m.lease_until < now())
    ORDER BY m.created_at
    LIMIT GREATEST(p_limit, 1)
    FOR UPDATE SKIP LOCKED
  ), marcadas AS (
    UPDATE public.crm_messages m
    SET status = 'sending',
        lease_until = now() + make_interval(secs => GREATEST(p_lease_seconds, 30)),
        lease_worker = p_worker,
        updated_at = now()
    FROM elegiveis e
    WHERE m.id = e.id
    RETURNING m.id
  )
  SELECT array_agg(id) INTO ids FROM marcadas;

  IF ids IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.id, m.conversation_id, m.tenant_id, cl.phone_e164, cl.name,
         m.body, m.media_url, m.media_type, m.media_path
  FROM public.crm_messages m
  JOIN public.crm_conversations cv ON cv.id = m.conversation_id
  JOIN public.marketing_customers cl ON cl.id = cv.customer_id
  WHERE m.id = ANY(ids)
  ORDER BY m.created_at;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. ANEXAR À MENSAGEM O QUE A IA ENTENDEU DO ÁUDIO OU DA FOTO
--
--    A mensagem já foi registrada quando chegou (vazia, porque áudio não tem
--    texto). Depois o fluxo baixa, transcreve e volta aqui para preencher.
--
--    Preenche, não sobrescreve: se a mensagem já tinha texto, o texto fica.
--    Uma transcrição que apaga o que o cliente escreveu é pior que nenhuma.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_attach_media(
  p_tenant_id UUID,
  p_external_id TEXT,
  p_media_url TEXT DEFAULT NULL,
  p_media_type TEXT DEFAULT NULL,
  p_transcricao TEXT DEFAULT NULL
)
RETURNS TABLE (message_id UUID, conversation_id UUID, atualizada BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg public.crm_messages%ROWTYPE;
  v_texto TEXT;
BEGIN
  IF COALESCE(TRIM(p_external_id), '') = '' THEN
    RAISE EXCEPTION 'external_id_vazio';
  END IF;

  SELECT * INTO v_msg
  FROM public.crm_messages m
  WHERE m.tenant_id = p_tenant_id AND m.external_id = p_external_id
  LIMIT 1;

  IF v_msg.id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE;
    RETURN;
  END IF;

  v_texto := COALESCE(NULLIF(TRIM(COALESCE(v_msg.body, '')), ''),
                      NULLIF(TRIM(COALESCE(p_transcricao, '')), ''));

  UPDATE public.crm_messages
  SET body = v_texto,
      media_url = COALESCE(NULLIF(TRIM(COALESCE(p_media_url, '')), ''), media_url),
      media_type = COALESCE(NULLIF(TRIM(COALESCE(p_media_type, '')), ''), media_type),
      updated_at = now()
  WHERE id = v_msg.id;

  -- A lista de conversas mostra o que foi FALADO, e não "Áudio". Saber o que
  -- o cliente disse sem precisar abrir é metade do atendimento.
  UPDATE public.crm_conversations
  SET last_message_preview = LEFT(
        COALESCE(NULLIF(TRIM(COALESCE(v_texto, '')), ''), '[arquivo]'), 140),
      updated_at = now()
  WHERE id = v_msg.conversation_id
    AND last_message_at <= v_msg.created_at + INTERVAL '5 minutes';

  RETURN QUERY SELECT v_msg.id, v_msg.conversation_id, TRUE;
END;
$$;
