-- ============================================================================
-- O PEDIDO DA IA ENTRA DIRETO
--
-- A versão anterior guardava um RASCUNHO, que o dono confirmava com um botão.
-- Ele preferiu sem conferência: mais prático. Então o rascunho deixou de
-- existir, e o pedido nasce direto na tabela `orders` — a mesma do site, com a
-- etiqueta `source = 'chat-ia'`.
--
-- POR QUE A TABELA SOME EM VEZ DE FICAR VAZIA
--
-- Uma tabela chamada "rascunhos" que nunca mais recebe rascunho é uma placa
-- apontando para uma rua que não existe mais: daqui a três meses alguém lê o
-- nome, acredita, e escreve código para uma coisa que não acontece. A ligação
-- entre a conversa e o pedido não precisa de tabela — as duas já apontam para
-- a mesma ficha de cliente.
--
-- NADA SE PERDE: a tabela nunca chegou a guardar pedido de verdade. Os que
-- existiram viraram linha em `orders` na hora da confirmação.
--
-- O QUE SEGURA O ERRO AGORA QUE NINGUÉM CONFERE ANTES
--   - o preço continua saindo do cardápio, nunca da IA;
--   - item fora do cardápio não entra, e fica escrito na observação do pedido;
--   - cliente que muda de ideia ATUALIZA o mesmo pedido, em vez de criar dois;
--   - o lojista cancela com um clique dentro da conversa, enquanto a cozinha
--     não começou.
-- ============================================================================

DROP TABLE IF EXISTS public.crm_order_drafts CASCADE;

-- A busca que a conversa faz a cada abertura de tela: "qual o último pedido
-- que o Chat gerou para este cliente?". Sem este índice ela varre a tabela de
-- pedidos inteira da loja, que é a maior tabela do sistema.
CREATE INDEX IF NOT EXISTS orders_chat_ia_por_cliente_idx
  ON public.orders(tenant_id, customer_id, created_at DESC)
  WHERE source = 'chat-ia';
