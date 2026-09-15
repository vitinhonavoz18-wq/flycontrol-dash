-- ============================================================================
-- UM CADASTRO SÓ DE CLIENTE
--
-- Até aqui a mesma pessoa existia duas vezes: uma na tabela do site
-- (`marketing_customers`, com pedidos e quanto já gastou) e outra na tabela do
-- Chat (`crm_contacts`, só com nome e telefone). Era a mesma pessoa em duas
-- fichas diferentes — como ter o caderno do delivery e o caderno do balcão, e
-- descobrir só no fim do mês que o "Seu João" dos dois é o mesmo Seu João.
--
-- A partir daqui existe UMA ficha por telefone, em `marketing_customers`:
--
--   * abrindo uma conversa no Chat, aparece quem é o cliente e o que ele já
--     comprou;
--   * quem só conversou pelo WhatsApp passa a aparecer na lista do Marketing.
--
-- QUEM SÓ CONVERSOU NÃO ENTRA EM CAMPANHA SOZINHO. A ficha nasce com
-- `marketing_opt_in = false`. Quem mandou "vocês abrem que horas?" não pediu
-- para receber promoção, e disparar mesmo assim é o caminho mais curto para o
-- número da loja ser bloqueado no WhatsApp.
--
-- NOME TRAVADO (`name_locked`): quando alguém corrige o nome à mão no painel,
-- o WhatsApp nunca mais sobrescreve. É a etiqueta escrita a caneta em cima da
-- etiqueta impressa: a partir dali, vale a caneta.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A FICHA ÚNICA GANHA DUAS MARCAS NOVAS
-- ----------------------------------------------------------------------------
ALTER TABLE public.marketing_customers
  ADD COLUMN IF NOT EXISTS name_locked BOOLEAN NOT NULL DEFAULT false;

-- Quando a pessoa falou pela última vez no Chat. Diferente de
-- `last_message_at`, que o Marketing usa para campanha enviada.
ALTER TABLE public.marketing_customers
  ADD COLUMN IF NOT EXISTS last_chat_at TIMESTAMPTZ;

COMMENT ON COLUMN public.marketing_customers.name_locked IS
  'Nome corrigido à mão no painel: o WhatsApp não sobrescreve mais.';
COMMENT ON COLUMN public.marketing_customers.last_chat_at IS
  'Última mensagem trocada no Chat (CRM). Campanha usa last_message_at.';

-- ----------------------------------------------------------------------------
-- 2. AS FICHAS DO CHAT ENTRAM NA FICHA ÚNICA
--
--    Quem já existia pelo site continua com os dados do site: o nome vindo do
--    WhatsApp só preenche quem estava sem nome. Um pedido antigo com o nome
--    certo vale mais que um apelido do WhatsApp.
-- ----------------------------------------------------------------------------
INSERT INTO public.marketing_customers (
  tenant_id, phone_e164, phone_raw, name, notes, tags,
  source, is_mobile, marketing_opt_in, status, created_at
)
SELECT
  c.tenant_id,
  c.phone_e164,
  c.phone_e164,
  NULLIF(TRIM(COALESCE(c.name, '')), ''),
  c.notes,
  COALESCE(c.tags, '{}'),
  'whatsapp',
  TRUE,
  FALSE,
  'active',
  c.created_at
FROM public.crm_contacts c
ON CONFLICT (tenant_id, phone_e164) DO UPDATE
  SET name  = COALESCE(public.marketing_customers.name, EXCLUDED.name),
      notes = COALESCE(public.marketing_customers.notes, EXCLUDED.notes),
      updated_at = now();

-- ----------------------------------------------------------------------------
-- 3. AS CONVERSAS PASSAM A APONTAR PARA A FICHA ÚNICA
-- ----------------------------------------------------------------------------
ALTER TABLE public.crm_conversations
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.marketing_customers(id) ON DELETE CASCADE;

UPDATE public.crm_conversations cv
SET customer_id = m.id
FROM public.crm_contacts c
JOIN public.marketing_customers m
  ON m.tenant_id = c.tenant_id AND m.phone_e164 = c.phone_e164
WHERE cv.contact_id = c.id
  AND cv.customer_id IS NULL;

-- Conversa órfã (contato apagado no meio do caminho) não pode travar a
-- migração inteira nem virar lixo silencioso: some junto com o contato.
DELETE FROM public.crm_conversations WHERE customer_id IS NULL;

ALTER TABLE public.crm_conversations ALTER COLUMN customer_id SET NOT NULL;

-- Uma conversa por pessoa, como era antes — só que agora a "pessoa" é a ficha
-- única. Sem isto, a mesma pessoa poderia ter duas conversas abertas e metade
-- do histórico ficaria escondida em uma delas.
DROP INDEX IF EXISTS crm_conversations_tenant_contact_key;
CREATE UNIQUE INDEX IF NOT EXISTS crm_conversations_tenant_customer_key
  ON public.crm_conversations(tenant_id, customer_id);

ALTER TABLE public.crm_conversations DROP COLUMN IF EXISTS contact_id;

-- ----------------------------------------------------------------------------
-- 3b. DE ONDE SAIU CADA RESPOSTA
--
--     Três bocas respondem pela loja: o painel, a IA e o celular do dono. As
--     três gravam uma mensagem "de saída", e sem um carimbo a tela não tem como
--     saber qual foi qual — a resposta digitada no celular apareceria como se
--     fosse da IA.
--
--     Dava para deduzir pela ausência de assinatura, mas deduzir é frágil: no
--     dia em que aparecer uma quarta boca, a dedução erra calada. O carimbo
--     diz.
-- ----------------------------------------------------------------------------
ALTER TABLE public.crm_messages
  ADD COLUMN IF NOT EXISTS origin TEXT;

COMMENT ON COLUMN public.crm_messages.origin IS
  'Quem respondeu: painel | ia | celular. Vazio nas mensagens que chegam.';

-- ----------------------------------------------------------------------------
-- 4. MENSAGEM CHEGANDO — agora sabendo quem é o dono da voz
--
--    `p_from_me` é a correção de um defeito real: o WhatsApp avisa também
--    sobre a mensagem que o DONO digitou no celular dele. Ela estava sendo
--    gravada como se o cliente tivesse falado — e, pior, o nome do cliente era
--    sobrescrito pelo nome da loja. Era o garçom anotando a própria fala na
--    linha do cliente da comanda.
-- ----------------------------------------------------------------------------
-- A versão antiga tinha 7 campos; esta tem 8. Sem apagar a antiga, o Postgres
-- ficaria com as DUAS e não saberia qual chamar — a chamada quebraria com
-- "função ambígua". É a placa de rua duplicada: o endereço existe duas vezes e
-- o entregador não sabe em qual bater.
DROP FUNCTION IF EXISTS public.crm_receive_message(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.crm_receive_message(
  p_tenant_id UUID,
  p_phone_e164 TEXT,
  p_body TEXT,
  p_contact_name TEXT DEFAULT NULL,
  p_external_id TEXT DEFAULT NULL,
  p_media_url TEXT DEFAULT NULL,
  p_media_type TEXT DEFAULT NULL,
  p_from_me BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (message_id UUID, conversation_id UUID, duplicada BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente UUID;
  v_conversa UUID;
  v_msg UUID;
  v_existente UUID;
  v_nome TEXT;
BEGIN
  IF NOT public.company_has_crm_chat(p_tenant_id) THEN
    RAISE EXCEPTION 'crm_nao_contratado';
  END IF;

  IF COALESCE(TRIM(p_phone_e164), '') = '' THEN
    RAISE EXCEPTION 'telefone_vazio';
  END IF;

  -- O nome que vem junto de uma mensagem do PRÓPRIO dono é o nome do perfil
  -- DELE, não do cliente. Aceitá-lo foi exatamente o que gravou "flycontrol"
  -- como nome de três clientes diferentes.
  v_nome := CASE WHEN p_from_me THEN NULL
                 ELSE NULLIF(TRIM(COALESCE(p_contact_name, '')), '') END;

  -- O mesmo recado entregue duas vezes (o n8n tentou de novo depois de uma
  -- queda de internet) não vira duas mensagens na tela.
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
                 -- Nome corrigido à mão manda. Sempre.
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
    -- Digitada pelo dono no celular dele: é resposta da loja, e aparece do
    -- lado da loja na tela, carimbada como "pelo celular".
    CASE WHEN p_from_me THEN 'out' ELSE 'in' END,
    p_body, p_media_url, p_media_type,
    CASE WHEN p_from_me THEN 'sent' ELSE 'received' END,
    p_external_id, now(),
    CASE WHEN p_from_me THEN 'celular' ELSE NULL END
  )
  RETURNING id INTO v_msg;

  UPDATE public.crm_conversations
  SET last_message_at = now(),
      last_message_preview = LEFT(COALESCE(p_body, '[mídia]'), 140),
      -- Cliente que responde reabre a conversa: fechada com o cliente falando
      -- é mesa marcada como livre com gente sentada nela. Já a fala do dono
      -- não conta como "não lida" — ele acabou de escrever.
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
$$;

-- ----------------------------------------------------------------------------
-- 5. A FILA DE SAÍDA lê o nome da ficha única
-- ----------------------------------------------------------------------------
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
  media_type TEXT
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
  SELECT
    m.id,
    m.conversation_id,
    m.tenant_id,
    cl.phone_e164,
    cl.name,
    m.body,
    m.media_url,
    m.media_type
  FROM public.crm_messages m
  JOIN public.crm_conversations cv ON cv.id = m.conversation_id
  JOIN public.marketing_customers cl ON cl.id = cv.customer_id
  WHERE m.id = ANY(ids)
  ORDER BY m.created_at;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. CORRIGIR O NOME PELO PAINEL
--
--    Passa por função do banco (e não por um UPDATE solto) porque três coisas
--    precisam acontecer juntas: conferir que a ficha é MESMO daquela loja,
--    gravar o nome e travar o nome. Fazer isso em três comandos soltos abre a
--    porta para gravar o nome e esquecer a tranca.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_rename_customer(
  p_tenant_id UUID,
  p_customer_id UUID,
  p_name TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  afetadas INT;
  v_nome TEXT;
BEGIN
  v_nome := NULLIF(TRIM(COALESCE(p_name, '')), '');

  UPDATE public.marketing_customers
  SET name = v_nome,
      -- Apagar o nome destrava: volta a valer o que o WhatsApp informar.
      name_locked = (v_nome IS NOT NULL),
      notes = COALESCE(NULLIF(TRIM(COALESCE(p_notes, '')), ''), notes),
      updated_at = now()
  WHERE id = p_customer_id
    AND tenant_id = p_tenant_id;

  GET DIAGNOSTICS afetadas = ROW_COUNT;
  RETURN afetadas > 0;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. A TABELA ANTIGA SAI DE CENA
--
--    Os dados já foram copiados no passo 2. Deixá-la viva seria manter dois
--    cadernos de novo — e alguém acabaria escrevendo no caderno errado.
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.crm_contacts CASCADE;

-- ----------------------------------------------------------------------------
-- 8. A FICHA ÚNICA APARECE NO CHAT EM TEMPO REAL
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'marketing_customers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.marketing_customers;
  END IF;
END $$;
