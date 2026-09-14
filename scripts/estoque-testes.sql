-- TESTES DAS REGRAS CRÍTICAS DO ESTOQUE (seção 48).
--
-- Rodam contra um Postgres de verdade, com as migrações de verdade aplicadas.
-- Cada teste diz o que esperava e o que aconteceu, e o resultado sai numa
-- tabela no fim — para ninguém precisar ler log procurando erro.

\set ON_ERROR_STOP on
SET client_min_messages = WARNING;

CREATE TEMP TABLE resultado(ordem SERIAL, caso TEXT, veredito TEXT);

DO $$
DECLARE
  v_loja_a UUID; v_loja_b UUID;
  v_dono_a UUID := gen_random_uuid();
  v_dono_b UUID := gen_random_uuid();
  v_coca UUID; v_heineken UUID; v_pao UUID; v_carne UUID; v_queijo UUID;
  v_menu_coca UUID; v_menu_xburguer UUID;
  v_pedido UUID;
  v_r JSONB; v_r2 JSONB;
  v_saldo NUMERIC; v_soma NUMERIC; v_n INT;
  v_erro TEXT;
BEGIN
  -- ---------------- cenário ----------------
  INSERT INTO pizzerias (owner_id, name, plan_type) VALUES (v_dono_a, 'Mercado do Zé', 'premium')
    RETURNING id INTO v_loja_a;
  INSERT INTO pizzerias (owner_id, name, plan_type) VALUES (v_dono_b, 'Loja da Esquina', 'premium')
    RETURNING id INTO v_loja_b;

  PERFORM set_config('test.uid', v_dono_a::TEXT, FALSE);

  INSERT INTO inventory_products (pizzeria_id, name, base_unit, price_cents, cost_cents, min_stock_base)
    VALUES (v_loja_a, 'Coca-Cola lata 350ml', 'unidade', 500, 300, 12) RETURNING id INTO v_coca;
  INSERT INTO inventory_package_conversions (pizzeria_id, product_id, unit, base_quantity)
    VALUES (v_loja_a, v_coca, 'caixa', 12);

  INSERT INTO inventory_products (pizzeria_id, name, base_unit, price_cents, min_stock_base, stock_base)
    VALUES (v_loja_a, 'Heineken 330ml', 'unidade', 800, 12, 48) RETURNING id INTO v_heineken;

  INSERT INTO inventory_products (pizzeria_id, name, base_unit, stock_base)
    VALUES (v_loja_a, 'Pão de hambúrguer', 'unidade', 100) RETURNING id INTO v_pao;
  INSERT INTO inventory_products (pizzeria_id, name, base_unit, stock_base)
    VALUES (v_loja_a, 'Hambúrguer 180g', 'unidade', 50) RETURNING id INTO v_carne;
  INSERT INTO inventory_products (pizzeria_id, name, base_unit, stock_base)
    VALUES (v_loja_a, 'Fatia de queijo', 'unidade', 200) RETURNING id INTO v_queijo;

  INSERT INTO menu_products (pizzeria_id, name) VALUES (v_loja_a, 'Coca-Cola lata')
    RETURNING id INTO v_menu_coca;
  INSERT INTO menu_products (pizzeria_id, name) VALUES (v_loja_a, 'X-Burguer')
    RETURNING id INTO v_menu_xburguer;

  -- =========================================================================
  -- 1. CONVERSÃO DE EMBALAGEM: 10 caixas viram 120 unidades
  -- =========================================================================
  v_r := inventory_apply_movement(
    p_product_id := v_coca, p_direction := 'in', p_reason := 'compra_fornecedor',
    p_quantity := 10, p_unit := 'caixa'
  );
  INSERT INTO resultado(caso, veredito) VALUES (
    'Entrada de 10 caixas vira 120 unidades',
    CASE WHEN (v_r->>'stock_after')::NUMERIC = 120 THEN 'OK'
         ELSE 'FALHOU: saldo ' || (v_r->>'stock_after') END);

  -- e o caderno guarda a quantidade como foi digitada E como foi convertida
  SELECT COUNT(*) INTO v_n FROM inventory_movements
   WHERE product_id = v_coca AND quantity = 10 AND unit = 'caixa' AND quantity_base = 120;
  INSERT INTO resultado(caso, veredito) VALUES (
    'O caderno guarda "10 caixas" e "120 unidades" na mesma linha',
    CASE WHEN v_n = 1 THEN 'OK' ELSE 'FALHOU' END);

  -- =========================================================================
  -- 2. UNIDADE SEM CONVERSÃO CADASTRADA É RECUSADA (não chuta 1)
  -- =========================================================================
  BEGIN
    PERFORM inventory_apply_movement(
      p_product_id := v_coca, p_direction := 'in', p_reason := 'compra_fornecedor',
      p_quantity := 5, p_unit := 'palete'
    );
    INSERT INTO resultado(caso, veredito) VALUES
      ('Unidade não cadastrada é recusada', 'FALHOU: aceitou "palete" sem conversão');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado(caso, veredito) VALUES
      ('Unidade não cadastrada é recusada', 'OK: ' || SQLERRM);
  END;

  -- =========================================================================
  -- 3. SALDO É SEMPRE A SOMA DO CADERNO
  -- =========================================================================
  PERFORM inventory_apply_movement(v_coca, 'out', 'venda_balcao', 3);
  SELECT stock_base INTO v_saldo FROM inventory_products WHERE id = v_coca;
  SELECT SUM(quantity_base) INTO v_soma FROM inventory_movements WHERE product_id = v_coca;
  INSERT INTO resultado(caso, veredito) VALUES (
    'Saldo do produto bate com a soma do extrato',
    CASE WHEN v_saldo = v_soma AND v_saldo = 117 THEN 'OK (117)'
         ELSE 'FALHOU: saldo ' || v_saldo || ' vs extrato ' || v_soma END);

  -- =========================================================================
  -- 4. ESTOQUE INSUFICIENTE BLOQUEIA
  -- =========================================================================
  BEGIN
    PERFORM inventory_apply_movement(v_coca, 'out', 'venda_balcao', 500);
    INSERT INTO resultado(caso, veredito) VALUES
      ('Venda maior que o estoque é bloqueada', 'FALHOU: deixou vender 500 de 117');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado(caso, veredito) VALUES
      ('Venda maior que o estoque é bloqueada', 'OK: ' || SQLERRM);
  END;

  -- e o saldo não mudou depois da tentativa recusada
  SELECT stock_base INTO v_saldo FROM inventory_products WHERE id = v_coca;
  INSERT INTO resultado(caso, veredito) VALUES (
    'Tentativa recusada não mexe no saldo',
    CASE WHEN v_saldo = 117 THEN 'OK' ELSE 'FALHOU: virou ' || v_saldo END);

  -- =========================================================================
  -- 5. LOJA QUE PERMITE NEGATIVO CONSEGUE VENDER A DESCOBERTO
  -- =========================================================================
  UPDATE inventory_products SET allow_negative_stock = TRUE WHERE id = v_coca;
  v_r := inventory_apply_movement(v_coca, 'out', 'venda_balcao', 200);
  INSERT INTO resultado(caso, veredito) VALUES (
    'Com venda a descoberto liberada, o saldo pode ficar negativo',
    CASE WHEN (v_r->>'stock_after')::NUMERIC = -83 THEN 'OK (-83)'
         ELSE 'FALHOU: ' || (v_r->>'stock_after') END);
  -- devolve para não atrapalhar os próximos testes
  PERFORM inventory_apply_movement(v_coca, 'in', 'ajuste_positivo', 200);
  UPDATE inventory_products SET allow_negative_stock = FALSE WHERE id = v_coca;

  -- =========================================================================
  -- 6. IDEMPOTÊNCIA: mesma origem duas vezes = uma baixa só
  -- =========================================================================
  v_r := inventory_apply_movement(
    p_product_id := v_heineken, p_direction := 'out', p_reason := 'venda_online',
    p_quantity := 6, p_source_type := 'order', p_source_id := gen_random_uuid(),
    p_source_item_id := '1:abc'
  );
  v_r2 := inventory_apply_movement(
    p_product_id := v_heineken, p_direction := 'out', p_reason := 'venda_online',
    p_quantity := 6, p_source_type := 'order',
    p_source_id := (SELECT source_id FROM inventory_movements WHERE id = (v_r->>'movement_id')::UUID),
    p_source_item_id := '1:abc'
  );
  SELECT stock_base INTO v_saldo FROM inventory_products WHERE id = v_heineken;
  INSERT INTO resultado(caso, veredito) VALUES (
    'Mesmo aviso repetido não desconta duas vezes',
    CASE WHEN (v_r2->>'applied')::BOOLEAN = FALSE AND v_saldo = 42 THEN 'OK (42, uma baixa só)'
         ELSE 'FALHOU: applied=' || (v_r2->>'applied') || ' saldo=' || v_saldo END);

  -- =========================================================================
  -- 7. ALERTA DE ESTOQUE BAIXO SÓ NA TRAVESSIA
  -- =========================================================================
  -- Heineken: saldo 42, mínimo 12. Cai para 10 → cruza (avisa).
  v_r := inventory_apply_movement(v_heineken, 'out', 'venda_balcao', 32);
  INSERT INTO resultado(caso, veredito) VALUES (
    'Avisa quando o saldo cruza o mínimo pela primeira vez',
    CASE WHEN (v_r->>'low_stock_crossed')::BOOLEAN THEN 'OK' ELSE 'FALHOU: não avisou' END);

  -- Já está baixo. Vender mais 2 NÃO deve avisar de novo.
  v_r := inventory_apply_movement(v_heineken, 'out', 'venda_balcao', 2);
  INSERT INTO resultado(caso, veredito) VALUES (
    'Não repete o aviso a cada venda de produto já baixo',
    CASE WHEN NOT (v_r->>'low_stock_crossed')::BOOLEAN THEN 'OK' ELSE 'FALHOU: avisou de novo' END);

  -- Repõe acima do mínimo: a marca de "já avisei" tem que sumir.
  PERFORM inventory_apply_movement(v_heineken, 'in', 'compra_fornecedor', 40);
  SELECT COUNT(*) INTO v_n FROM inventory_products
   WHERE id = v_heineken AND low_stock_notified_at IS NULL;
  INSERT INTO resultado(caso, veredito) VALUES (
    'Repor acima do mínimo rearma o aviso',
    CASE WHEN v_n = 1 THEN 'OK' ELSE 'FALHOU: marca não foi limpa' END);

  -- E ao cair de novo, avisa de novo.
  v_r := inventory_apply_movement(v_heineken, 'out', 'venda_balcao', 40);
  INSERT INTO resultado(caso, veredito) VALUES (
    'Depois de reposto, volta a avisar quando cair',
    CASE WHEN (v_r->>'low_stock_crossed')::BOOLEAN THEN 'OK' ELSE 'FALHOU' END);

  -- =========================================================================
  -- 8. ISOLAMENTO ENTRE LOJAS
  -- =========================================================================
  PERFORM set_config('test.uid', v_dono_b::TEXT, FALSE);
  BEGIN
    PERFORM inventory_apply_movement(v_coca, 'out', 'venda_balcao', 1);
    INSERT INTO resultado(caso, veredito) VALUES
      ('Loja não mexe no estoque da loja vizinha', 'FALHOU: deixou mexer!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado(caso, veredito) VALUES
      ('Loja não mexe no estoque da loja vizinha', 'OK: ' || SQLERRM);
  END;
  PERFORM set_config('test.uid', v_dono_a::TEXT, FALSE);

  -- =========================================================================
  -- 9. VENDA NO BALCÃO: preço vem do banco, não da tela
  -- =========================================================================
  -- A tela manda preço de 1 centavo. O sistema tem que ignorar e usar R$ 5,00.
  v_r := pos_finalize_sale(
    p_pizzeria_id := v_loja_a,
    p_items := jsonb_build_array(
      jsonb_build_object('product_id', v_coca, 'quantity', 2, 'unit_price_cents', 1)
    ),
    p_payment_method := 'pix'
  );
  INSERT INTO resultado(caso, veredito) VALUES (
    'Preço da venda vem da ficha do produto, não do que a tela mandou',
    CASE WHEN (v_r->>'subtotal_cents')::INT = 1000 THEN 'OK (R$ 10,00)'
         ELSE 'FALHOU: R$ ' || ((v_r->>'subtotal_cents')::NUMERIC/100) END);

  -- =========================================================================
  -- 10. VENDA NO BALCÃO É TUDO OU NADA
  -- =========================================================================
  -- Dois itens: o primeiro cabe, o segundo não. Nada pode ficar gravado.
  SELECT stock_base INTO v_saldo FROM inventory_products WHERE id = v_coca;
  SELECT COUNT(*) INTO v_n FROM pos_sales WHERE pizzeria_id = v_loja_a;
  BEGIN
    PERFORM pos_finalize_sale(
      p_pizzeria_id := v_loja_a,
      p_items := jsonb_build_array(
        jsonb_build_object('product_id', v_coca, 'quantity', 1),
        jsonb_build_object('product_id', v_carne, 'quantity', 99999)
      )
    );
    INSERT INTO resultado(caso, veredito) VALUES
      ('Venda com um item sem estoque não grava nada', 'FALHOU: gravou');
  EXCEPTION WHEN OTHERS THEN
    DECLARE v_saldo2 NUMERIC; v_n2 INT;
    BEGIN
      SELECT stock_base INTO v_saldo2 FROM inventory_products WHERE id = v_coca;
      SELECT COUNT(*) INTO v_n2 FROM pos_sales WHERE pizzeria_id = v_loja_a;
      INSERT INTO resultado(caso, veredito) VALUES (
        'Venda com um item sem estoque não grava nada',
        CASE WHEN v_saldo2 = v_saldo AND v_n2 = v_n THEN 'OK: desfez tudo'
             ELSE 'FALHOU: sobrou coisa gravada' END);
    END;
  END;

  -- =========================================================================
  -- 11. BAIXA POR PEDIDO + FICHA TÉCNICA
  -- =========================================================================
  -- Coca do cardápio → 1 Coca do estoque
  INSERT INTO menu_product_inventory_links (pizzeria_id, menu_product_id, inventory_product_id, quantity_base)
    VALUES (v_loja_a, v_menu_coca, v_coca, 1);
  -- X-Burguer → 1 pão + 1 carne + 2 queijos (a ficha técnica)
  INSERT INTO menu_product_inventory_links (pizzeria_id, menu_product_id, inventory_product_id, quantity_base)
    VALUES (v_loja_a, v_menu_xburguer, v_pao, 1),
           (v_loja_a, v_menu_xburguer, v_carne, 1),
           (v_loja_a, v_menu_xburguer, v_queijo, 2);

  INSERT INTO orders (tenant_id, order_number, status, items) VALUES (
    v_loja_a, 1532, 'preparando',
    jsonb_build_array(
      jsonb_build_object('name', 'Coca-Cola lata', 'qty', 2),
      jsonb_build_object('name', 'X-Burguer', 'qty', 3)
    )
  ) RETURNING id INTO v_pedido;

  SELECT stock_base INTO v_saldo FROM inventory_products WHERE id = v_coca;
  v_r := inventory_deduct_order(v_pedido);

  DECLARE v_c NUMERIC; v_p NUMERIC; v_ca NUMERIC; v_q NUMERIC;
  BEGIN
    SELECT stock_base INTO v_c FROM inventory_products WHERE id = v_coca;
    SELECT stock_base INTO v_p FROM inventory_products WHERE id = v_pao;
    SELECT stock_base INTO v_ca FROM inventory_products WHERE id = v_carne;
    SELECT stock_base INTO v_q FROM inventory_products WHERE id = v_queijo;
    INSERT INTO resultado(caso, veredito) VALUES (
      'Pedido desconta pelo nome do item do cardápio',
      CASE WHEN v_c = v_saldo - 2 THEN 'OK (-2 Coca)' ELSE 'FALHOU: Coca ' || v_c END);
    INSERT INTO resultado(caso, veredito) VALUES (
      'Ficha técnica: 3 X-Burguer tiram 3 pães, 3 carnes e 6 queijos',
      CASE WHEN v_p = 97 AND v_ca = 47 AND v_q = 194 THEN 'OK'
           ELSE 'FALHOU: pão ' || v_p || ' carne ' || v_ca || ' queijo ' || v_q END);
  END;

  -- =========================================================================
  -- 12. O MESMO PEDIDO AVISADO DUAS VEZES
  -- =========================================================================
  SELECT stock_base INTO v_saldo FROM inventory_products WHERE id = v_pao;
  v_r := inventory_deduct_order(v_pedido);
  DECLARE v_p2 NUMERIC;
  BEGIN
    SELECT stock_base INTO v_p2 FROM inventory_products WHERE id = v_pao;
    INSERT INTO resultado(caso, veredito) VALUES (
      'Pedido confirmado duas vezes desconta só uma',
      CASE WHEN v_p2 = v_saldo AND (v_r->>'deducted')::INT = 0 THEN 'OK (nada a mais saiu)'
           ELSE 'FALHOU: pão ' || v_p2 END);
  END;

  -- =========================================================================
  -- 13. CANCELAMENTO GERA MOVIMENTAÇÃO INVERSA (e não apaga a antiga)
  -- =========================================================================
  SELECT COUNT(*) INTO v_n FROM inventory_movements WHERE order_id = v_pedido;
  v_r := inventory_restore_order(v_pedido);
  DECLARE v_p3 NUMERIC; v_n3 INT; v_antigas INT;
  BEGIN
    SELECT stock_base INTO v_p3 FROM inventory_products WHERE id = v_pao;
    SELECT COUNT(*) INTO v_n3 FROM inventory_movements WHERE order_id = v_pedido;
    SELECT COUNT(*) INTO v_antigas FROM inventory_movements
     WHERE order_id = v_pedido AND direction = 'out';
    INSERT INTO resultado(caso, veredito) VALUES (
      'Cancelamento devolve a mercadoria',
      CASE WHEN v_p3 = 100 THEN 'OK (pão voltou a 100)' ELSE 'FALHOU: pão ' || v_p3 END);
    INSERT INTO resultado(caso, veredito) VALUES (
      'Cancelamento NÃO apaga a saída antiga — cria o estorno ao lado',
      CASE WHEN v_n3 > v_n AND v_antigas > 0 THEN 'OK (extrato preservado)'
           ELSE 'FALHOU: sumiu histórico' END);
  END;

  -- cancelamento avisado duas vezes também não duplica
  v_r := inventory_restore_order(v_pedido);
  INSERT INTO resultado(caso, veredito) VALUES (
    'Cancelamento repetido não devolve em dobro',
    CASE WHEN (v_r->>'restored')::INT = 0 THEN 'OK' ELSE 'FALHOU' END);

  -- =========================================================================
  -- 14. NADA DE APAGAR: o extrato guarda saldo antes e depois
  -- =========================================================================
  SELECT COUNT(*) INTO v_n FROM inventory_movements
   WHERE stock_after <> stock_before + quantity_base;
  INSERT INTO resultado(caso, veredito) VALUES (
    'Toda linha do extrato fecha: saldo anterior + movimento = saldo novo',
    CASE WHEN v_n = 0 THEN 'OK' ELSE 'FALHOU: ' || v_n || ' linhas não fecham' END);
END $$;

SELECT ordem, caso, veredito FROM resultado ORDER BY ordem;

SELECT
  COUNT(*) FILTER (WHERE veredito LIKE 'OK%') AS passaram,
  COUNT(*) FILTER (WHERE veredito LIKE 'FALHOU%') AS falharam
FROM resultado;
