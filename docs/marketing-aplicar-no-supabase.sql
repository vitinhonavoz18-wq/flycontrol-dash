-- =====================================================================
-- FLY MARKETING — aplicar de uma vez no SQL Editor do Supabase
--
-- Este arquivo é a junção das duas migrations do módulo de Marketing,
-- na ordem certa. Cole tudo e execute uma vez só.
--
-- É SEGURO RODAR DE NOVO: nada é apagado, nada é renomeado, e rodar duas
-- vezes não duplica cliente nem soma pedido em dobro.
--
-- Origem (mantidas separadas no repositório):
--   supabase/migrations/20260826230000_marketing_foundation.sql
--   supabase/migrations/20260826234500_marketing_queue_functions.sql
-- =====================================================================

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
  -- Telefone fixo no Brasil nunca começa com 9. Oito dígitos começando com 9
  -- é celular com um dígito faltando — o erro de digitação mais comum, e
  -- mandar mensagem para ele é mandar para o número de outra pessoa.
  IF length(numero) = 8 AND left(numero, 1) = '9' THEN RETURN NULL; END IF;
  -- Celular de 9 dígitos sempre começa com 9.
  IF length(numero) = 9 AND left(numero, 1) <> '9' THEN RETURN NULL; END IF;

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

-- =====================================================================
-- SEGUNDA PARTE: o motor da fila
-- =====================================================================

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

-- =====================================================================
-- TERCEIRA PARTE: fechar duas frestas de segurança
--
-- Encontradas pelo verificador do Supabase depois que a fundação subiu.
-- Já aplicadas no projeto FLYCONTROL; ficam aqui para quem for montar o
-- banco do zero.
-- =====================================================================

REVOKE ALL ON FUNCTION public.marketing_capture_customer()
  FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.marketing_normalize_phone(TEXT)
  SET search_path = public;
