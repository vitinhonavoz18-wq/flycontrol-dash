-- ============================================================================
-- FLYCONTROL — CHAT (CRM) + CONEXÃO DO WHATSAPP POR QR CODE
-- SQL completo para colar no Supabase (SQL Editor)
--
-- COMO USAR
--   1. Abra o Supabase do FlyControl
--   2. Menu da esquerda -> SQL Editor -> New query
--   3. Cole TUDO que está neste arquivo, de uma vez só
--   4. Clique em RUN
--
-- É SEGURO RODAR DUAS VEZES. Se você rodar de novo por engano, nada quebra e
-- nada é apagado: cada pedaço confere antes se já existe. É o caderno de
-- reservas que, ao receber o mesmo nome duas vezes, simplesmente mantém a
-- reserva que já estava lá em vez de criar outra.
--
-- NÃO APAGA NADA do que já existe. Só acrescenta tabelas novas e duas colunas
-- numa tabela que já existia (marketing_whatsapp_instances).
-- ============================================================================


-- ####################################################################
-- PARTE 1 de 2 — 20260911120000_crm_chat_fundacao
-- ####################################################################

-- ============================================================================
-- CRM / Chat — a fundação
--
-- O QUE ESTA MUDANÇA CRIA, EM PORTUGUÊS
--
-- 1. Uma FICHA DE RECURSO EXTRA por restaurante (company_addons). Até hoje o
--    sistema só sabia responder "essa loja é premium ou é cents?". Agora ele
--    sabe responder também "essa loja premium contratou o Chat?". É a ficha
--    grampeada no contrato: o contrato é o plano, a ficha diz o que foi
--    comprado fora do combo.
--
-- 2. O CADERNO DE CONVERSAS do CRM: contatos, conversas e mensagens.
--
-- 3. A ETIQUETA DO FLUXO do n8n de cada restaurante — qual fluxo pertence a
--    quem. Cada loja tem o seu, e um nunca alcança o do outro.
--
-- A REGRA DE OURO DESTE ARQUIVO
--
-- Toda tabela nova carrega `tenant_id` (o restaurante dono) e toda regra de
-- acesso confere esse dono. Um restaurante nunca enxerga a conversa do
-- vizinho — nem por engano, nem digitando endereço na mão, nem falando direto
-- com o banco. É o caderno de comandas que fica atrás do balcão de cada loja,
-- não numa prateleira compartilhada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RECURSOS CONTRATADOS À PARTE
--
-- Uma linha por (restaurante, recurso). Desligar NÃO apaga a linha: muda o
-- status para 'suspended'. Assim, se o cliente voltar, a ficha antiga está
-- lá com a data em que ele contratou pela primeira vez — como guardar o
-- contrato antigo na gaveta em vez de rasgar.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  -- 'crm_chat' hoje. Outros recursos pagos à parte entram aqui sem tabela nova.
  addon TEXT NOT NULL,
  -- 'active' = contratado e funcionando. 'suspended' = desligado, dados intactos.
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  suspended_at TIMESTAMPTZ,
  -- Quem ligou/desligou, para o dia em que alguém perguntar "quem autorizou?".
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Um recurso não pode ser contratado duas vezes pela mesma loja. É o caderno
-- de reservas aceitando um nome por mesa: se tentar escrever dois, a caneta
-- trava.
CREATE UNIQUE INDEX IF NOT EXISTS company_addons_tenant_addon_key
  ON public.company_addons(tenant_id, addon);

CREATE INDEX IF NOT EXISTS company_addons_ativos_idx
  ON public.company_addons(addon, tenant_id) WHERE status = 'active';

-- ----------------------------------------------------------------------------
-- A pergunta que o banco inteiro vai fazer o tempo todo:
-- "esta loja pode usar o Chat?"
--
-- Responder aqui dentro, num lugar só, é o que impede a regra de virar duas
-- regras diferentes em dois lugares — e um dia discordarem entre si.
--
-- Responde SIM quando as duas coisas valem juntas:
--   a) o plano da loja inclui o recurso (premium ou legado; cents não inclui);
--   b) a ficha do addon está ativa.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_has_crm_chat(p_tenant_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pizzerias p
    JOIN public.company_addons a
      ON a.tenant_id = p.id AND a.addon = 'crm_chat' AND a.status = 'active'
    WHERE p.id = p_tenant_id
      -- 'cents' é o único plano vendido com restrição. Um valor inesperado
      -- (empresas antigas) cai em "pode", pela mesma razão já documentada em
      -- src/lib/planPermissions.ts: derrubar quem paga é pior do que liberar
      -- demais até a migração administrativa acontecer.
      AND COALESCE(p.plan_type, '') <> 'cents'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.company_has_crm_chat(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_has_crm_chat(UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. A ETIQUETA DO FLUXO DO n8n DE CADA LOJA
--
-- Aqui NÃO se guarda segredo de valor. O endereço de entrega (webhook) do
-- fluxo é guardado porque o FlyControl precisa dele; a chave que abre a porta
-- do FlyControl continua morando só no ambiente do servidor.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_n8n_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  -- Como o fluxo se chama lá dentro do n8n, para o suporte achar rápido.
  workflow_id TEXT,
  workflow_name TEXT,
  -- A SENHA DESTA LOJA, diferente da de todas as outras.
  --
  -- É o que impede o fluxo de um restaurante de pedir as conversas de outro
  -- só trocando um número na chamada. Uma chave só para todo mundo seria a
  -- mesma chave de quarto para todos os hóspedes do hotel.
  --
  -- Quem lê esta coluna é SÓ o servidor. Nem o dono da loja enxerga (ver a
  -- regra de leitura lá embaixo): ele não precisa, e o que ninguém vê ninguém
  -- cola no grupo do WhatsApp por engano.
  webhook_token TEXT,
  -- 'active' | 'paused'. Perder o CRM PAUSA o fluxo; nunca apaga.
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  -- Última vez que o n8n deu sinal de vida. É por aqui que a tela sabe dizer
  -- "faz 3 horas que o WhatsApp não responde".
  last_seen_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_n8n_links_tenant_key
  ON public.crm_n8n_links(tenant_id);

-- ----------------------------------------------------------------------------
-- 3. CONTATOS — quem já falou com o restaurante
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  -- Já no formato pronto do WhatsApp: 55 + DDD + número, só dígitos.
  phone_e164 TEXT NOT NULL,
  name TEXT,
  notes TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- O mesmo telefone é um contato só dentro da mesma loja — mas dois
-- restaurantes diferentes podem ter o mesmo cliente, cada um com a sua ficha.
CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_tenant_phone_key
  ON public.crm_contacts(tenant_id, phone_e164);

-- ----------------------------------------------------------------------------
-- 4. CONVERSAS — uma linha da lista da esquerda da tela
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  -- 'open' = precisa de atenção. 'pending' = esperando o cliente responder.
  -- 'closed' = resolvido.
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
  -- Quem da equipe está cuidando. Vazio = ninguém pegou ainda.
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  -- Quantas o restaurante ainda não leu. É a bolinha vermelha da tela.
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uma conversa por contato, por loja. Sem isso, duas mensagens chegando no
-- mesmo segundo abririam duas conversas paralelas do mesmo cliente.
CREATE UNIQUE INDEX IF NOT EXISTS crm_conversations_tenant_contact_key
  ON public.crm_conversations(tenant_id, contact_id);

CREATE INDEX IF NOT EXISTS crm_conversations_lista_idx
  ON public.crm_conversations(tenant_id, last_message_at DESC NULLS LAST);

-- ----------------------------------------------------------------------------
-- 5. MENSAGENS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.crm_conversations(id) ON DELETE CASCADE,
  -- 'in' = o cliente mandou. 'out' = o restaurante respondeu.
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  body TEXT,
  media_url TEXT,
  media_type TEXT,
  -- Caminho de uma mensagem que sai: 'queued' (na fila) → 'sending' (o n8n
  -- pegou) → 'sent' / 'failed'. Mensagem que chega já nasce 'received'.
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'received')),
  error_message TEXT,
  -- Quem digitou, quando foi alguém da equipe.
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- O número que o WhatsApp deu para a mensagem, para o n8n não entregar o
  -- mesmo recado duas vezes.
  external_id TEXT,
  -- Reserva do entregador: enquanto vale, ninguém mais pega esta mensagem.
  lease_until TIMESTAMPTZ,
  lease_worker TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_messages_conversa_idx
  ON public.crm_messages(conversation_id, created_at);

-- A fila que o n8n vem buscar: só o que está esperando para sair.
CREATE INDEX IF NOT EXISTS crm_messages_fila_idx
  ON public.crm_messages(tenant_id, status, created_at)
  WHERE direction = 'out' AND status IN ('queued', 'sending');

-- O mesmo recado do WhatsApp nunca vira duas mensagens no caderno.
CREATE UNIQUE INDEX IF NOT EXISTS crm_messages_external_key
  ON public.crm_messages(tenant_id, external_id)
  WHERE external_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 6. A DATA DE "ÚLTIMA ALTERAÇÃO" SE ATUALIZA SOZINHA
--    (mesmo gatilho já usado pelas tabelas de Marketing)
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    FOREACH t IN ARRAY ARRAY[
      'company_addons',
      'crm_n8n_links',
      'crm_contacts',
      'crm_conversations',
      'crm_messages'
    ] LOOP
      EXECUTE format(
        'DROP TRIGGER IF EXISTS trg_%1$s_updated ON public.%1$s;
         CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON public.%1$s
         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', t
      );
    END LOOP;
  END IF;
END $$;

-- ============================================================================
-- 7. AS TRANCAS DO BANCO (RLS)
--
-- Esta é a última tranca, e a que vale mesmo. Esconder a aba no painel é
-- decoração: quem souber falar direto com o banco ignora a tela inteira.
-- Aqui, o banco em pessoa recusa.
--
-- São duas trancas em série, e as duas precisam abrir:
--
--   TRANCA 1 (permissiva): "você é o dono desta loja?" — o porteiro conferindo
--   o nome na lista.
--
--   TRANCA 2 (restritiva): "esta loja contratou o Chat?" — o ingresso da
--   sessão. Ter nome na lista não basta se o ingresso é de outro dia.
-- ============================================================================
ALTER TABLE public.company_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_n8n_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_messages ENABLE ROW LEVEL SECURITY;

-- TRANCA 1 — leitura para o dono da loja (e para o administrador).
DO $$
DECLARE t TEXT;
BEGIN
  -- `crm_n8n_links` NÃO entra nesta lista de propósito: ela guarda a senha da
  -- loja. Quem está logado no painel não lê essa tabela de jeito nenhum — o
  -- que ele precisa saber (se a conexão está no ar) chega pela função do
  -- servidor, que devolve só as colunas inofensivas.
  FOREACH t IN ARRAY ARRAY[
    'company_addons',
    'crm_contacts',
    'crm_conversations',
    'crm_messages'
  ] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "%1$s_select_policy" ON public.%1$s;
       CREATE POLICY "%1$s_select_policy" ON public.%1$s
         FOR SELECT TO authenticated
         USING (
           EXISTS (
             SELECT 1 FROM public.pizzerias p
             WHERE p.id = %1$s.tenant_id AND p.owner_id = auth.uid()
           )
           OR public.is_admin()
         );', t
    );
  END LOOP;
END $$;

-- Escrita das tabelas de conversa: o dono pode marcar como lida, assumir uma
-- conversa, fechar, anotar. Quem GRAVA MENSAGEM é sempre o servidor (com a
-- chave de serviço, depois da conferência) — por isso crm_messages não ganha
-- política de escrita para quem está logado.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_contacts', 'crm_conversations'] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "%1$s_write_policy" ON public.%1$s;
       CREATE POLICY "%1$s_write_policy" ON public.%1$s
         FOR ALL TO authenticated
         USING (
           EXISTS (SELECT 1 FROM public.pizzerias p
                   WHERE p.id = %1$s.tenant_id AND p.owner_id = auth.uid())
           OR public.is_admin()
         )
         WITH CHECK (
           EXISTS (SELECT 1 FROM public.pizzerias p
                   WHERE p.id = %1$s.tenant_id AND p.owner_id = auth.uid())
           OR public.is_admin()
         );', t
    );
  END LOOP;
END $$;

-- TRANCA 2 — o ingresso: sem plano + addon, o banco recusa MEXER (criar,
-- alterar, apagar). A leitura fica de fora de propósito: quem perdeu o CRM
-- não some com o histórico da tela do administrador nem com o próprio
-- histórico se voltar. É o mesmo desenho já usado no bloqueio de Mesas.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_contacts', 'crm_conversations', 'crm_messages'] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "%1$s_addon_gate_insert" ON public.%1$s;
       CREATE POLICY "%1$s_addon_gate_insert" ON public.%1$s
         AS RESTRICTIVE FOR INSERT TO authenticated
         WITH CHECK (public.is_admin() OR public.company_has_crm_chat(%1$s.tenant_id));

       DROP POLICY IF EXISTS "%1$s_addon_gate_update" ON public.%1$s;
       CREATE POLICY "%1$s_addon_gate_update" ON public.%1$s
         AS RESTRICTIVE FOR UPDATE TO authenticated
         USING (public.is_admin() OR public.company_has_crm_chat(%1$s.tenant_id));

       DROP POLICY IF EXISTS "%1$s_addon_gate_delete" ON public.%1$s;
       CREATE POLICY "%1$s_addon_gate_delete" ON public.%1$s
         AS RESTRICTIVE FOR DELETE TO authenticated
         USING (public.is_admin() OR public.company_has_crm_chat(%1$s.tenant_id));', t
    );
  END LOOP;
END $$;

-- Ligar e desligar o recurso é decisão comercial: SÓ o administrador da
-- plataforma. Sem isto, o próprio lojista poderia se dar o CRM de presente —
-- seria a mesma coisa que deixar o cliente carimbar o próprio cartão
-- fidelidade.
DROP POLICY IF EXISTS "company_addons_admin_write" ON public.company_addons;
CREATE POLICY "company_addons_admin_write" ON public.company_addons
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "crm_n8n_links_admin_write" ON public.crm_n8n_links;
CREATE POLICY "crm_n8n_links_admin_write" ON public.crm_n8n_links
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================================
-- 8. A FILA QUE O n8n VEM BUSCAR (mesmo desenho já usado no Marketing)
--
-- O FlyControl não sai enviando mensagem. Ele deixa a resposta do restaurante
-- pronta numa fila e o n8n passa perguntando "tem algo para eu levar?". É o
-- entregador passando na loja para pegar os pedidos prontos, em vez de a
-- cozinha correr atrás de cada moto.
--
-- A RESERVA é o que impede o mesmo recado de ser enviado duas vezes: quando o
-- n8n pega uma mensagem, ela fica reservada por alguns minutos. Se o n8n
-- travar no meio, a reserva vence sozinha e a mensagem volta para a fila —
-- nada fica preso, nada é enviado em dobro.
-- ============================================================================
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
  -- Loja sem o Chat contratado não tem fila nenhuma para entregar. A
  -- conferência acontece AQUI DENTRO também, e não só na porta de entrada:
  -- duas trancas na mesma porta é o que evita que esquecer uma abra a casa.
  IF NOT public.company_has_crm_chat(p_tenant_id) THEN
    RETURN;
  END IF;

  WITH escolhidas AS (
    SELECT m.id
    FROM public.crm_messages m
    WHERE m.tenant_id = p_tenant_id
      AND m.direction = 'out'
      AND m.status IN ('queued', 'sending')
      AND (m.lease_until IS NULL OR m.lease_until < now())
    ORDER BY m.created_at, m.id
    LIMIT GREATEST(1, LEAST(p_limit, 200))
    FOR UPDATE OF m SKIP LOCKED
  ),
  marcadas AS (
    UPDATE public.crm_messages m
    SET status = 'sending',
        lease_worker = p_worker,
        lease_until = now() + make_interval(secs => GREATEST(30, p_lease_seconds)),
        updated_at = now()
    FROM escolhidas e
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
    ct.phone_e164,
    ct.name,
    m.body,
    m.media_url,
    m.media_type
  FROM public.crm_messages m
  JOIN public.crm_conversations cv ON cv.id = m.conversation_id
  JOIN public.crm_contacts ct ON ct.id = cv.contact_id
  WHERE m.id = ANY(ids)
  ORDER BY m.created_at;
END;
$$;

-- ----------------------------------------------------------------------------
-- O n8n avisando o que aconteceu com cada mensagem.
--
-- Avisar duas vezes não muda nada: a mensagem já marcada como enviada
-- continua enviada. É o carimbo de "pago" na comanda — carimbar de novo não
-- cobra de novo.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_record_outbox_result(
  p_message_id UUID,
  p_tenant_id UUID,
  p_status TEXT,
  p_external_id TEXT DEFAULT NULL,
  p_error TEXT DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  afetadas INT;
BEGIN
  IF p_status NOT IN ('sent', 'failed') THEN
    RAISE EXCEPTION 'status invalido: %', p_status;
  END IF;

  -- O `tenant_id` entra na conferência de propósito: um fluxo do n8n NUNCA
  -- consegue mexer na mensagem de outro restaurante, nem se mandar o número
  -- de uma mensagem que não é dele.
  UPDATE public.crm_messages m
  SET status = p_status,
      external_id = COALESCE(p_external_id, m.external_id),
      error_message = CASE WHEN p_status = 'failed' THEN p_error ELSE NULL END,
      delivered_at = CASE WHEN p_status = 'sent' THEN now() ELSE m.delivered_at END,
      lease_until = NULL,
      lease_worker = NULL,
      updated_at = now()
  WHERE m.id = p_message_id
    AND m.tenant_id = p_tenant_id
    AND m.direction = 'out'
    AND m.status <> 'sent';

  GET DIAGNOSTICS afetadas = ROW_COUNT;
  RETURN afetadas > 0;
END;
$$;

-- ----------------------------------------------------------------------------
-- Mensagem CHEGANDO: o cliente mandou algo no WhatsApp do restaurante.
--
-- Faz tudo de uma vez e sem duplicar: acha (ou cria) o contato, acha (ou
-- cria) a conversa, grava a mensagem e acende a bolinha de não lida.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_receive_message(
  p_tenant_id UUID,
  p_phone_e164 TEXT,
  p_body TEXT,
  p_contact_name TEXT DEFAULT NULL,
  p_external_id TEXT DEFAULT NULL,
  p_media_url TEXT DEFAULT NULL,
  p_media_type TEXT DEFAULT NULL
)
RETURNS TABLE (message_id UUID, conversation_id UUID, duplicada BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact UUID;
  v_conversa UUID;
  v_msg UUID;
  v_existente UUID;
BEGIN
  IF NOT public.company_has_crm_chat(p_tenant_id) THEN
    RAISE EXCEPTION 'crm_nao_contratado';
  END IF;

  IF COALESCE(TRIM(p_phone_e164), '') = '' THEN
    RAISE EXCEPTION 'telefone_vazio';
  END IF;

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

  INSERT INTO public.crm_contacts (tenant_id, phone_e164, name)
  VALUES (p_tenant_id, p_phone_e164, NULLIF(TRIM(COALESCE(p_contact_name, '')), ''))
  ON CONFLICT (tenant_id, phone_e164) DO UPDATE
    SET name = COALESCE(public.crm_contacts.name, EXCLUDED.name),
        updated_at = now()
  RETURNING id INTO v_contact;

  INSERT INTO public.crm_conversations (tenant_id, contact_id, status)
  VALUES (p_tenant_id, v_contact, 'open')
  ON CONFLICT (tenant_id, contact_id) DO UPDATE
    SET updated_at = now()
  RETURNING id INTO v_conversa;

  INSERT INTO public.crm_messages (
    tenant_id, conversation_id, direction, body, media_url, media_type,
    status, external_id, delivered_at
  )
  VALUES (
    p_tenant_id, v_conversa, 'in', p_body, p_media_url, p_media_type,
    'received', p_external_id, now()
  )
  RETURNING id INTO v_msg;

  -- Cliente que responde reabre a conversa: fechada com o cliente falando é
  -- mesa marcada como livre com gente sentada nela.
  UPDATE public.crm_conversations
  SET last_message_at = now(),
      last_message_preview = LEFT(COALESCE(p_body, '[mídia]'), 140),
      unread_count = unread_count + 1,
      status = CASE WHEN status = 'closed' THEN 'open' ELSE status END,
      updated_at = now()
  WHERE id = v_conversa;

  UPDATE public.crm_n8n_links
  SET last_seen_at = now(), last_error = NULL, updated_at = now()
  WHERE tenant_id = p_tenant_id;

  RETURN QUERY SELECT v_msg, v_conversa, FALSE;
END;
$$;

-- Estas três funções são do servidor, nunca do navegador. Quem está logado no
-- painel não alcança nenhuma delas nem digitando o nome certo.
REVOKE ALL ON FUNCTION public.crm_next_outbox(UUID, INT, TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_record_outbox_result(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_receive_message(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_next_outbox(UUID, INT, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_record_outbox_result(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_receive_message(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- Realtime: a tela do restaurante acende a mensagem nova sozinha, sem F5.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_messages;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_conversations;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;


-- ####################################################################
-- PARTE 2 de 2 — 20260911140000_whatsapp_conexao_qrcode
-- ####################################################################

-- ============================================================================
-- Conexão do WhatsApp pela própria tela do lojista (QR Code)
--
-- O QUE MUDA NA PRÁTICA
--
-- Até agora, ligar o WhatsApp de um restaurante era tarefa de quem tinha
-- acesso à UAZAPI: alguém de fora criava o aparelho e lia o QR Code. Quando
-- caía — e cai, porque o WhatsApp derruba a conexão sozinho de tempos em
-- tempos — o restaurante ficava mudo até alguém do suporte agir.
--
-- Agora o próprio lojista lê o QR Code na tela dele e religa sozinho, do
-- mesmo jeito que ele já faz com o WhatsApp Web.
--
-- O QUE ESTA MIGRAÇÃO CRIA
--
-- 1. Um COFRE para o token de cada aparelho (whatsapp_instance_secrets).
-- 2. Duas anotações novas na ficha do aparelho que já existia.
-- 3. O endereço do fluxo do n8n de cada loja, para o sistema saber para onde
--    mandar as mensagens que chegarem.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. O COFRE DO TOKEN DO APARELHO
--
-- Cada aparelho ligado na UAZAPI tem um token próprio — é a chave que manda
-- mensagem em nome daquele número de WhatsApp. Quem tem essa chave manda
-- mensagem como se fosse o restaurante.
--
-- POR QUE UMA TABELA SEPARADA, E NÃO UMA COLUNA NA FICHA DO APARELHO
--
-- A ficha do aparelho (marketing_whatsapp_instances) é lida pelo navegador do
-- lojista: é de lá que sai o "WhatsApp conectado" na tela. As regras do banco
-- liberam ou bloqueiam a LINHA inteira, nunca uma coluna sozinha — então um
-- token guardado ali viajaria junto para o navegador toda vez que a tela
-- carregasse. E o que chega ao navegador, vaza.
--
-- Guardar num cofre à parte, que só o servidor abre, é a diferença entre
-- deixar a chave do cofre em cima do balcão e deixá-la no bolso do gerente.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_instance_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'uazapi',
  -- O token daquele aparelho, devolvido pela UAZAPI quando ele é criado.
  instance_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_instance_secrets_tenant_provider_key
  ON public.whatsapp_instance_secrets(tenant_id, provider);

ALTER TABLE public.whatsapp_instance_secrets ENABLE ROW LEVEL SECURITY;

-- NENHUMA política de leitura ou escrita para quem está logado. Isso não é
-- esquecimento: com a RLS ligada e sem política nenhuma, o banco recusa tudo
-- que venha do navegador, inclusive do administrador. Só o servidor, com a
-- chave de serviço, abre este cofre.

-- ----------------------------------------------------------------------------
-- 2. DUAS ANOTAÇÕES NOVAS NA FICHA DO APARELHO
--
-- A ficha (marketing_whatsapp_instances) já existia e já é compartilhada: o
-- restaurante tem UM número de WhatsApp, usado pelo Marketing e agora também
-- pelo Chat. Não faria sentido criar uma segunda ficha para o mesmo aparelho —
-- seria como ter duas agendas com o mesmo telefone e ter de lembrar de
-- atualizar as duas.
-- ----------------------------------------------------------------------------
ALTER TABLE public.marketing_whatsapp_instances
  -- Quando o aviso de "chegou mensagem" foi apontado para o fluxo certo. Se
  -- estiver vazio, o aparelho pode estar conectado e ainda assim mudo — as
  -- mensagens chegam na UAZAPI e não são repassadas a ninguém.
  ADD COLUMN IF NOT EXISTS webhook_configured_at TIMESTAMPTZ,
  -- Como o aparelho se chama lá dentro da UAZAPI, para o suporte achar rápido.
  ADD COLUMN IF NOT EXISTS instance_name TEXT;

-- ----------------------------------------------------------------------------
-- 3. PARA ONDE MANDAR O QUE CHEGA
--
-- O endereço do fluxo do n8n daquela loja. É o que permite o religamento ser
-- realmente sozinho: quando o lojista lê o QR Code, o sistema já reaponta o
-- aviso de mensagem nova para o fluxo dele, sem ninguém precisar abrir a
-- UAZAPI para reconfigurar nada.
-- ----------------------------------------------------------------------------
ALTER TABLE public.crm_n8n_links
  ADD COLUMN IF NOT EXISTS inbound_webhook_url TEXT;


-- ############################################################################
-- PARTE FINAL — ANOTAR NO CADERNO DE OBRAS DO BANCO
--
-- O Supabase mantém uma lista do que já foi aplicado. Como você está colando
-- isto à mão, ele não fica sabendo sozinho — e no dia em que a publicação
-- automática rodar, ela tentaria aplicar tudo de novo e daria erro.
--
-- Estas duas linhas avisam: "já foi feito, pode pular". É assinar a ordem de
-- serviço depois que o eletricista terminou, para ninguém mandar outro fazer
-- o mesmo trabalho na semana seguinte.
-- ############################################################################

DO $$
DECLARE
  v RECORD;
BEGIN
  -- Escrito assim, e não com um INSERT direto, porque este caderno é do
  -- Supabase e não do nosso projeto: se um dia ele mudar a estrutura interna,
  -- isto continua funcionando em vez de derrubar o SQL inteiro por causa do
  -- último passo, depois de tudo já ter dado certo.
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE NOTICE 'Caderno de migracoes nao encontrado. Tudo bem: as tabelas foram criadas.';
    RETURN;
  END IF;

  FOR v IN
    SELECT * FROM (VALUES
      ('20260911120000', 'crm_chat_fundacao'),
      ('20260911140000', 'whatsapp_conexao_qrcode')
    ) AS t(version, name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM supabase_migrations.schema_migrations m WHERE m.version = v.version
    ) THEN
      EXECUTE format(
        'INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES (%L, %L)',
        v.version, v.name
      );
    END IF;
  END LOOP;
END $$;


-- ############################################################################
-- CONFERÊNCIA — deve devolver 6 linhas, uma para cada tabela nova
-- ############################################################################

SELECT table_name AS "tabela criada"
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'company_addons',
    'crm_n8n_links',
    'crm_contacts',
    'crm_conversations',
    'crm_messages',
    'whatsapp_instance_secrets'
  )
ORDER BY table_name;
