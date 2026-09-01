-- ============================================================================
-- FLY MARKETING — o motor da fila
--
-- POR QUE ISTO É SQL E NÃO CÓDIGO DO SITE
--
-- Duas pessoas não podem pegar a mesma comanda da fila. Se o n8n rodar dois
-- processos ao mesmo tempo — e ele vai — e a reserva fosse feita em duas
-- etapas ("procura as pendentes" e depois "marca como minhas"), os dois
-- procurariam ao mesmo tempo, achariam as mesmas linhas, e o cliente receberia
-- a mesma promoção duas vezes.
--
-- Aqui a busca e a marcação acontecem no mesmo instante, e o banco garante que
-- quem chegou primeiro leva. É o equivalente a arrancar a comanda do prego: se
-- ela já não está lá, o outro atendente simplesmente pega a próxima.
--
-- As contagens da campanha (enviadas, entregues, falhas) também são feitas
-- aqui pelo mesmo motivo: dois retornos chegando junto não podem contar um
-- por cima do outro.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Reservar um lote de mensagens para enviar
--
-- Devolve as mensagens já marcadas como "em processamento" e reservadas por
-- um tempo. Se o n8n travar no meio, a reserva vence sozinha e as mensagens
-- voltam para a fila — nenhuma mensagem fica presa para sempre.
--
-- A reserva e a leitura acontecem em dois passos dentro da MESMA função: o
-- primeiro passo arranca a comanda do prego (e é ele que impede dois envios),
-- o segundo só monta o que o n8n precisa saber para enviar.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_next_batch(
  p_limit INT DEFAULT 50,
  p_worker TEXT DEFAULT 'n8n',
  p_lease_seconds INT DEFAULT 300,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS TABLE (
  recipient_id UUID,
  campaign_id UUID,
  tenant_id UUID,
  phone_e164 TEXT,
  customer_name TEXT,
  message TEXT,
  media_url TEXT,
  media_type TEXT,
  provider TEXT,
  external_instance_id TEXT,
  attempts SMALLINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ids UUID[];
BEGIN
  -- Passo 1: reservar, no mesmo instante, quem vai ser enviado.
  WITH escolhidas AS (
    SELECT r.id
    FROM public.marketing_campaign_recipients r
    JOIN public.marketing_campaigns c ON c.id = r.campaign_id
    WHERE r.status IN ('pending', 'queued')
      AND r.next_attempt_at <= now()
      AND (r.claim_expires_at IS NULL OR r.claim_expires_at < now())
      AND c.status IN ('queued', 'processing')
      AND (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id)
    ORDER BY r.next_attempt_at, r.id
    LIMIT GREATEST(1, LEAST(p_limit, 500))
    FOR UPDATE OF r SKIP LOCKED
  ),
  marcadas AS (
    UPDATE public.marketing_campaign_recipients r
    SET status = 'processing',
        attempts = r.attempts + 1,
        claimed_by = p_worker,
        claim_expires_at = now() + make_interval(secs => GREATEST(30, p_lease_seconds)),
        queued_at = coalesce(r.queued_at, now()),
        updated_at = now()
    FROM escolhidas e
    WHERE r.id = e.id
    RETURNING r.id
  )
  SELECT array_agg(id) INTO ids FROM marcadas;

  IF ids IS NULL THEN
    RETURN;
  END IF;

  -- Passo 2: devolver tudo que o n8n precisa para enviar, já reservado.
  RETURN QUERY
  SELECT
    r.id,
    r.campaign_id,
    r.tenant_id,
    r.phone_e164,
    r.customer_name,
    r.rendered_message,
    c.media_url,
    c.media_type,
    coalesce(wi.provider, 'uazapi')::TEXT,
    wi.external_instance_id,
    r.attempts
  FROM public.marketing_campaign_recipients r
  JOIN public.marketing_campaigns c ON c.id = r.campaign_id
  LEFT JOIN public.marketing_whatsapp_instances wi ON wi.tenant_id = r.tenant_id
  WHERE r.id = ANY(ids)
  ORDER BY r.id;
END;
$$;

-- ----------------------------------------------------------------------------
-- Registrar o que aconteceu com uma mensagem
--
-- É idempotente: o mesmo retorno chegando duas vezes não conta duas entregas.
-- Isso importa porque webhook de fornecedor reenvia quando não recebe resposta
-- rápida — é como o entregador tocar a campainha de novo achando que ninguém
-- ouviu. A segunda campainhada não pode gerar um segundo pedido.
--
-- E o status só anda para frente: um "enviado" atrasado nunca desfaz um
-- "entregue" que já chegou.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_record_result(
  p_recipient_id UUID,
  p_status TEXT,
  p_provider_message_id TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_max_attempts SMALLINT DEFAULT 3
)
RETURNS TABLE (aplicado BOOLEAN, status_final TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  novo TEXT;
  ordem_atual INT;
  ordem_novo INT;
  espera INT;
BEGIN
  SELECT * INTO r FROM public.marketing_campaign_recipients
   WHERE id = p_recipient_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT;
    RETURN;
  END IF;

  -- Campanha cancelada: o retorno é anotado mas não ressuscita o envio.
  IF r.status = 'cancelled' THEN
    RETURN QUERY SELECT FALSE, r.status;
    RETURN;
  END IF;

  novo := p_status;

  -- Falha que ainda tem tentativa sobrando volta para a fila, com espera
  -- crescente: 1 min, depois 5, depois 25. Nunca vira laço infinito porque o
  -- número de tentativas é contado e tem teto.
  IF novo = 'failed' AND r.attempts < p_max_attempts THEN
    espera := 60 * power(5, GREATEST(0, r.attempts - 1))::INT;
    UPDATE public.marketing_campaign_recipients
    SET status = 'pending',
        next_attempt_at = now() + make_interval(secs => espera),
        claimed_by = NULL,
        claim_expires_at = NULL,
        error_code = p_error_code,
        error_message = left(coalesce(p_error_message, ''), 500),
        updated_at = now()
    WHERE id = p_recipient_id;
    RETURN QUERY SELECT TRUE, 'pending'::TEXT;
    RETURN;
  END IF;

  -- Status só anda para frente.
  ordem_atual := CASE r.status
    WHEN 'pending' THEN 0 WHEN 'queued' THEN 1 WHEN 'processing' THEN 2
    WHEN 'sent' THEN 3 WHEN 'delivered' THEN 4
    WHEN 'failed' THEN 4 WHEN 'cancelled' THEN 5 ELSE 0 END;
  ordem_novo := CASE novo
    WHEN 'pending' THEN 0 WHEN 'queued' THEN 1 WHEN 'processing' THEN 2
    WHEN 'sent' THEN 3 WHEN 'delivered' THEN 4
    WHEN 'failed' THEN 4 WHEN 'cancelled' THEN 5 ELSE 0 END;

  IF ordem_novo <= ordem_atual AND r.status <> 'processing' THEN
    -- Repetição do mesmo aviso, ou aviso atrasado. Só guarda o id do
    -- fornecedor se ainda não tínhamos.
    UPDATE public.marketing_campaign_recipients
    SET provider_message_id = coalesce(provider_message_id, p_provider_message_id),
        updated_at = now()
    WHERE id = p_recipient_id;
    RETURN QUERY SELECT FALSE, r.status;
    RETURN;
  END IF;

  UPDATE public.marketing_campaign_recipients
  SET status = novo,
      provider_message_id = coalesce(p_provider_message_id, provider_message_id),
      error_code = CASE WHEN novo = 'failed' THEN p_error_code ELSE error_code END,
      error_message = CASE WHEN novo = 'failed'
                           THEN left(coalesce(p_error_message, ''), 500) ELSE error_message END,
      sent_at = CASE WHEN novo IN ('sent', 'delivered') THEN coalesce(sent_at, now()) ELSE sent_at END,
      delivered_at = CASE WHEN novo = 'delivered' THEN coalesce(delivered_at, now()) ELSE delivered_at END,
      failed_at = CASE WHEN novo = 'failed' THEN coalesce(failed_at, now()) ELSE failed_at END,
      claimed_by = NULL,
      claim_expires_at = NULL,
      updated_at = now()
  WHERE id = p_recipient_id;

  PERFORM public.marketing_refresh_campaign_counts(r.campaign_id);

  RETURN QUERY SELECT TRUE, novo;
END;
$$;

-- ----------------------------------------------------------------------------
-- Recontagem da campanha
--
-- Conta a partir da verdade (as linhas dos destinatários) em vez de somar +1
-- a cada evento. Somar é o que produz aquele relatório que não fecha: dois
-- retornos ao mesmo tempo somam uma vez só e o número fica menor para sempre.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_refresh_campaign_counts(p_campaign_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v RECORD;
BEGIN
  SELECT
    count(*) FILTER (WHERE status IN ('sent', 'delivered')) AS enviadas,
    count(*) FILTER (WHERE status = 'delivered') AS entregues,
    count(*) FILTER (WHERE status = 'failed') AS falhas,
    count(*) FILTER (WHERE status = 'cancelled') AS canceladas,
    count(*) FILTER (WHERE status NOT IN ('pending', 'queued', 'processing')) AS processadas,
    count(*) AS total
  INTO v
  FROM public.marketing_campaign_recipients
  WHERE campaign_id = p_campaign_id;

  UPDATE public.marketing_campaigns
  SET sent_count = v.enviadas,
      delivered_count = v.entregues,
      failed_count = v.falhas,
      cancelled_count = v.canceladas,
      processed_count = v.processadas,
      -- A campanha termina quando não sobrou ninguém esperando.
      status = CASE
        WHEN status IN ('cancelled', 'paused') THEN status
        WHEN v.total > 0 AND v.processadas >= v.total THEN 'completed'
        ELSE status END,
      completed_at = CASE
        WHEN status NOT IN ('cancelled', 'paused')
             AND v.total > 0 AND v.processadas >= v.total
        THEN coalesce(completed_at, now()) ELSE completed_at END,
      updated_at = now()
  WHERE id = p_campaign_id;

  -- Consumo do mês, para saber quanto cada estabelecimento gasta antes de
  -- decidir qualquer preço.
  INSERT INTO public.marketing_usage AS u (tenant_id, period_month, messages_sent, messages_delivered, messages_failed)
  SELECT c.tenant_id, date_trunc('month', now())::date, v.enviadas, v.entregues, v.falhas
  FROM public.marketing_campaigns c WHERE c.id = p_campaign_id
  ON CONFLICT (tenant_id, period_month) DO UPDATE
  SET messages_sent = (
        SELECT coalesce(sum(sent_count), 0) FROM public.marketing_campaigns
        WHERE tenant_id = u.tenant_id AND created_at >= date_trunc('month', now())),
      messages_delivered = (
        SELECT coalesce(sum(delivered_count), 0) FROM public.marketing_campaigns
        WHERE tenant_id = u.tenant_id AND created_at >= date_trunc('month', now())),
      messages_failed = (
        SELECT coalesce(sum(failed_count), 0) FROM public.marketing_campaigns
        WHERE tenant_id = u.tenant_id AND created_at >= date_trunc('month', now())),
      updated_at = now();
END;
$$;

-- ----------------------------------------------------------------------------
-- Devolver à fila o que ficou preso
--
-- Se o n8n cair no meio de um lote, aquelas mensagens ficariam "em
-- processamento" para sempre. A reserva vence e elas voltam sozinhas.
-- Chamado pelo agendador diário que já existe.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_release_expired_claims()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INT;
BEGIN
  WITH soltas AS (
    UPDATE public.marketing_campaign_recipients
    SET status = 'pending', claimed_by = NULL, claim_expires_at = NULL, updated_at = now()
    WHERE status = 'processing'
      AND claim_expires_at IS NOT NULL
      AND claim_expires_at < now()
    RETURNING 1
  )
  SELECT count(*) INTO n FROM soltas;
  RETURN n;
END;
$$;

-- ----------------------------------------------------------------------------
-- Cancelar uma campanha
--
-- O que já saiu, saiu — não dá para despedir mensagem entregue, e o histórico
-- tem de continuar contando a verdade. O que ainda não saiu é barrado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_cancel_campaign(p_campaign_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INT;
BEGIN
  WITH barradas AS (
    UPDATE public.marketing_campaign_recipients
    SET status = 'cancelled', claimed_by = NULL, claim_expires_at = NULL, updated_at = now()
    WHERE campaign_id = p_campaign_id
      AND status IN ('pending', 'queued', 'processing')
    RETURNING 1
  )
  SELECT count(*) INTO n FROM barradas;

  UPDATE public.marketing_campaigns
  SET status = 'cancelled', completed_at = coalesce(completed_at, now()), updated_at = now()
  WHERE id = p_campaign_id;

  PERFORM public.marketing_refresh_campaign_counts(p_campaign_id);
  -- refresh não pode reabrir uma campanha cancelada.
  UPDATE public.marketing_campaigns SET status = 'cancelled' WHERE id = p_campaign_id;

  RETURN n;
END;
$$;

-- ----------------------------------------------------------------------------
-- Quem NÃO pode chamar estas funções
--
-- Nenhuma delas é para o navegador. Quem chama é o servidor, com a chave de
-- serviço, depois de conferir de quem é a loja. Tirar a permissão de todo
-- mundo e não devolver a ninguém é o que garante isso.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.marketing_next_batch(INT, TEXT, INT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_record_result(UUID, TEXT, TEXT, TEXT, TEXT, SMALLINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_refresh_campaign_counts(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_release_expired_claims() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_cancel_campaign(UUID) FROM PUBLIC, anon, authenticated;
