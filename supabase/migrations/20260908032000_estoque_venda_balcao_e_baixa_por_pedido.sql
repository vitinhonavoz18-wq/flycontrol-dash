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
