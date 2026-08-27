-- ============================================================================
-- FLY MARKETING — fundação
--
-- O QUE ISTO CRIA, EM LINGUAGEM DE RESTAURANTE
--
-- Hoje o nome e o telefone do cliente ficam escritos dentro de cada pedido,
-- soltos. É como ter mil comandas numa gaveta e nenhum caderno de clientes:
-- dá para achar um pedido, não dá para saber quem é freguês, quem sumiu, quem
-- gasta mais. Esta migration cria esse caderno — e ele se preenche sozinho a
-- cada pedido que entra.
--
-- DECISÕES QUE VALE REGISTRAR
--
-- 1. `tenant_id` é o nome usado aqui porque é o nome que os pedidos já usam
--    (orders.tenant_id -> pizzerias.id). Não inventamos padrão novo.
--
-- 2. Dinheiro em centavos inteiros, como manda a regra do projeto. A tabela
--    antiga de pedidos guarda em reais com vírgula; na conversão arredondamos
--    uma vez e nunca mais mexemos — assim "total gasto" nunca fica com aquele
--    centavo a mais que aparece do nada.
--
-- 3. A lista de destinatários da campanha É a fila de envio. Não criamos uma
--    segunda tabela só para "fila": seria a mesma informação em dois cadernos,
--    e dois cadernos sempre acabam discordando.
--
-- 4. Ninguém nasce aceitando propaganda. Cliente antigo entra no caderno, mas
--    entra bloqueado para promoção até marcar que aceita. É o que a lei espera
--    e é o que protege o número de WhatsApp do restaurante de ser denunciado.
--
-- 5. Nenhuma tabela existente é alterada, renomeada ou apagada. O único toque
--    em estrutura antiga é um gatilho de leitura em `orders`, que grava no
--    caderno novo e, se falhar, não derruba o pedido.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Telefone: um número, um formato
--
-- (71) 99999-9999, 71999999999 e +55 71 99999-9999 são a mesma pessoa. Sem
-- padronizar, o mesmo cliente vira três clientes e recebe a mesma promoção
-- três vezes. Guardamos sempre no formato 55 + DDD + número.
--
-- Devolve NULL quando o que chegou não é um celular brasileiro plausível —
-- e NULL aqui significa "não dá para mandar mensagem", não "erro".
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_normalize_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits TEXT;
  ddd TEXT;
  numero TEXT;
BEGIN
  IF p_phone IS NULL THEN RETURN NULL; END IF;

  digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF digits = '' THEN RETURN NULL; END IF;

  -- Quem escreveu com "+" declarou o país. Se declarou um país que não é o
  -- Brasil, recusamos em vez de fingir que é: um "+1 415 555 2671" americano
  -- tem 11 dígitos depois do +1 e passaria por celular brasileiro, e aí a
  -- promoção do restaurante iria parar no telefone de um desconhecido.
  IF left(btrim(p_phone), 1) = '+' AND left(digits, 2) <> '55' THEN
    RETURN NULL;
  END IF;

  -- Tira o zero do DDD interurbano: 071... vira 71...
  IF length(digits) IN (11, 12) AND left(digits, 1) = '0' THEN
    digits := substr(digits, 2);
  END IF;

  -- Já veio com o código do país.
  IF length(digits) IN (12, 13) AND left(digits, 2) = '55' THEN
    ddd := substr(digits, 3, 2);
    numero := substr(digits, 5);
  -- Veio só com DDD + número.
  ELSIF length(digits) IN (10, 11) THEN
    ddd := left(digits, 2);
    numero := substr(digits, 3);
  ELSE
    RETURN NULL;
  END IF;

  -- DDD brasileiro vai de 11 a 99.
  IF ddd !~ '^[1-9][1-9]$' THEN RETURN NULL; END IF;
  -- Celular tem 9 dígitos e começa com 9; fixo tem 8. Aceitamos os dois, mas
  -- só o celular serve para WhatsApp — quem decide isso é a coluna is_mobile.
  IF length(numero) NOT IN (8, 9) THEN RETURN NULL; END IF;

  RETURN '55' || ddd || numero;
END;
$$;

COMMENT ON FUNCTION public.marketing_normalize_phone(TEXT) IS
  'Padroniza telefone brasileiro em 55+DDD+numero. NULL quando não é um número plausível.';

-- ----------------------------------------------------------------------------
-- O caderno de clientes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,

  name TEXT,
  -- Como o cliente digitou, para conferência humana.
  phone_raw TEXT,
  -- Como o sistema compara. É esta que tem de ser única por estabelecimento.
  phone_e164 TEXT NOT NULL,
  -- Celular (9 dígitos começando em 9) é o único que recebe WhatsApp.
  is_mobile BOOLEAN NOT NULL DEFAULT TRUE,

  -- De onde este cliente apareceu: 'order' (pedido), 'import', 'manual'.
  source TEXT NOT NULL DEFAULT 'order',

  -- Comportamento de compra, mantido pelo gatilho. Guardado em vez de somado
  -- na hora porque a tela de clientes ordena e filtra por estes números — e
  -- somar mil pedidos a cada rolagem de página deixaria a tela lenta.
  orders_count INTEGER NOT NULL DEFAULT 0,
  total_spent_cents BIGINT NOT NULL DEFAULT 0,
  first_order_at TIMESTAMPTZ,
  last_order_at TIMESTAMPTZ,

  -- Consentimento. Ninguém nasce aceitando.
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_opt_in_at TIMESTAMPTZ,
  marketing_opt_out_at TIMESTAMPTZ,
  -- Onde a pessoa aceitou: 'checkout', 'painel', 'importacao'…
  marketing_opt_in_source TEXT,

  -- Última vez que este cliente recebeu alguma coisa nossa.
  last_campaign_id UUID,
  last_message_at TIMESTAMPTZ,

  tags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  -- 'active' | 'blocked'. Bloqueado nunca recebe nada, nem transacional.
  status TEXT NOT NULL DEFAULT 'active',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- O caderno de reservas só aceita um nome por mesa: se tentar escrever o mesmo
-- telefone duas vezes no mesmo estabelecimento, a caneta trava. É isto que
-- impede cliente duplicado.
CREATE UNIQUE INDEX IF NOT EXISTS marketing_customers_tenant_phone_key
  ON public.marketing_customers(tenant_id, phone_e164);

-- "Quem não compra há 30 dias", que é a consulta mais usada da segmentação.
CREATE INDEX IF NOT EXISTS marketing_customers_tenant_last_order_idx
  ON public.marketing_customers(tenant_id, last_order_at DESC NULLS LAST);

-- "Quem posso mandar promoção" — só quem aceitou, ativo e com celular.
CREATE INDEX IF NOT EXISTS marketing_customers_tenant_optin_idx
  ON public.marketing_customers(tenant_id)
  WHERE marketing_opt_in = TRUE AND status = 'active' AND is_mobile = TRUE;

CREATE INDEX IF NOT EXISTS marketing_customers_tenant_spent_idx
  ON public.marketing_customers(tenant_id, total_spent_cents DESC);

CREATE INDEX IF NOT EXISTS marketing_customers_tenant_orders_idx
  ON public.marketing_customers(tenant_id, orders_count DESC);

-- Busca por nome na tela de clientes. O índice bom para "contém" depende da
-- extensão pg_trgm; se ela não estiver ligada neste banco, cai para um índice
-- simples em vez de a migration inteira falhar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS marketing_customers_name_trgm_idx
             ON public.marketing_customers USING gin (lower(coalesce(name, '''')) gin_trgm_ops)';
  ELSE
    EXECUTE 'CREATE INDEX IF NOT EXISTS marketing_customers_name_idx
             ON public.marketing_customers (tenant_id, lower(coalesce(name, '''')))';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Campanhas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  -- 'promocao' | 'cupom' | 'novidade' | 'frete_gratis' | 'cliente_inativo' | 'personalizada'
  type TEXT NOT NULL DEFAULT 'promocao',
  -- 'draft' | 'scheduled' | 'queued' | 'processing' | 'completed' | 'paused' | 'cancelled' | 'failed'
  status TEXT NOT NULL DEFAULT 'draft',

  -- Como o público foi escolhido: 'todos' | 'segmento' | 'manual'.
  audience_mode TEXT NOT NULL DEFAULT 'segmento',
  -- Os filtros exatamente como estavam quando a campanha foi confirmada.
  -- Guardar isto é o que permite explicar depois: "por que esta pessoa
  -- recebeu?" — sem depender de o filtro dar o mesmo resultado hoje.
  audience_filters JSONB NOT NULL DEFAULT '{}'::jsonb,

  message_body TEXT NOT NULL DEFAULT '',
  media_url TEXT,
  media_type TEXT,

  -- Cupom: por enquanto só o código viaja na mensagem. O site de pedidos ainda
  -- não valida cupom; quando validar, é aqui que a ligação já estará pronta.
  coupon_code TEXT,
  coupon_ref UUID,

  estimated_recipients INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  cancelled_count INTEGER NOT NULL DEFAULT 0,

  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Trava contra clique repetido: o mesmo pedido de criação chega duas vezes,
  -- só a primeira vira campanha. Como o comprovante do estacionamento — a
  -- segunda via não abre a cancela de novo.
  idempotency_key TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_campaigns_tenant_created_idx
  ON public.marketing_campaigns(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS marketing_campaigns_tenant_status_idx
  ON public.marketing_campaigns(tenant_id, status);

-- Campanhas agendadas esperando a hora: só as que interessam ao agendador.
CREATE INDEX IF NOT EXISTS marketing_campaigns_scheduled_idx
  ON public.marketing_campaigns(scheduled_at)
  WHERE status = 'scheduled';

CREATE UNIQUE INDEX IF NOT EXISTS marketing_campaigns_idempotency_key
  ON public.marketing_campaigns(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Destinatários — que também são a fila de envio
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  -- Repetido de propósito, igual ao histórico de status dos pedidos: é o que a
  -- regra de acesso usa, sem precisar cruzar tabela a cada consulta.
  tenant_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.marketing_customers(id) ON DELETE SET NULL,

  -- Retrato do cliente no momento do disparo. Se ele trocar de número amanhã,
  -- o histórico continua contando a verdade do dia do envio.
  phone_e164 TEXT NOT NULL,
  customer_name TEXT,
  -- Mensagem já com o nome dele no lugar de {{nome}}.
  rendered_message TEXT NOT NULL,

  -- 'pending' | 'queued' | 'processing' | 'sent' | 'delivered' | 'failed' | 'cancelled'
  status TEXT NOT NULL DEFAULT 'pending',
  attempts SMALLINT NOT NULL DEFAULT 0,
  -- Antes desta hora ninguém pega esta linha. É assim que a espera entre
  -- tentativas funciona, sem nenhum processo ficar dormindo.
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Quem pegou a linha para enviar e até quando ela fica reservada. Evita dois
  -- envios da mesma mensagem quando o n8n roda em paralelo.
  claimed_by TEXT,
  claim_expires_at TIMESTAMPTZ,

  queued_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,

  error_code TEXT,
  error_message TEXT,
  provider_message_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A mesma pessoa nunca entra duas vezes na mesma campanha.
CREATE UNIQUE INDEX IF NOT EXISTS marketing_recipients_campaign_phone_key
  ON public.marketing_campaign_recipients(campaign_id, phone_e164);

-- A consulta do n8n: "me dá as próximas mensagens prontas para enviar".
CREATE INDEX IF NOT EXISTS marketing_recipients_ready_idx
  ON public.marketing_campaign_recipients(next_attempt_at, id)
  WHERE status IN ('pending', 'queued');

CREATE INDEX IF NOT EXISTS marketing_recipients_campaign_status_idx
  ON public.marketing_campaign_recipients(campaign_id, status);

CREATE INDEX IF NOT EXISTS marketing_recipients_tenant_created_idx
  ON public.marketing_campaign_recipients(tenant_id, created_at DESC);

-- O retorno do provedor chega com o id dele; precisamos achar a linha por ele.
CREATE INDEX IF NOT EXISTS marketing_recipients_provider_msg_idx
  ON public.marketing_campaign_recipients(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Modelos de mensagem
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'promocao',
  body TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_templates_tenant_idx
  ON public.marketing_templates(tenant_id, updated_at DESC);

-- ----------------------------------------------------------------------------
-- Ligação do WhatsApp de cada estabelecimento
--
-- NENHUM segredo mora aqui. Esta tabela guarda só o "qual aparelho é o seu" e
-- se ele está no ar. O token que abre a porta fica com o n8n, do lado de fora
-- do banco — do mesmo jeito que a chave do cofre não fica colada no cofre.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  -- 'uazapi' hoje; 'cloud_api' amanhã, sem refazer nada.
  provider TEXT NOT NULL DEFAULT 'uazapi',
  -- Como o provedor chama esta instância. Identificador, não segredo.
  external_instance_id TEXT,
  -- Número conectado, só para mostrar na tela.
  phone_e164 TEXT,
  -- 'disconnected' | 'connecting' | 'connected' | 'error'
  status TEXT NOT NULL DEFAULT 'disconnected',
  status_message TEXT,
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Um aparelho por estabelecimento por provedor.
CREATE UNIQUE INDEX IF NOT EXISTS marketing_whatsapp_tenant_provider_key
  ON public.marketing_whatsapp_instances(tenant_id, provider);

-- ----------------------------------------------------------------------------
-- Registro de acontecimentos (auditoria)
--
-- Nunca guarde token nem chave aqui. Se um dia vazar, tem de vazar coisa
-- chata, não coisa perigosa.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES public.marketing_campaign_recipients(id) ON DELETE CASCADE,
  -- 'campaign_created' | 'campaign_started' | 'message_sent' | 'webhook_received'…
  event TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_events_tenant_idx
  ON public.marketing_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS marketing_events_campaign_idx
  ON public.marketing_events(campaign_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- Consumo mensal por estabelecimento
--
-- Ainda não cobra nada. Serve para saber quanto cada um gasta antes de decidir
-- qualquer preço — e para o dia em que o plano tiver limite.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  -- Primeiro dia do mês de referência.
  period_month DATE NOT NULL,
  messages_queued INTEGER NOT NULL DEFAULT 0,
  messages_sent INTEGER NOT NULL DEFAULT 0,
  messages_delivered INTEGER NOT NULL DEFAULT 0,
  messages_failed INTEGER NOT NULL DEFAULT 0,
  campaigns_created INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_usage_tenant_month_key
  ON public.marketing_usage(tenant_id, period_month);

-- ----------------------------------------------------------------------------
-- updated_at automático
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  -- set_updated_at() já existe no projeto desde a primeira migration.
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    FOREACH t IN ARRAY ARRAY[
      'marketing_customers',
      'marketing_campaigns',
      'marketing_campaign_recipients',
      'marketing_templates',
      'marketing_whatsapp_instances'
    ] LOOP
      EXECUTE format(
        'DROP TRIGGER IF EXISTS trg_%1$s_updated ON public.%1$s;
         CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON public.%1$s
         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', t
      );
    END LOOP;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Captura automática do cliente a cada pedido
--
-- Roda depois que o pedido é gravado. Se der qualquer problema aqui, o pedido
-- NÃO é perdido: o erro é engolido de propósito. Perder um cliente do caderno
-- de marketing é chato; perder um pedido é inaceitável.
--
-- É idempotente: o mesmo pedido processado duas vezes não conta duas compras,
-- porque a contagem olha para o pedido em si, não para "mais um".
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_capture_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone TEXT;
  v_cents BIGINT;
  v_is_mobile BOOLEAN;
BEGIN
  BEGIN
    v_phone := public.marketing_normalize_phone(NEW.customer_phone);
    IF v_phone IS NULL THEN
      RETURN NEW;
    END IF;

    -- Pedido de mesa não tem cliente de delivery para cadastrar.
    IF coalesce(NEW.order_type, '') = 'table' OR coalesce(NEW.service_mode, '') = 'mesa' THEN
      RETURN NEW;
    END IF;

    v_cents := round(coalesce(NEW.total, 0) * 100)::BIGINT;
    v_is_mobile := length(substr(v_phone, 5)) = 9 AND substr(v_phone, 5, 1) = '9';

    INSERT INTO public.marketing_customers AS mc (
      tenant_id, name, phone_raw, phone_e164, is_mobile, source,
      orders_count, total_spent_cents, first_order_at, last_order_at
    )
    VALUES (
      NEW.tenant_id,
      nullif(trim(NEW.customer_name), ''),
      NEW.customer_phone,
      v_phone,
      v_is_mobile,
      'order',
      1,
      v_cents,
      NEW.created_at,
      NEW.created_at
    )
    ON CONFLICT (tenant_id, phone_e164) DO UPDATE SET
      -- Nome só é sobrescrito se veio algo; não apagamos um nome bom com vazio.
      name = coalesce(nullif(trim(EXCLUDED.name), ''), mc.name),
      phone_raw = coalesce(EXCLUDED.phone_raw, mc.phone_raw),
      orders_count = mc.orders_count + 1,
      total_spent_cents = mc.total_spent_cents + EXCLUDED.total_spent_cents,
      first_order_at = LEAST(coalesce(mc.first_order_at, EXCLUDED.first_order_at), EXCLUDED.first_order_at),
      last_order_at = GREATEST(coalesce(mc.last_order_at, EXCLUDED.last_order_at), EXCLUDED.last_order_at),
      updated_at = now();

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'marketing_capture_customer falhou para o pedido %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketing_capture_customer ON public.orders;
CREATE TRIGGER trg_marketing_capture_customer
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.marketing_capture_customer();

-- ----------------------------------------------------------------------------
-- Preenchimento do caderno com o histórico que já existe
--
-- Lê os pedidos antigos e monta o cadastro de uma vez. Todo mundo entra com
-- consentimento NÃO — ninguém aceitou nada até hoje, e fingir que aceitou
-- seria o caminho curto para o WhatsApp do restaurante ser bloqueado.
--
-- Pode rodar de novo sem estragar nada: recalcula do zero em vez de somar.
-- ----------------------------------------------------------------------------
INSERT INTO public.marketing_customers AS mc (
  tenant_id, name, phone_raw, phone_e164, is_mobile, source,
  orders_count, total_spent_cents, first_order_at, last_order_at
)
SELECT
  o.tenant_id,
  -- O nome mais recente que NÃO esteja vazio. Sem o FILTER, um pedido novo
  -- feito sem nome apagava o nome que já tínhamos — o cliente virava anônimo
  -- justamente por ter voltado a comprar.
  (array_agg(nullif(trim(o.customer_name), '') ORDER BY o.created_at DESC)
     FILTER (WHERE nullif(trim(o.customer_name), '') IS NOT NULL))[1],
  (array_agg(o.customer_phone ORDER BY o.created_at DESC))[1],
  public.marketing_normalize_phone(o.customer_phone),
  length(substr(public.marketing_normalize_phone(o.customer_phone), 5)) = 9
    AND substr(public.marketing_normalize_phone(o.customer_phone), 5, 1) = '9',
  'order',
  count(*),
  coalesce(sum(round(coalesce(o.total, 0) * 100)), 0)::BIGINT,
  min(o.created_at),
  max(o.created_at)
FROM public.orders o
WHERE public.marketing_normalize_phone(o.customer_phone) IS NOT NULL
  AND coalesce(o.order_type, '') <> 'table'
  AND coalesce(o.service_mode, '') <> 'mesa'
GROUP BY o.tenant_id, public.marketing_normalize_phone(o.customer_phone)
ON CONFLICT (tenant_id, phone_e164) DO UPDATE SET
  orders_count = EXCLUDED.orders_count,
  total_spent_cents = EXCLUDED.total_spent_cents,
  first_order_at = EXCLUDED.first_order_at,
  last_order_at = EXCLUDED.last_order_at,
  name = coalesce(EXCLUDED.name, mc.name),
  updated_at = now();

-- ============================================================================
-- REGRAS DE ACESSO
--
-- Mesmo critério que os pedidos já usam: você só enxerga o que é da sua
-- pizzaria. Um estabelecimento nunca vê — nem dispara para — cliente de outro.
-- Escrita direta pelo navegador fica proibida em quase tudo: quem grava é o
-- servidor, com a chave de serviço, depois de conferir de quem é a loja.
-- ============================================================================

ALTER TABLE public.marketing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_usage ENABLE ROW LEVEL SECURITY;

-- Leitura para o dono da pizzaria (e para o super admin), em todas as tabelas.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'marketing_customers',
    'marketing_campaigns',
    'marketing_campaign_recipients',
    'marketing_templates',
    'marketing_whatsapp_instances',
    'marketing_events',
    'marketing_usage'
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

-- Escrita pelo navegador: liberada só onde o dono realmente edita à mão —
-- os modelos de mensagem e as anotações/tags do cliente. Campanha, fila,
-- consumo e auditoria são gravados pelo servidor.
DROP POLICY IF EXISTS "marketing_templates_write_policy" ON public.marketing_templates;
CREATE POLICY "marketing_templates_write_policy" ON public.marketing_templates
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.pizzerias p
            WHERE p.id = marketing_templates.tenant_id AND p.owner_id = auth.uid())
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.pizzerias p
            WHERE p.id = marketing_templates.tenant_id AND p.owner_id = auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "marketing_customers_update_policy" ON public.marketing_customers;
CREATE POLICY "marketing_customers_update_policy" ON public.marketing_customers
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.pizzerias p
            WHERE p.id = marketing_customers.tenant_id AND p.owner_id = auth.uid())
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.pizzerias p
            WHERE p.id = marketing_customers.tenant_id AND p.owner_id = auth.uid())
    OR public.is_admin()
  );

COMMENT ON TABLE public.marketing_customers IS
  'Caderno de clientes por estabelecimento. Preenchido sozinho a cada pedido.';
COMMENT ON TABLE public.marketing_campaign_recipients IS
  'Destinatários de uma campanha. Esta tabela também É a fila de envio.';
COMMENT ON TABLE public.marketing_whatsapp_instances IS
  'Qual aparelho de WhatsApp é de cada estabelecimento. Nenhum segredo aqui.';
