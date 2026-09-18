-- ============================================================================
-- O PEDIDO DO CHAT É ACHADO PELO TELEFONE
--
-- A armadilha: `orders.customer_id` NÃO é o cliente. Ele aponta para
-- `auth.users` — o usuário que entra no painel. O nome engana, e enganou: o
-- pedido da IA gravava ali o número da FICHA do cliente, o banco recusava, e o
-- pedido não era criado. Pior: a atendente, sem entender a recusa, anunciou ao
-- cliente "Pedido feito".
--
-- Quem amarra o pedido ao cliente do WhatsApp é o TELEFONE, que já vem gravado
-- em `customer_phone`. Este índice é a busca que a conversa faz a cada
-- abertura: "qual o último pedido que o Chat gerou para este número?".
-- ============================================================================

DROP INDEX IF EXISTS orders_chat_ia_por_cliente_idx;

CREATE INDEX IF NOT EXISTS orders_chat_ia_por_telefone_idx
  ON public.orders(tenant_id, customer_phone, created_at DESC)
  WHERE source = 'chat-ia';
