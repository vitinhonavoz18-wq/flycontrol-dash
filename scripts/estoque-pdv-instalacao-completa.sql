-- =============================================================================
-- ESTOQUE & PDV — INSTALAÇÃO COMPLETA
-- =============================================================================
--
-- COMO USAR
--
-- Abra o painel do Supabase do projeto FLYCONTROL, vá em "SQL Editor", cole
-- este arquivo inteiro e clique em Run. É uma vez só.
--
-- É SEGURO RODAR MAIS DE UMA VEZ. Tudo aqui é escrito no modo "crie se ainda
-- não existir". Rodar duas vezes por engano não duplica tabela nem apaga
-- nada — como conferir se a porta está trancada girando a chave de novo.
--
-- NÃO MEXE EM NADA DO QUE JÁ EXISTE. Nenhuma tabela atual (pedidos, cardápio,
-- lojas, clientes) é alterada. Este arquivo só ACRESCENTA as tabelas novas do
-- módulo de estoque.
--
-- O QUE ELE CRIA
--
--   1. As 14 tabelas do estoque, cada uma trancada por loja;
--   2. O motor que mexe no saldo — o único caminho pelo qual a quantidade
--      muda, e o que garante que dois caixas não vendam a mesma última
--      unidade nem que um pedido desconte duas vezes;
--   3. A venda no balcão e a baixa automática por pedido.
--
-- Este arquivo é a junção das três migrações do repositório, na ordem certa:
--   20260908030000_estoque_e_pdv_fundacao.sql
--   20260908031000_estoque_motor_de_movimentacao.sql
--   20260908032000_estoque_venda_balcao_e_baixa_por_pedido.sql
--
-- =============================================================================



-- ===========================================================================
-- ARQUIVO: 20260908030000_estoque_e_pdv_fundacao.sql
-- ===========================================================================

-- ESTOQUE & PDV — a fundação.
--
-- ============================================================================
-- AS QUATRO DECISÕES QUE MANDAM EM TODO O RESTO
-- ============================================================================
--
-- 1. O ESTOQUE NÃO É UM NÚMERO QUE SE EDITA. É O SALDO DE UM CADERNO.
--
--    Ninguém "escreve 30" no estoque da Coca-Cola. Registra-se uma entrada de
--    24 e uma saída de 2, e o saldo VIRA 30 por consequência. Toda alteração
--    passa por `inventory_movements`.
--
--    É o extrato do banco: o saldo não é um campo que o gerente digita, é o
--    resultado do que entrou e do que saiu. Se alguém pudesse digitar o saldo
--    direto, o extrato deixaria de explicar o dinheiro.
--
--    A coluna `stock_base` existe por velocidade (somar o caderno inteiro a
--    cada tela seria lento com milhares de produtos), mas ela SÓ é alterada
--    junto com a gravação da movimentação, na mesma operação, pela função
--    `inventory_apply_movement`. Nunca por UPDATE solto.
--
-- 2. TUDO É GUARDADO NUMA UNIDADE BASE.
--
--    Se o produto é controlado em "unidade" e chega 1 caixa de 12, o caderno
--    anota 12. Sempre 12. A caixa é só o jeito de FALAR a quantidade na hora
--    de digitar, nunca o jeito de guardar.
--
--    Sem essa regra, um dia o saldo seria "10" e ninguém saberia se são 10
--    latas ou 10 caixas — como um estoquista anotando "10" sem dizer de quê.
--
-- 3. DINHEIRO EM CENTAVOS INTEIROS.
--
--    Regra da casa (ver CLAUDE.md). R$ 12,00 é gravado como 1200. Nunca 12.00.
--    Centavo quebrado em conta decimal vira diferença de caixa no fim do mês.
--
-- 4. NENHUMA LOJA VÊ A LOJA DO VIZINHO.
--
--    Toda tabela carrega `pizzeria_id` e tem regra de acesso ligada. Mesmo que
--    o navegador peça o estoque de outra loja, o banco recusa.
--
-- ============================================================================

-- ---------------------------------------------------------------------------
-- CATEGORIAS DE ESTOQUE
-- ---------------------------------------------------------------------------
-- Próprias do estoque, separadas das categorias do cardápio: "Limpeza" e
-- "Embalagens" são categorias de estoque que nunca deveriam aparecer para o
-- cliente escolhendo o que comer.
CREATE TABLE IF NOT EXISTS public.inventory_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pizzeria_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_categories_nome_nao_vazio CHECK (btrim(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_categories_uma_por_loja
  ON public.inventory_categories (pizzeria_id, lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- FORNECEDORES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pizzeria_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  legal_name TEXT,
  trade_name TEXT,
  tax_id TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_suppliers_nome_nao_vazio CHECK (btrim(name) <> '')
);

CREATE INDEX IF NOT EXISTS inventory_suppliers_por_loja
  ON public.inventory_suppliers (pizzeria_id, active, name);

-- ---------------------------------------------------------------------------
-- PRODUTOS DE ESTOQUE
-- ---------------------------------------------------------------------------
-- ATENÇÃO: produto de estoque NÃO é produto do cardápio.
--
-- O cardápio vende "X-Burguer". O estoque controla "pão", "hambúrguer" e
-- "queijo". São coisas diferentes, e por isso moram em tabelas diferentes,
-- ligadas por `menu_product_inventory_links`. Misturar as duas hoje tornaria
-- a ficha técnica impossível amanhã sem refazer tudo.
CREATE TABLE IF NOT EXISTS public.inventory_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pizzeria_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.inventory_categories(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  description TEXT,
  brand TEXT,
  internal_code TEXT,
  sku TEXT,
  barcode TEXT,

  image_url TEXT,
  -- Fotos extras. Lista simples de endereços, porque anexo de produto não
  -- tem regra nenhuma além de "aparecer na ordem em que foi posto".
  images JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Dinheiro em centavos inteiros. R$ 8,00 = 800.
  cost_cents INTEGER NOT NULL DEFAULT 0,
  price_cents INTEGER NOT NULL DEFAULT 0,

  -- A unidade em que o saldo é guardado. Tudo converte para cá.
  base_unit TEXT NOT NULL DEFAULT 'unidade',
  -- A unidade que aparece por padrão na tela de venda (pode ser a base).
  sale_unit TEXT,

  -- Quantidades com casas decimais porque Kg e Litro precisam: 1,250 kg é
  -- uma quantidade legítima de carne.
  stock_base NUMERIC(14,3) NOT NULL DEFAULT 0,
  min_stock_base NUMERIC(14,3) NOT NULL DEFAULT 0,
  ideal_stock_base NUMERIC(14,3),

  allow_negative_stock BOOLEAN NOT NULL DEFAULT FALSE,
  low_stock_alert_enabled BOOLEAN NOT NULL DEFAULT TRUE,

  location TEXT,
  aisle TEXT,
  shelf TEXT,

  active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Produto com histórico NUNCA é apagado de verdade: apagar a linha levaria
  -- junto o extrato de tudo que entrou e saiu dele. Ele é aposentado.
  deleted_at TIMESTAMPTZ,

  -- Marca de "já avisei que este produto está acabando". Serve para não
  -- mandar o mesmo aviso todo dia. Ver `inventory_apply_movement`.
  low_stock_notified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT inventory_products_nome_nao_vazio CHECK (btrim(name) <> ''),
  CONSTRAINT inventory_products_custo_nao_negativo CHECK (cost_cents >= 0),
  CONSTRAINT inventory_products_preco_nao_negativo CHECK (price_cents >= 0),
  CONSTRAINT inventory_products_minimo_nao_negativo CHECK (min_stock_base >= 0),
  CONSTRAINT inventory_products_unidade_base_nao_vazia CHECK (btrim(base_unit) <> '')
);

-- Busca por nome é a mais usada da tela de produtos. Sem índice, uma loja com
-- 5 mil itens faria o banco ler os 5 mil a cada letra digitada.
CREATE INDEX IF NOT EXISTS inventory_products_por_loja
  ON public.inventory_products (pizzeria_id, active, name);

CREATE INDEX IF NOT EXISTS inventory_products_por_categoria
  ON public.inventory_products (pizzeria_id, category_id);

-- Estes três são o que o leitor de código de barras e a busca do PDV usam.
-- Únicos por loja: dois produtos com o mesmo código de barras fariam a
-- pistola do caixa registrar o item errado.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_products_sku_unico
  ON public.inventory_products (pizzeria_id, lower(btrim(sku)))
  WHERE sku IS NOT NULL AND btrim(sku) <> '' AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_products_barcode_unico
  ON public.inventory_products (pizzeria_id, btrim(barcode))
  WHERE barcode IS NOT NULL AND btrim(barcode) <> '' AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_products_codigo_interno_unico
  ON public.inventory_products (pizzeria_id, lower(btrim(internal_code)))
  WHERE internal_code IS NOT NULL AND btrim(internal_code) <> '' AND deleted_at IS NULL;

-- Lista "estoque baixo" e "sem estoque" do painel.
CREATE INDEX IF NOT EXISTS inventory_products_estoque_baixo
  ON public.inventory_products (pizzeria_id, stock_base)
  WHERE active = TRUE AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- CONVERSÃO DE EMBALAGEM  (1 caixa = 12 unidades)
-- ---------------------------------------------------------------------------
-- Cada linha responde: "1 <unit> deste produto equivale a quantas unidades
-- base?". Caixa de Coca-Cola lata → 12. Fardo de água → 6.
CREATE TABLE IF NOT EXISTS public.inventory_package_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pizzeria_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
  unit TEXT NOT NULL,
  base_quantity NUMERIC(14,3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_package_unidade_nao_vazia CHECK (btrim(unit) <> ''),
  -- Fator zero ou negativo transformaria uma entrada de 10 caixas em zero ou
  -- em uma saída. Melhor a caneta travar no cadastro.
  CONSTRAINT inventory_package_fator_positivo CHECK (base_quantity > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_package_uma_por_produto
  ON public.inventory_package_conversions (product_id, lower(btrim(unit)));

-- ---------------------------------------------------------------------------
-- FORNECEDORES → ENTRADAS DE MERCADORIA
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pizzeria_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.inventory_suppliers(id) ON DELETE SET NULL,
  invoice_number TEXT,
  notes TEXT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_cost_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'concluida',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_entries_status_valido
    CHECK (status IN ('rascunho', 'concluida', 'cancelada'))
);

CREATE INDEX IF NOT EXISTS inventory_entries_por_loja
  ON public.inventory_entries (pizzeria_id, entry_date DESC);

CREATE TABLE IF NOT EXISTS public.inventory_entry_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.inventory_entries(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,3) NOT NULL,
  unit TEXT NOT NULL,
  quantity_base NUMERIC(14,3) NOT NULL,
  unit_cost_cents INTEGER NOT NULL DEFAULT 0,
  batch TEXT,
  expires_at DATE,
  CONSTRAINT inventory_entry_items_quantidade_positiva CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS inventory_entry_items_por_entrada
  ON public.inventory_entry_items (entry_id);

-- ---------------------------------------------------------------------------
-- VENDA NO BALCÃO (PDV)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pos_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pizzeria_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  sale_number BIGINT,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  surcharge_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'concluida',
  operator_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  CONSTRAINT pos_sales_status_valido CHECK (status IN ('concluida', 'cancelada')),
  CONSTRAINT pos_sales_total_nao_negativo CHECK (total_cents >= 0)
);

CREATE INDEX IF NOT EXISTS pos_sales_por_loja
  ON public.pos_sales (pizzeria_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pos_sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.pos_sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  quantity NUMERIC(14,3) NOT NULL,
  unit TEXT NOT NULL,
  quantity_base NUMERIC(14,3) NOT NULL,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT pos_sale_items_quantidade_positiva CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS pos_sale_items_por_venda
  ON public.pos_sale_items (sale_id);

-- ---------------------------------------------------------------------------
-- INVENTÁRIO (CONTAGEM FÍSICA)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pizzeria_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'todos',
  category_id UUID REFERENCES public.inventory_categories(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'em_andamento',
  started_by UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  divergence_count INTEGER NOT NULL DEFAULT 0,
  divergence_value_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  CONSTRAINT inventory_counts_status_valido
    CHECK (status IN ('em_andamento', 'concluido', 'cancelado')),
  CONSTRAINT inventory_counts_escopo_valido
    CHECK (scope IN ('todos', 'categoria', 'selecionados'))
);

CREATE INDEX IF NOT EXISTS inventory_counts_por_loja
  ON public.inventory_counts (pizzeria_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.inventory_count_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id UUID NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
  -- O saldo que o sistema achava que tinha, congelado no momento da contagem.
  system_quantity_base NUMERIC(14,3) NOT NULL,
  -- O que a pessoa contou na prateleira. Nulo = ainda não contou.
  counted_quantity_base NUMERIC(14,3),
  applied BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (count_id, product_id)
);

CREATE INDEX IF NOT EXISTS inventory_count_items_por_contagem
  ON public.inventory_count_items (count_id);

-- ---------------------------------------------------------------------------
-- O CADERNO: MOVIMENTAÇÕES
-- ---------------------------------------------------------------------------
-- Esta é a tabela mais importante do módulo. Ela é o extrato do estoque, e
-- linha de extrato não se apaga nem se corrige por cima: se algo entrou
-- errado, registra-se o estorno. Assim a pergunta "por que o saldo é 28?"
-- sempre tem resposta.
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pizzeria_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE RESTRICT,

  direction TEXT NOT NULL,
  reason TEXT NOT NULL,

  -- Como a pessoa digitou: "10 caixas".
  quantity NUMERIC(14,3) NOT NULL,
  unit TEXT NOT NULL,
  -- Como o caderno guarda: 120 (com sinal — negativo quando é saída).
  quantity_base NUMERIC(14,3) NOT NULL,

  stock_before NUMERIC(14,3) NOT NULL,
  stock_after NUMERIC(14,3) NOT NULL,

  user_id UUID,
  notes TEXT,

  -- DE ONDE VEIO. É isto que impede a baixa dobrada.
  --
  -- Quando o pedido #1532 desconta 2 Coca-Cola, fica gravado
  -- source_type='order', source_id=<id do pedido>, source_item_id=<id do item>.
  -- Se o mesmo aviso de "pedido confirmado" chegar duas vezes, a segunda
  -- esbarra no índice único lá embaixo e não desconta de novo.
  source_type TEXT,
  source_id UUID,
  source_item_id TEXT,

  supplier_id UUID REFERENCES public.inventory_suppliers(id) ON DELETE SET NULL,
  entry_id UUID REFERENCES public.inventory_entries(id) ON DELETE SET NULL,
  pos_sale_id UUID REFERENCES public.pos_sales(id) ON DELETE SET NULL,
  order_id UUID,
  count_id UUID REFERENCES public.inventory_counts(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT inventory_movements_direcao_valida CHECK (direction IN ('in', 'out')),
  CONSTRAINT inventory_movements_quantidade_positiva CHECK (quantity > 0),
  -- Entrada soma, saída subtrai. Um registro dizendo "saída de +5" seria um
  -- extrato que não fecha com o saldo.
  CONSTRAINT inventory_movements_sinal_coerente CHECK (
    (direction = 'in' AND quantity_base > 0) OR
    (direction = 'out' AND quantity_base < 0)
  ),
  CONSTRAINT inventory_movements_saldo_coerente CHECK (
    stock_after = stock_before + quantity_base
  ),
  CONSTRAINT inventory_movements_motivo_valido CHECK (reason IN (
    -- entradas
    'compra_fornecedor', 'reposicao', 'devolucao_cliente', 'ajuste_positivo',
    'inventario_entrada', 'estorno_cancelamento', 'outra_entrada',
    -- saídas
    'venda_online', 'venda_balcao', 'perda', 'vencido', 'danificado',
    'uso_interno', 'ajuste_negativo', 'inventario_saida', 'outra_saida'
  ))
);

CREATE INDEX IF NOT EXISTS inventory_movements_por_produto
  ON public.inventory_movements (product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inventory_movements_por_loja
  ON public.inventory_movements (pizzeria_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inventory_movements_por_usuario
  ON public.inventory_movements (pizzeria_id, user_id, created_at DESC);

-- A TRAVA CONTRA BAIXA DOBRADA.
--
-- É o caderno de reservas que só aceita um nome por mesa: se o mesmo pedido
-- tentar descontar o mesmo item duas vezes, a caneta trava. Vale só para
-- movimentações que vieram de algum lugar identificável (pedido, venda de
-- balcão, contagem) — ajuste feito na mão pelo dono não tem origem e pode
-- repetir à vontade, porque ali quem decide é ele.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_movements_origem_unica
  ON public.inventory_movements (source_type, source_id, source_item_id, reason)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- VÍNCULO CARDÁPIO → ESTOQUE  (e a ficha técnica)
-- ---------------------------------------------------------------------------
-- Uma linha = "vender 1 deste item do cardápio consome X deste produto de
-- estoque".
--
-- Coca-Cola 2L do cardápio → 1 Coca-Cola 2L do estoque. Uma linha só.
--
-- X-Burguer → 1 pão + 1 hambúrguer + 2 queijo + 1 embalagem. Quatro linhas.
--
-- A ficha técnica não precisou de tabela nova: ela é o caso de várias linhas
-- para o mesmo item do cardápio. Por isso o vínculo já nasce assim, mesmo que
-- a tela de ficha técnica venha depois — mudar isso mais tarde exigiria
-- reescrever toda a baixa por pedido.
CREATE TABLE IF NOT EXISTS public.menu_product_inventory_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pizzeria_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  menu_product_id UUID NOT NULL REFERENCES public.menu_products(id) ON DELETE CASCADE,
  inventory_product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
  -- Quanto do produto de estoque sai a cada 1 vendido no cardápio.
  quantity_base NUMERIC(14,3) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT menu_product_links_quantidade_positiva CHECK (quantity_base > 0),
  UNIQUE (menu_product_id, inventory_product_id)
);

CREATE INDEX IF NOT EXISTS menu_product_links_por_menu
  ON public.menu_product_inventory_links (menu_product_id);

CREATE INDEX IF NOT EXISTS menu_product_links_por_estoque
  ON public.menu_product_inventory_links (inventory_product_id);

-- ---------------------------------------------------------------------------
-- CONFIGURAÇÕES DO MÓDULO, POR LOJA
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_settings (
  pizzeria_id UUID PRIMARY KEY REFERENCES public.pizzerias(id) ON DELETE CASCADE,

  -- QUANDO O PEDIDO DESCONTA O ESTOQUE.
  --
  -- O padrão é "confirmado" de propósito. Descontar na CRIAÇÃO faria todo
  -- pedido abandonado no carrinho segurar mercadoria que ninguém comprou —
  -- como reservar a mesa de quem só perguntou o preço pelo telefone.
  -- Descontar só na ENTREGA deixaria o saldo mentindo a tarde inteira.
  deduct_on_status TEXT NOT NULL DEFAULT 'preparando',

  -- Ligar/desligar a baixa automática por pedido sem perder o resto do módulo.
  auto_deduct_orders BOOLEAN NOT NULL DEFAULT TRUE,

  low_stock_notifications BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Os valores são os status que a tabela `orders` realmente usa. Inventar um
  -- status aqui faria a baixa nunca disparar, em silêncio.
  CONSTRAINT inventory_settings_momento_valido
    CHECK (deduct_on_status IN ('novo', 'preparando', 'saiu', 'entregue'))
);

-- ---------------------------------------------------------------------------
-- SEGURANÇA: CADA LOJA VÊ SÓ O QUE É DELA
-- ---------------------------------------------------------------------------
-- Mesma dupla de porteiros que o resto do sistema já usa (`is_admin()` e
-- `owns_pizzeria()`), para não existir uma segunda regra de acesso divergindo
-- da primeira.
--
-- Diferente do cardápio, NADA aqui é público: preço de custo, fornecedor e
-- margem são informação de dentro da casa. Não existe política para visitante.
DO $$
DECLARE
  t TEXT;
  tabelas TEXT[] := ARRAY[
    'inventory_categories', 'inventory_suppliers', 'inventory_products',
    'inventory_package_conversions', 'inventory_entries', 'inventory_movements',
    'inventory_counts', 'pos_sales', 'menu_product_inventory_links',
    'inventory_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Manage ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL
         USING (is_admin() OR owns_pizzeria(auth.uid(), pizzeria_id))
         WITH CHECK (is_admin() OR owns_pizzeria(auth.uid(), pizzeria_id))',
      'Manage ' || t, t
    );
  END LOOP;
END $$;

-- As tabelas "filhas" não têm `pizzeria_id` próprio: elas pertencem a um pai
-- que já tem. A regra delas pergunta ao pai — assim não existe a chance de o
-- pai ser da loja A e o filho da loja B.
ALTER TABLE public.inventory_entry_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Manage inventory_entry_items" ON public.inventory_entry_items;
CREATE POLICY "Manage inventory_entry_items" ON public.inventory_entry_items
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.inventory_entries e
    WHERE e.id = inventory_entry_items.entry_id
      AND (is_admin() OR owns_pizzeria(auth.uid(), e.pizzeria_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.inventory_entries e
    WHERE e.id = inventory_entry_items.entry_id
      AND (is_admin() OR owns_pizzeria(auth.uid(), e.pizzeria_id))
  ));

ALTER TABLE public.pos_sale_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Manage pos_sale_items" ON public.pos_sale_items;
CREATE POLICY "Manage pos_sale_items" ON public.pos_sale_items
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.pos_sales s
    WHERE s.id = pos_sale_items.sale_id
      AND (is_admin() OR owns_pizzeria(auth.uid(), s.pizzeria_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pos_sales s
    WHERE s.id = pos_sale_items.sale_id
      AND (is_admin() OR owns_pizzeria(auth.uid(), s.pizzeria_id))
  ));

ALTER TABLE public.inventory_count_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Manage inventory_count_items" ON public.inventory_count_items;
CREATE POLICY "Manage inventory_count_items" ON public.inventory_count_items
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.inventory_counts c
    WHERE c.id = inventory_count_items.count_id
      AND (is_admin() OR owns_pizzeria(auth.uid(), c.pizzeria_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.inventory_counts c
    WHERE c.id = inventory_count_items.count_id
      AND (is_admin() OR owns_pizzeria(auth.uid(), c.pizzeria_id))
  ));

COMMENT ON TABLE public.inventory_movements IS
  'Extrato do estoque. Linha nunca e apagada nem corrigida por cima: erro se conserta com movimentacao inversa (estorno).';


-- ===========================================================================
-- ARQUIVO: 20260908031000_estoque_motor_de_movimentacao.sql
-- ===========================================================================

-- O MOTOR DO ESTOQUE.
--
-- Toda alteração de saldo do sistema inteiro passa por aqui. Tela de produto,
-- venda no balcão, entrada de mercadoria, baixa por pedido, inventário: todos
-- chamam esta função. Um caminho só.
--
-- POR QUE ISTO É UMA FUNÇÃO DO BANCO, E NÃO CÓDIGO NO SERVIDOR
--
-- Três garantias que só o banco consegue dar de verdade:
--
--   1. OU ACONTECE TUDO, OU NÃO ACONTECE NADA. Gravar a movimentação e
--      atualizar o saldo são um ato só. No meio do caminho não existe estado
--      em que a venda foi registrada e o estoque não desceu.
--
--   2. DOIS CAIXAS NÃO VENDEM A MESMA ÚLTIMA UNIDADE. Sobrou 1 Coca-Cola e
--      dois atendentes clicam "finalizar" no mesmo segundo: o segundo espera
--      o primeiro terminar e então descobre que o saldo agora é 0. Sem isso,
--      os dois leriam "tem 1" ao mesmo tempo e os dois venderiam.
--
--   3. O MESMO PEDIDO NÃO DESCONTA DUAS VEZES. Se o aviso de "pedido
--      confirmado" chegar repetido, a segunda vez não faz nada.
--
-- Se essas regras morassem no servidor, cada tela nova seria uma chance de
-- alguém esquecer uma delas.

CREATE OR REPLACE FUNCTION public.inventory_apply_movement(
  p_product_id UUID,
  p_direction TEXT,
  p_reason TEXT,
  p_quantity NUMERIC,
  p_unit TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_source_type TEXT DEFAULT NULL,
  p_source_id UUID DEFAULT NULL,
  p_source_item_id TEXT DEFAULT NULL,
  p_supplier_id UUID DEFAULT NULL,
  p_entry_id UUID DEFAULT NULL,
  p_pos_sale_id UUID DEFAULT NULL,
  p_order_id UUID DEFAULT NULL,
  p_count_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_produto RECORD;
  v_fator NUMERIC;
  v_qtd_base NUMERIC;
  v_com_sinal NUMERIC;
  v_antes NUMERIC;
  v_depois NUMERIC;
  v_id UUID;
  v_existente RECORD;
  v_unidade TEXT;
  v_ator UUID;
  v_baixo_antes BOOLEAN;
  v_baixo_depois BOOLEAN;
  v_cruzou BOOLEAN := FALSE;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'QUANTIDADE_INVALIDA'
      USING HINT = 'A quantidade precisa ser maior que zero.';
  END IF;

  IF p_direction NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'DIRECAO_INVALIDA'
      USING HINT = 'Movimentação precisa ser entrada (in) ou saída (out).';
  END IF;

  -- ------------------------------------------------------------------
  -- 1. JÁ FOI FEITA? (a trava contra baixa dobrada)
  -- ------------------------------------------------------------------
  -- Conferido ANTES de qualquer gravação. Se o mesmo pedido já descontou este
  -- item, devolvemos o que aconteceu da primeira vez e paramos por aqui — sem
  -- erro, porque repetir o aviso não é culpa de ninguém, e sem descontar de
  -- novo, porque a mercadoria só saiu uma vez.
  IF p_source_type IS NOT NULL AND p_source_id IS NOT NULL THEN
    SELECT * INTO v_existente
      FROM inventory_movements
     WHERE source_type = p_source_type
       AND source_id = p_source_id
       AND source_item_id IS NOT DISTINCT FROM p_source_item_id
       AND reason = p_reason
     LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'applied', FALSE,
        'status', 'ja_aplicado',
        'movement_id', v_existente.id,
        'stock_before', v_existente.stock_before,
        'stock_after', v_existente.stock_after
      );
    END IF;
  END IF;

  -- ------------------------------------------------------------------
  -- 2. PEGA O PRODUTO E TRANCA A LINHA
  -- ------------------------------------------------------------------
  -- `FOR UPDATE` é a fila do caixa: quem chegar depois espera esta operação
  -- terminar antes de ler o saldo. É o que impede dois atendentes de venderem
  -- a mesma última unidade.
  SELECT * INTO v_produto
    FROM inventory_products
   WHERE id = p_product_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUTO_NAO_ENCONTRADO'
      USING HINT = 'Produto não existe ou foi removido do estoque.';
  END IF;

  -- ------------------------------------------------------------------
  -- 3. QUEM ESTÁ MEXENDO TEM DIREITO?
  -- ------------------------------------------------------------------
  -- Esta função grava passando por cima das regras de acesso das tabelas
  -- (é o que permite registrar a movimentação junto com o saldo). Por isso a
  -- conferência de dono acontece aqui dentro, à mão. Sem ela, a função seria
  -- uma porta lateral para mexer no estoque de qualquer loja.
  --
  -- A primeira condição libera o próprio sistema (a baixa automática do
  -- pedido roda sem ninguém logado, em nome do servidor).
  IF NOT (
    current_user = 'service_role'
    OR is_admin()
    OR owns_pizzeria(auth.uid(), v_produto.pizzeria_id)
  ) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO'
      USING HINT = 'Este produto pertence a outra loja.';
  END IF;

  v_ator := COALESCE(p_user_id, auth.uid());

  -- ------------------------------------------------------------------
  -- 4. CONVERTE PARA A UNIDADE BASE
  -- ------------------------------------------------------------------
  -- "10 caixas" vira 120 unidades. O caderno só entende unidade base.
  v_unidade := COALESCE(NULLIF(btrim(p_unit), ''), v_produto.base_unit);

  IF lower(btrim(v_unidade)) = lower(btrim(v_produto.base_unit)) THEN
    v_fator := 1;
  ELSE
    SELECT base_quantity INTO v_fator
      FROM inventory_package_conversions
     WHERE product_id = p_product_id
       AND lower(btrim(unit)) = lower(btrim(v_unidade))
     LIMIT 1;

    IF v_fator IS NULL THEN
      -- Recusar é melhor do que chutar 1. Chutar transformaria "10 caixas"
      -- em 10 unidades e o saldo passaria a mentir sem ninguém perceber.
      RAISE EXCEPTION 'CONVERSAO_NAO_CADASTRADA'
        USING HINT = 'Cadastre quantas unidades tem 1 ' || v_unidade || ' deste produto.';
    END IF;
  END IF;

  v_qtd_base := ROUND(p_quantity * v_fator, 3);
  v_com_sinal := CASE WHEN p_direction = 'in' THEN v_qtd_base ELSE -v_qtd_base END;

  v_antes := v_produto.stock_base;
  v_depois := ROUND(v_antes + v_com_sinal, 3);

  -- ------------------------------------------------------------------
  -- 5. TEM MERCADORIA PARA ISSO?
  -- ------------------------------------------------------------------
  -- Só barra quando a loja não permite saldo negativo. Quem trabalha com
  -- venda a descoberto (comum em depósito de bebidas que já vendeu o que
  -- ainda vai chegar) liga `allow_negative_stock` e passa.
  IF p_direction = 'out'
     AND v_depois < 0
     AND NOT v_produto.allow_negative_stock THEN
    RAISE EXCEPTION 'ESTOQUE_INSUFICIENTE'
      USING HINT = format(
        'Disponível: %s %s. Solicitado: %s %s.',
        trim(to_char(v_antes, 'FM999999990.999')), v_produto.base_unit,
        trim(to_char(v_qtd_base, 'FM999999990.999')), v_produto.base_unit
      );
  END IF;

  -- ------------------------------------------------------------------
  -- 6. GRAVA O CADERNO E O SALDO — NA MESMA OPERAÇÃO
  -- ------------------------------------------------------------------
  INSERT INTO inventory_movements (
    pizzeria_id, product_id, direction, reason,
    quantity, unit, quantity_base,
    stock_before, stock_after,
    user_id, notes,
    source_type, source_id, source_item_id,
    supplier_id, entry_id, pos_sale_id, order_id, count_id
  ) VALUES (
    v_produto.pizzeria_id, p_product_id, p_direction, p_reason,
    p_quantity, v_unidade, v_com_sinal,
    v_antes, v_depois,
    v_ator, p_notes,
    p_source_type, p_source_id, p_source_item_id,
    p_supplier_id, p_entry_id, p_pos_sale_id, p_order_id, p_count_id
  )
  RETURNING id INTO v_id;

  -- ------------------------------------------------------------------
  -- 7. O AVISO DE ESTOQUE BAIXO
  -- ------------------------------------------------------------------
  -- O aviso nasce só na TRAVESSIA: quando o saldo estava acima do mínimo e
  -- passou para igual ou abaixo. Sem isso, cada venda de um produto já baixo
  -- geraria um aviso novo, e o dono receberia vinte avisos da mesma
  -- Coca-Cola num sábado — até parar de olhar os avisos.
  --
  -- Quando o produto é reposto acima do mínimo, a marca é apagada e ele volta
  -- a poder avisar da próxima vez que cair.
  v_baixo_antes := v_produto.min_stock_base > 0 AND v_antes <= v_produto.min_stock_base;
  v_baixo_depois := v_produto.min_stock_base > 0 AND v_depois <= v_produto.min_stock_base;
  v_cruzou := v_produto.low_stock_alert_enabled AND v_baixo_depois AND NOT v_baixo_antes;

  UPDATE inventory_products
     SET stock_base = v_depois,
         updated_at = now(),
         low_stock_notified_at = CASE
           WHEN v_cruzou THEN now()
           WHEN NOT v_baixo_depois THEN NULL
           ELSE low_stock_notified_at
         END
   WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'applied', TRUE,
    'status', 'ok',
    'movement_id', v_id,
    'stock_before', v_antes,
    'stock_after', v_depois,
    'base_unit', v_produto.base_unit,
    'converted_quantity', v_qtd_base,
    'low_stock_crossed', v_cruzou,
    'out_of_stock', v_depois <= 0
  );

EXCEPTION
  -- Duas requisições idênticas que chegam no mesmo instante passam as duas
  -- pela conferência do passo 1 (nenhuma tinha gravado ainda) e as duas tentam
  -- inserir. O índice único deixa só uma passar; a outra cai aqui e é tratada
  -- como repetição, não como erro. É o cinto de segurança do cinto de
  -- segurança.
  WHEN unique_violation THEN
    -- Mas só se for MESMO a trava de origem repetida. Qualquer outra colisão
    -- é um problema de verdade e precisa estourar: engolir aqui devolveria
    -- "já aplicado" para uma baixa que nunca aconteceu, e o saldo passaria a
    -- mentir sem ninguém ver.
    IF p_source_type IS NULL OR p_source_id IS NULL THEN
      RAISE;
    END IF;

    SELECT * INTO v_existente
      FROM inventory_movements
     WHERE source_type = p_source_type
       AND source_id = p_source_id
       AND source_item_id IS NOT DISTINCT FROM p_source_item_id
       AND reason = p_reason
     LIMIT 1;

    IF NOT FOUND THEN
      RAISE;
    END IF;

    RETURN jsonb_build_object(
      'applied', FALSE,
      'status', 'ja_aplicado',
      'movement_id', v_existente.id,
      'stock_before', v_existente.stock_before,
      'stock_after', v_existente.stock_after
    );
END;
$$;

COMMENT ON FUNCTION public.inventory_apply_movement IS
  'Unico caminho para alterar saldo de estoque. Grava movimentacao e saldo na mesma operacao, trava a linha do produto contra venda simultanea e ignora repeticao da mesma origem.';

REVOKE ALL ON FUNCTION public.inventory_apply_movement FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_apply_movement TO authenticated, service_role;


-- ===========================================================================
-- ARQUIVO: 20260908032000_estoque_venda_balcao_e_baixa_por_pedido.sql
-- ===========================================================================

-- VENDA NO BALCÃO E BAIXA POR PEDIDO.
--
-- As duas operações que mexem em VÁRIOS produtos de uma vez. Cada uma é um
-- ato só: ou a venda inteira acontece com todas as baixas, ou nada acontece.
--
-- Vender 3 itens e conseguir baixar só 2 seria pior do que não vender: o
-- cliente leva a sacola cheia e o estoque fica mentindo para sempre.

-- ============================================================================
-- 1. VENDA NO BALCÃO
-- ============================================================================
--
-- O PREÇO NÃO VEM DA TELA.
--
-- A tela manda "produto X, quantidade 2". O preço é buscado AQUI, na ficha do
-- produto. Se o preço viesse junto do pedido da tela, bastaria alguém alterar
-- o que o navegador envia para comprar uma caixa de cerveja por um centavo —
-- como deixar o cliente escrever o valor na própria comanda.
--
-- Desconto e acréscimo continuam vindo da tela, porque são decisão de quem
-- está atendendo, mas entram como valores separados e ficam registrados.

CREATE OR REPLACE FUNCTION public.pos_finalize_sale(
  p_pizzeria_id UUID,
  p_items JSONB,
  p_payment_method TEXT DEFAULT NULL,
  p_discount_cents INTEGER DEFAULT 0,
  p_surcharge_cents INTEGER DEFAULT 0,
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venda_id UUID;
  v_numero BIGINT;
  v_item JSONB;
  v_produto RECORD;
  v_qtd NUMERIC;
  v_unidade TEXT;
  v_fator NUMERIC;
  v_qtd_base NUMERIC;
  v_preco INTEGER;
  v_total_item INTEGER;
  v_subtotal INTEGER := 0;
  v_total INTEGER;
  v_item_id UUID;
  v_desconto INTEGER := GREATEST(COALESCE(p_discount_cents, 0), 0);
  v_acrescimo INTEGER := GREATEST(COALESCE(p_surcharge_cents, 0), 0);
BEGIN
  IF NOT (
    current_user = 'service_role'
    OR is_admin()
    OR owns_pizzeria(auth.uid(), p_pizzeria_id)
  ) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'VENDA_SEM_ITENS'
      USING HINT = 'Adicione ao menos um produto para finalizar a venda.';
  END IF;

  -- O número da venda é sequencial POR LOJA. A trava garante que duas vendas
  -- simultâneas não recebam o mesmo número — dois cupons "venda 47" seriam
  -- dois registros impossíveis de distinguir na conferência do caixa.
  PERFORM pg_advisory_xact_lock(hashtext('pos_sale_number:' || p_pizzeria_id::TEXT));
  SELECT COALESCE(MAX(sale_number), 0) + 1 INTO v_numero
    FROM pos_sales WHERE pizzeria_id = p_pizzeria_id;

  INSERT INTO pos_sales (
    pizzeria_id, sale_number, payment_method, customer_name, customer_phone,
    notes, discount_cents, surcharge_cents, operator_id
  ) VALUES (
    p_pizzeria_id, v_numero, p_payment_method, p_customer_name, p_customer_phone,
    p_notes, v_desconto, v_acrescimo, auth.uid()
  )
  RETURNING id INTO v_venda_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qtd := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    IF v_qtd <= 0 THEN
      RAISE EXCEPTION 'QUANTIDADE_INVALIDA'
        USING HINT = 'Todo item da venda precisa ter quantidade maior que zero.';
    END IF;

    SELECT * INTO v_produto
      FROM inventory_products
     WHERE id = (v_item->>'product_id')::UUID
       AND pizzeria_id = p_pizzeria_id
       AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUTO_NAO_ENCONTRADO'
        USING HINT = 'Um dos produtos da venda não existe nesta loja.';
    END IF;

    v_unidade := COALESCE(NULLIF(btrim(v_item->>'unit'), ''), v_produto.base_unit);

    IF lower(btrim(v_unidade)) = lower(btrim(v_produto.base_unit)) THEN
      v_fator := 1;
    ELSE
      SELECT base_quantity INTO v_fator
        FROM inventory_package_conversions
       WHERE product_id = v_produto.id
         AND lower(btrim(unit)) = lower(btrim(v_unidade))
       LIMIT 1;
      IF v_fator IS NULL THEN
        RAISE EXCEPTION 'CONVERSAO_NAO_CADASTRADA'
          USING HINT = 'Cadastre quantas unidades tem 1 ' || v_unidade || ' de ' || v_produto.name || '.';
      END IF;
    END IF;

    v_qtd_base := ROUND(v_qtd * v_fator, 3);

    -- O preço sai da ficha do produto, multiplicado pelo tamanho da embalagem
    -- vendida: se 1 caixa tem 12 e a lata custa R$ 5,00, a caixa sai R$ 60,00.
    v_preco := ROUND(v_produto.price_cents * v_fator);
    v_total_item := ROUND(v_preco * v_qtd);
    v_subtotal := v_subtotal + v_total_item;

    INSERT INTO pos_sale_items (
      sale_id, product_id, product_name, quantity, unit, quantity_base,
      unit_price_cents, total_cents
    ) VALUES (
      v_venda_id, v_produto.id, v_produto.name, v_qtd, v_unidade, v_qtd_base,
      v_preco, v_total_item
    )
    RETURNING id INTO v_item_id;

    -- A baixa. Se qualquer uma falhar (estoque insuficiente, por exemplo), a
    -- exceção derruba a venda inteira e nada fica gravado.
    PERFORM inventory_apply_movement(
      p_product_id   := v_produto.id,
      p_direction    := 'out',
      p_reason       := 'venda_balcao',
      p_quantity     := v_qtd,
      p_unit         := v_unidade,
      p_notes        := NULL,
      p_source_type  := 'pos_sale',
      p_source_id    := v_venda_id,
      p_source_item_id := v_item_id::TEXT,
      p_pos_sale_id  := v_venda_id
    );
  END LOOP;

  -- Desconto não pode virar troco: uma venda de R$ 10 com R$ 50 de desconto
  -- geraria receita negativa no financeiro.
  v_total := GREATEST(v_subtotal - v_desconto + v_acrescimo, 0);

  UPDATE pos_sales
     SET subtotal_cents = v_subtotal,
         total_cents = v_total
   WHERE id = v_venda_id;

  RETURN jsonb_build_object(
    'sale_id', v_venda_id,
    'sale_number', v_numero,
    'subtotal_cents', v_subtotal,
    'discount_cents', v_desconto,
    'surcharge_cents', v_acrescimo,
    'total_cents', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_finalize_sale FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_finalize_sale TO authenticated, service_role;

-- ============================================================================
-- 2. DE QUAL PRODUTO DE ESTOQUE ESTE ITEM DO PEDIDO SAI?
-- ============================================================================
--
-- ATENÇÃO — LIMITAÇÃO CONHECIDA E IMPORTANTE:
--
-- O item do pedido, do jeito que o FlyControl guarda hoje, NÃO carrega o
-- código do produto. Ele guarda uma fotografia: nome, preço e quantidade.
--
-- Então a ligação com o estoque é feita pelo NOME. É como achar a ficha do
-- cliente pelo nome em vez do CPF: funciona na maior parte das vezes, e falha
-- exatamente quando alguém renomeia o produto ou existem dois parecidos.
--
-- Quando o item TRAZ um código (pedidos criados por caminhos mais novos podem
-- trazer), o código ganha da comparação por nome — porque o código não muda
-- quando o dono corrige o nome do produto no cardápio.
--
-- O conserto definitivo é o item do pedido passar a guardar o código do
-- produto no momento em que o pedido nasce. Isso mexe na criação de pedidos
-- dos dois sistemas e por isso não foi feito aqui.
CREATE OR REPLACE FUNCTION public.inventory_resolve_menu_product(
  p_pizzeria_id UUID,
  p_item JSONB
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_nome TEXT;
  v_candidato TEXT;
BEGIN
  -- 1) Pelo código, quando ele veio.
  FOREACH v_candidato IN ARRAY ARRAY['menu_product_id', 'product_id', 'id'] LOOP
    BEGIN
      IF (p_item->>v_candidato) IS NOT NULL THEN
        SELECT mp.id INTO v_id
          FROM menu_products mp
         WHERE mp.id = (p_item->>v_candidato)::UUID
           AND mp.pizzeria_id = p_pizzeria_id
         LIMIT 1;
        IF v_id IS NOT NULL THEN RETURN v_id; END IF;
      END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      -- Campo existia mas não era um código válido. Segue para o próximo.
      NULL;
    END;
  END LOOP;

  -- 2) Pelo nome, como último recurso.
  v_nome := COALESCE(
    p_item->>'name', p_item->>'product_name', p_item->>'title', p_item->>'nome'
  );
  IF v_nome IS NULL OR btrim(v_nome) = '' THEN RETURN NULL; END IF;

  SELECT mp.id INTO v_id
    FROM menu_products mp
   WHERE mp.pizzeria_id = p_pizzeria_id
     AND lower(btrim(mp.name)) = lower(btrim(v_nome))
   LIMIT 1;

  RETURN v_id;
END;
$$;

-- ============================================================================
-- 3. BAIXA AUTOMÁTICA DO PEDIDO
-- ============================================================================
--
-- Chamada quando o pedido chega no status configurado pela loja. Pode ser
-- chamada quantas vezes for: a partir da segunda, não desconta de novo.

CREATE OR REPLACE FUNCTION public.inventory_deduct_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido RECORD;
  v_item JSONB;
  v_indice INT := 0;
  v_menu_id UUID;
  v_link RECORD;
  v_qtd NUMERIC;
  v_resultado JSONB;
  v_baixados INT := 0;
  v_repetidos INT := 0;
  v_sem_vinculo INT := 0;
  v_avisos JSONB := '[]'::jsonb;
BEGIN
  SELECT id, tenant_id, items, status, order_number
    INTO v_pedido
    FROM orders
   WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO';
  END IF;

  IF NOT (
    current_user = 'service_role'
    OR is_admin()
    OR owns_pizzeria(auth.uid(), v_pedido.tenant_id)
  ) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;

  IF v_pedido.items IS NULL OR jsonb_typeof(v_pedido.items) <> 'array' THEN
    RETURN jsonb_build_object('deducted', 0, 'skipped', 0, 'unlinked', 0);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_pedido.items) LOOP
    v_indice := v_indice + 1;
    v_qtd := COALESCE(
      (v_item->>'qty')::NUMERIC, (v_item->>'quantity')::NUMERIC, 1
    );
    IF v_qtd <= 0 THEN CONTINUE; END IF;

    v_menu_id := inventory_resolve_menu_product(v_pedido.tenant_id, v_item);

    IF v_menu_id IS NULL THEN
      v_sem_vinculo := v_sem_vinculo + 1;
      CONTINUE;
    END IF;

    -- A ficha técnica mora aqui: um item do cardápio pode consumir VÁRIOS
    -- produtos do estoque. Um X-Burguer tira pão, carne, queijo e embalagem.
    -- Uma Coca-Cola tira só a Coca-Cola. O laço é o mesmo para os dois.
    FOR v_link IN
      SELECT l.id, l.inventory_product_id, l.quantity_base
        FROM menu_product_inventory_links l
       WHERE l.menu_product_id = v_menu_id
         AND l.pizzeria_id = v_pedido.tenant_id
    LOOP
      v_resultado := inventory_apply_movement(
        p_product_id     := v_link.inventory_product_id,
        p_direction      := 'out',
        p_reason         := 'venda_online',
        p_quantity       := ROUND(v_qtd * v_link.quantity_base, 3),
        p_unit           := NULL,
        p_notes          := 'Pedido #' || COALESCE(v_pedido.order_number::TEXT, '?'),
        -- A identidade da baixa: pedido + posição do item + vínculo. É o que
        -- faz o aviso repetido não descontar duas vezes.
        p_source_type    := 'order',
        p_source_id      := p_order_id,
        p_source_item_id := v_indice::TEXT || ':' || v_link.id::TEXT,
        p_order_id       := p_order_id
      );

      IF (v_resultado->>'applied')::BOOLEAN THEN
        v_baixados := v_baixados + 1;
        IF (v_resultado->>'low_stock_crossed')::BOOLEAN THEN
          v_avisos := v_avisos || jsonb_build_object(
            'product_id', v_link.inventory_product_id,
            'stock_after', v_resultado->>'stock_after'
          );
        END IF;
      ELSE
        v_repetidos := v_repetidos + 1;
      END IF;
    END LOOP;

    IF NOT EXISTS (
      SELECT 1 FROM menu_product_inventory_links
       WHERE menu_product_id = v_menu_id AND pizzeria_id = v_pedido.tenant_id
    ) THEN
      v_sem_vinculo := v_sem_vinculo + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'deducted', v_baixados,
    'skipped', v_repetidos,
    'unlinked', v_sem_vinculo,
    'low_stock', v_avisos
  );
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_deduct_order FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_deduct_order TO authenticated, service_role;

-- ============================================================================
-- 4. ESTORNO QUANDO O PEDIDO É CANCELADO
-- ============================================================================
--
-- A movimentação antiga NÃO é apagada. Cria-se uma nova, no sentido oposto.
--
-- É o estorno no extrato do banco: a compra errada continua lá, e embaixo
-- aparece a devolução. Apagar a linha original faria o saldo bater e a
-- história sumir — e no dia da conferência ninguém entenderia o que houve.

CREATE OR REPLACE FUNCTION public.inventory_restore_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido RECORD;
  v_mov RECORD;
  v_resultado JSONB;
  v_estornados INT := 0;
  v_repetidos INT := 0;
BEGIN
  SELECT id, tenant_id, order_number INTO v_pedido FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'; END IF;

  IF NOT (
    current_user = 'service_role'
    OR is_admin()
    OR owns_pizzeria(auth.uid(), v_pedido.tenant_id)
  ) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;

  FOR v_mov IN
    SELECT * FROM inventory_movements
     WHERE source_type = 'order'
       AND source_id = p_order_id
       AND direction = 'out'
  LOOP
    v_resultado := inventory_apply_movement(
      p_product_id     := v_mov.product_id,
      p_direction      := 'in',
      p_reason         := 'estorno_cancelamento',
      p_quantity       := ABS(v_mov.quantity_base),
      p_unit           := NULL,
      p_notes          := 'Reposição por cancelamento do pedido #'
                          || COALESCE(v_pedido.order_number::TEXT, '?'),
      -- Origem própria, para o estorno também não acontecer duas vezes se o
      -- cancelamento for avisado repetido.
      p_source_type    := 'order_cancel',
      p_source_id      := p_order_id,
      p_source_item_id := v_mov.id::TEXT,
      p_order_id       := p_order_id
    );

    IF (v_resultado->>'applied')::BOOLEAN THEN
      v_estornados := v_estornados + 1;
    ELSE
      v_repetidos := v_repetidos + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('restored', v_estornados, 'skipped', v_repetidos);
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_restore_order FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_restore_order TO authenticated, service_role;
