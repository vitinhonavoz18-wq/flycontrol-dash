-- ============================================================================
-- Troca do servidor da UAZAPI: jogar fora as chaves do servidor antigo
--
-- O QUE MUDA NA PRÁTICA
--
-- O WhatsApp do painel passou a funcionar em outro servidor da UAZAPI (o
-- antigo dava problema). Cada aparelho de WhatsApp mora dentro de UM servidor:
-- os aparelhos ligados no servidor antigo NÃO existem no novo.
--
-- As chaves guardadas aqui, portanto, viraram chave de cadeado trocado:
-- continuam no molho, continuam parecendo chave, e não abrem mais nada.
--
-- POR QUE APAGAR, EM VEZ DE DEIXAR QUIETO
--
-- Chave morta é pior do que chave nenhuma. Com ela guardada, o painel entrega
-- essa chave ao fluxo do n8n, o n8n tenta enviar a resposta do restaurante e a
-- mensagem morre no caminho — é o garçom anotando o pedido e levando para uma
-- cozinha que foi desativada. Sem chave nenhuma, o painel simplesmente diz
-- "esta loja precisa conectar o WhatsApp", que é a verdade.
--
-- O QUE ISTO NÃO APAGA
--
-- Nenhuma conversa, nenhuma mensagem, nenhum cliente, nenhum pedido. Só a
-- credencial do aparelho e as anotações de conexão. Troca-se a fechadura, não
-- a casa. Cada lojista reconecta em Chat > Conexão lendo o QR Code de novo —
-- ver docs/trocar-servidor-uazapi.md.
-- ============================================================================

-- 1. As chaves mortas saem do cofre.
DELETE FROM public.whatsapp_instance_secrets
WHERE provider = 'uazapi';

-- 2. A ficha do aparelho para de fingir que existe um aparelho ligado.
--
-- `webhook_configured_at` volta a ficar vazio de propósito: no servidor novo o
-- aviso de "chegou mensagem" ainda não foi apontado para lugar nenhum, e
-- deixar a data antiga ali faria o painel achar que já apontou — o telefone
-- instalado e a central sem saber para qual ramal transferir.
UPDATE public.marketing_whatsapp_instances
SET status = 'disconnected',
    external_instance_id = NULL,
    webhook_configured_at = NULL,
    phone_e164 = NULL,
    status_message = 'Servidor da UAZAPI trocado: é preciso ler o QR Code de novo.',
    disconnected_at = now(),
    updated_at = now()
WHERE provider = 'uazapi';
