-- ═══════════════════════════════════════════════════════════════════════════
-- AVISOS AUTOMÁTICOS DE PEDIDO PELO WHATSAPP
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Até aqui, cada vez que o pedido mudava de etapa, abria uma janela no painel
-- e o dono precisava CLICAR para avisar o cliente. Em hora de pico ninguém
-- clica — e o cliente fica perguntando "cadê meu pedido?".
--
-- Agora, para a loja que ligar a opção, o aviso entra numa fila sozinho no
-- momento em que o status muda — venha a mudança do painel, da cozinha, do
-- entregador ou de qualquer outro lugar. O n8n da loja passa de minuto em
-- minuto, pega o que está na fila e entrega pelo WhatsApp da própria loja.
--
-- É o mesmo jeito da fila de mensagens do Chat: o entregador passa na loja
-- buscando o que está pronto, em vez de a cozinha correr atrás de cada moto.
--
-- Pode rodar mais de uma vez sem estragar nada.

-- ── 1. A chave que a loja liga ─────────────────────────────────────────────
ALTER TABLE public.pizzerias
  ADD COLUMN IF NOT EXISTS status_auto_send BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pizzerias.status_auto_send IS
  'Avisa o cliente pelo WhatsApp sozinho quando o pedido muda de etapa (em preparo, saiu, entregue).';

-- ── 2. A fila de avisos ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_status_notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  order_id      UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('preparando', 'saiu', 'entregue')),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts      INT NOT NULL DEFAULT 0,
  lease_worker  TEXT,
  lease_until   TIMESTAMPTZ,
  external_id   TEXT,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at       TIMESTAMPTZ,
  -- Um aviso por etapa por pedido. Se o pedido for e voltar ("saiu" sem
  -- querer, volta para "preparando", sai de novo), o cliente não recebe a
  -- mesma mensagem duas vezes.
  CONSTRAINT order_status_notifications_uma_por_etapa UNIQUE (order_id, kind)
);

CREATE INDEX IF NOT EXISTS order_status_notifications_fila_idx
  ON public.order_status_notifications (tenant_id, status, created_at);

-- Só o servidor mexe nesta tabela. Sem regra de acesso = ninguém de fora lê.
ALTER TABLE public.order_status_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_status_notifications FROM anon, authenticated;

-- ── 3. O gatilho: status mudou, aviso entra na fila ────────────────────────
CREATE OR REPLACE FUNCTION public.enfileirar_aviso_de_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.to_status NOT IN ('preparando', 'saiu', 'entregue') THEN
    RETURN NEW;
  END IF;

  -- Loja que não ligou a opção continua no jeito antigo (botão manual).
  IF NOT EXISTS (
    SELECT 1 FROM public.pizzerias p
    WHERE p.id = NEW.tenant_id AND p.status_auto_send = true
  ) THEN
    RETURN NEW;
  END IF;

  -- Sem telefone não há para quem mandar.
  IF NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = NEW.order_id
      AND length(regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g')) >= 10
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.order_status_notifications (tenant_id, order_id, kind)
  VALUES (NEW.tenant_id, NEW.order_id, NEW.to_status)
  ON CONFLICT (order_id, kind) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- O aviso é cortesia; a mudança de status é obrigação. Se algo der errado
  -- aqui, o pedido muda de etapa do mesmo jeito.
  RAISE WARNING 'enfileirar_aviso_de_pedido falhou: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_status_history_enfileira_aviso ON public.order_status_history;
CREATE TRIGGER order_status_history_enfileira_aviso
  AFTER INSERT ON public.order_status_history
  FOR EACH ROW EXECUTE FUNCTION public.enfileirar_aviso_de_pedido();

-- ── 4. O n8n pega o próximo lote ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.proximos_avisos_de_pedido(
  p_tenant_id UUID,
  p_limit INT DEFAULT 20,
  p_worker TEXT DEFAULT 'n8n',
  p_lease_seconds INT DEFAULT 300
)
RETURNS TABLE (
  notification_id UUID,
  order_id UUID,
  kind TEXT,
  order_number TEXT,
  customer_name TEXT,
  customer_phone TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ids UUID[];
BEGIN
  -- Aviso velho não sai mais. "Seu pedido está em preparo" duas horas depois,
  -- com o pedido já entregue, só confunde o cliente.
  UPDATE public.order_status_notifications n
  SET status = 'skipped', last_error = 'expirou_sem_envio', updated_at = now()
  WHERE n.tenant_id = p_tenant_id
    AND n.status IN ('pending', 'sending')
    AND n.created_at < now() - interval '90 minutes';

  WITH escolhidas AS (
    SELECT n.id
    FROM public.order_status_notifications n
    WHERE n.tenant_id = p_tenant_id
      AND n.status IN ('pending', 'sending')
      AND (n.lease_until IS NULL OR n.lease_until < now())
      AND n.attempts < 3
    ORDER BY n.created_at, n.id
    LIMIT GREATEST(1, LEAST(p_limit, 100))
    FOR UPDATE OF n SKIP LOCKED
  ),
  marcadas AS (
    UPDATE public.order_status_notifications n
    SET status = 'sending',
        attempts = n.attempts + 1,
        lease_worker = p_worker,
        lease_until = now() + make_interval(secs => GREATEST(30, p_lease_seconds)),
        updated_at = now()
    FROM escolhidas e
    WHERE n.id = e.id
    RETURNING n.id
  )
  SELECT array_agg(id) INTO ids FROM marcadas;

  IF ids IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT n.id, n.order_id, n.kind, o.order_number::text, o.customer_name, o.customer_phone
  FROM public.order_status_notifications n
  JOIN public.orders o ON o.id = n.order_id
  WHERE n.id = ANY (ids)
  ORDER BY n.created_at, n.id;
END;
$$;

-- ── 5. O n8n conta como foi ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_resultado_aviso_de_pedido(
  p_tenant_id UUID,
  p_notification_id UUID,
  p_status TEXT,
  p_external_id TEXT DEFAULT NULL,
  p_error TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linhas INT;
BEGIN
  IF p_status = 'sent' THEN
    UPDATE public.order_status_notifications
    SET status = 'sent', sent_at = now(), external_id = left(p_external_id, 200),
        last_error = NULL, lease_until = NULL, updated_at = now()
    WHERE id = p_notification_id AND tenant_id = p_tenant_id;
  ELSE
    -- Falhou: volta para a fila até a terceira tentativa; depois desiste.
    UPDATE public.order_status_notifications
    SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
        last_error = left(coalesce(p_error, 'falhou'), 300),
        lease_until = NULL, updated_at = now()
    WHERE id = p_notification_id AND tenant_id = p_tenant_id AND status <> 'sent';
  END IF;
  GET DIAGNOSTICS linhas = ROW_COUNT;
  RETURN linhas > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.enfileirar_aviso_de_pedido() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.proximos_avisos_de_pedido(UUID, INT, TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_resultado_aviso_de_pedido(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proximos_avisos_de_pedido(UUID, INT, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_resultado_aviso_de_pedido(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
