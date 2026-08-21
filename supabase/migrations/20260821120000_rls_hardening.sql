-- ---------------------------------------------------------------------------
-- Fechamento das portas abertas no banco (auditoria de segurança).
--
-- Todas as regras removidas aqui liberavam acesso para "anon" — a chave
-- publicável que vai dentro do site e que qualquer pessoa consegue ler no
-- navegador. Na prática era o mesmo que deixar a chave da loja embaixo do
-- tapete: quem soubesse olhar, entrava.
--
-- Nada do que roda hoje depende dessas regras: todo acesso público real passa
-- pelas rotas /api/*, que usam a chave de serviço no servidor e conferem
-- quem está pedindo antes de responder.
-- ---------------------------------------------------------------------------

-- 1. PIZZERIAS — a tabela guarda a `api_key` de cada loja, o token de
--    sincronização do cardápio e o endereço do webhook FIQON. A regra antiga
--    entregava TODAS as colunas de TODA loja ativa para qualquer visitante.
--    Com a api_key em mãos, um estranho consegue lançar pedidos em nome da
--    loja. Fica valendo só a regra de dono/administrador.
DROP POLICY IF EXISTS "pizzerias_public_select" ON public.pizzerias;

-- 2. PIZZERIAS — "adotar loja sem dono": qualquer pessoa logada podia se
--    declarar dona de um estabelecimento que ainda não tivesse dono, e junto
--    levava pedidos, cardápio e faturamento. Só o administrador faz isso
--    agora, pelo painel.
DROP POLICY IF EXISTS "pizzerias_claim_unowned" ON public.pizzerias;

-- 3. ORDERS — inserção anônima de pedidos. Qualquer um podia gravar pedidos
--    direto no banco, em nome de qualquer loja, com o valor que quisesse.
--    Em quem paga por pedido (plano CENTS) isso vira conta inflada; em todos
--    vira pedido falso na cozinha. A entrada legítima é POST /api/orders,
--    que exige a api_key da loja e valida tudo antes de gravar.
DROP POLICY IF EXISTS "orders_insert_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_anon_insert_policy" ON public.orders;

-- 4. RESTAURANT_TABLES — a regra antiga entregava a lista completa de mesas,
--    incluindo o `public_token`, que é justamente o segredo impresso no QR
--    Code da mesa. Entregar o token é entregar a comanda.
DROP POLICY IF EXISTS "tables_anon_select_by_token" ON public.restaurant_tables;

-- 5. TABLE_SESSIONS — leitura pública de TODAS as comandas de TODAS as lojas,
--    com nome do cliente, valores e o `customer_token` (o segredo que
--    identifica o cliente na mesa). Quem consultar a situação de uma comanda
--    usa GET /api/public/table-session-status, que exige conhecer o segredo
--    da própria comanda.
DROP POLICY IF EXISTS "Public can read session lifecycle" ON public.table_sessions;
REVOKE SELECT ON public.table_sessions FROM anon;

-- 6. ORDER_ITEMS — leitura e escrita públicas dos itens de todo pedido de
--    toda loja. As regras de dono/administrador continuam valendo.
DROP POLICY IF EXISTS "Public can view order items" ON public.order_items;
DROP POLICY IF EXISTS "Public can insert order items" ON public.order_items;

-- 7. EXTERNAL_ORDER_LOGS — inserção pública de registros de log. Servia para
--    encher a tabela de lixo de graça. Quem grava log é o servidor.
DROP POLICY IF EXISTS "Public can insert external logs" ON public.external_order_logs;

-- 8. USER_ROLES — todo usuário logado enxergava a lista de quem é
--    administrador da plataforma, um mapa pronto de quem atacar. A regra
--    "Admins can view all roles" já cobre o caso legítimo (cada um vê o
--    próprio papel; administrador vê todos).
DROP POLICY IF EXISTS "user_roles_read_policy" ON public.user_roles;

-- 9. STORAGE (menu-images) — qualquer pessoa logada podia apagar ou trocar
--    a foto de cardápio de qualquer outro restaurante. Agora só mexe em
--    arquivo quem enviou aquele arquivo (ou o administrador).
DROP POLICY IF EXISTS "Authenticated update menu images" ON storage.objects;
CREATE POLICY "Authenticated update menu images" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'menu-images' AND (owner = auth.uid() OR public.is_admin()))
WITH CHECK (bucket_id = 'menu-images' AND (owner = auth.uid() OR public.is_admin()));

DROP POLICY IF EXISTS "Authenticated delete menu images" ON storage.objects;
CREATE POLICY "Authenticated delete menu images" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'menu-images' AND (owner = auth.uid() OR public.is_admin()));

-- 10. Tentativas de login de garçom, para poder frear ataque de força bruta
--     (o robô que testa senha atrás de senha). Mesmo molde de
--     `signup_attempts`.
CREATE TABLE IF NOT EXISTS public.waiter_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  username text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waiter_login_attempts_ip_created
  ON public.waiter_login_attempts (ip_address, created_at DESC);

ALTER TABLE public.waiter_login_attempts ENABLE ROW LEVEL SECURITY;
-- Sem policy nenhuma: só a chave de serviço (o servidor) enxerga e grava.
