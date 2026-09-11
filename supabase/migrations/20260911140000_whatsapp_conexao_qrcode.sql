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
