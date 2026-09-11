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
