-- ============================================================================
-- A LISTA DE CONVERSAS DIZENDO "ÁUDIO" EM VEZ DE NADA
--
-- O DEFEITO: a prévia da conversa usava COALESCE(p_body, '[mídia]'). Só que o
-- fluxo do n8n manda o texto VAZIO ("") quando a mensagem é um áudio — e
-- vazio não é nulo. O COALESCE dava o vazio por bom, e a linha da conversa
-- ficava em branco.
--
-- É o caderno de recados com a linha riscada em branco: alguém ligou, e
-- ninguém sabe quem nem por quê.
--
-- Agora vazio vira o rótulo do que chegou: "Áudio", "Foto", "Vídeo",
-- "Arquivo". Quando a transcrição voltar (crm_attach_media), o rótulo dá
-- lugar ao que foi realmente dito.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.crm_receive_message(
  p_tenant_id uuid,
  p_phone_e164 text,
  p_body text,
  p_contact_name text DEFAULT NULL::text,
  p_external_id text DEFAULT NULL::text,
  p_media_url text DEFAULT NULL::text,
  p_media_type text DEFAULT NULL::text,
  p_from_me boolean DEFAULT false
)
RETURNS TABLE(message_id uuid, conversation_id uuid, duplicada boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cliente UUID;
  v_conversa UUID;
  v_msg UUID;
  v_existente UUID;
  v_nome TEXT;
  v_previa TEXT;
BEGIN
  IF NOT public.company_has_crm_chat(p_tenant_id) THEN
    RAISE EXCEPTION 'crm_nao_contratado';
  END IF;

  IF COALESCE(TRIM(p_phone_e164), '') = '' THEN
    RAISE EXCEPTION 'telefone_vazio';
  END IF;

  v_nome := CASE WHEN p_from_me THEN NULL
                 ELSE NULLIF(TRIM(COALESCE(p_contact_name, '')), '') END;

  IF p_external_id IS NOT NULL THEN
    SELECT m.id, m.conversation_id INTO v_existente, v_conversa
    FROM public.crm_messages m
    WHERE m.tenant_id = p_tenant_id AND m.external_id = p_external_id
    LIMIT 1;

    IF v_existente IS NOT NULL THEN
      RETURN QUERY SELECT v_existente, v_conversa, TRUE;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.marketing_customers (
    tenant_id, phone_e164, phone_raw, name, source, is_mobile,
    marketing_opt_in, status, last_chat_at
  )
  VALUES (
    p_tenant_id, p_phone_e164, p_phone_e164, v_nome, 'whatsapp', TRUE,
    FALSE, 'active', now()
  )
  ON CONFLICT (tenant_id, phone_e164) DO UPDATE
    SET name = CASE
                 WHEN public.marketing_customers.name_locked THEN public.marketing_customers.name
                 ELSE COALESCE(public.marketing_customers.name, EXCLUDED.name)
               END,
        last_chat_at = now(),
        updated_at = now()
  RETURNING id INTO v_cliente;

  INSERT INTO public.crm_conversations (tenant_id, customer_id, status)
  VALUES (p_tenant_id, v_cliente, 'open')
  ON CONFLICT (tenant_id, customer_id) DO UPDATE
    SET updated_at = now()
  RETURNING id INTO v_conversa;

  INSERT INTO public.crm_messages (
    tenant_id, conversation_id, direction, body, media_url, media_type,
    status, external_id, delivered_at, origin
  )
  VALUES (
    p_tenant_id, v_conversa,
    CASE WHEN p_from_me THEN 'out' ELSE 'in' END,
    -- Texto vazio vira NULO na hora de gravar. Guardar "" é guardar a
    -- aparência de um recado que não existe.
    NULLIF(TRIM(COALESCE(p_body, '')), ''),
    p_media_url, p_media_type,
    CASE WHEN p_from_me THEN 'sent' ELSE 'received' END,
    p_external_id, now(),
    CASE WHEN p_from_me THEN 'celular' ELSE NULL END
  )
  RETURNING id INTO v_msg;

  -- A PRÉVIA: o que foi escrito; se nada foi escrito, o que chegou.
  v_previa := COALESCE(
    NULLIF(TRIM(COALESCE(p_body, '')), ''),
    CASE LOWER(COALESCE(p_media_type, ''))
      WHEN 'audio'    THEN 'Áudio'
      WHEN 'image'    THEN 'Foto'
      WHEN 'video'    THEN 'Vídeo'
      WHEN 'document' THEN 'Arquivo'
      ELSE NULL
    END,
    '[mídia]'
  );

  UPDATE public.crm_conversations
  SET last_message_at = now(),
      last_message_preview = LEFT(v_previa, 140),
      unread_count = CASE WHEN p_from_me THEN 0 ELSE unread_count + 1 END,
      status = CASE
                 WHEN p_from_me THEN status
                 WHEN status = 'closed' THEN 'open'
                 ELSE status
               END,
      updated_at = now()
  WHERE id = v_conversa;

  RETURN QUERY SELECT v_msg, v_conversa, FALSE;
END;
$function$;
