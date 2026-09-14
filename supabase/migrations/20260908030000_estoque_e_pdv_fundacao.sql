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
