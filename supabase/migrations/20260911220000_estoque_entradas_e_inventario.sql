-- ============================================================================
-- FASE 6 — ENTRADA DE MERCADORIA E CONTAGEM DE INVENTÁRIO
-- ============================================================================
--
-- As tabelas já existiam desde a fundação do módulo, vazias, esperando quem as
-- preenchesse. O motor de movimentação também já previa as duas: os parâmetros
-- p_supplier_id, p_entry_id e p_count_id estavam lá desde o começo.
--
-- As duas operações têm a mesma exigência: ou entram inteiras, ou não entram.
-- Uma nota fiscal com 40 itens que grava 28 e falha no 29 deixa o estoque
-- pior do que antes de começar — e ninguém sabe onde parou.

-- Clicar duas vezes em "salvar" não pode lançar a nota duas vezes. A chave é
-- do navegador, gerada uma vez por formulário aberto.
ALTER TABLE public.inventory_entries
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_entries_idempotencia
  ON public.inventory_entries (pizzeria_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 1. ENTRADA DE MERCADORIA
-- ---------------------------------------------------------------------------
--
-- É a chegada do fornecedor: a nota é conferida, cada item é lançado e o
-- estoque sobe. O custo pago atualiza a ficha do produto, porque o valor do
-- estoque tem de refletir o que foi pago de verdade na última compra — e não
-- um preço digitado no cadastro há seis meses.

CREATE OR REPLACE FUNCTION public.inventory_register_entry(
  p_pizzeria_id     UUID,
  p_items           JSONB,
  p_supplier_id     UUID DEFAULT NULL,
  p_invoice_number  TEXT DEFAULT NULL,
  p_entry_date      DATE DEFAULT CURRENT_DATE,
  p_notes           TEXT DEFAULT NULL,
  p_user_id         UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entrada_id UUID;
  v_item JSONB;
  v_indice INT := 0;
  v_produto RECORD;
  v_qtd NUMERIC;
  v_unidade TEXT;
  v_custo INT;
  v_resultado JSONB;
  v_total_cents BIGINT := 0;
  v_lancados INT := 0;
  v_ja_existe UUID;
BEGIN
  IF NOT (is_admin() OR owns_pizzeria(auth.uid(), p_pizzeria_id)) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ENTRADA_SEM_ITENS';
  END IF;

  -- Segundo clique no mesmo formulário devolve a nota já lançada, em vez de
  -- lançar de novo.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_ja_existe
      FROM inventory_entries
     WHERE pizzeria_id = p_pizzeria_id AND idempotency_key = p_idempotency_key;
    IF v_ja_existe IS NOT NULL THEN
      RETURN jsonb_build_object('entry_id', v_ja_existe, 'repetida', TRUE);
    END IF;
  END IF;

  INSERT INTO inventory_entries
    (pizzeria_id, supplier_id, invoice_number, entry_date, notes, created_by, idempotency_key)
  VALUES
    (p_pizzeria_id, p_supplier_id, NULLIF(btrim(p_invoice_number), ''),
     COALESCE(p_entry_date, CURRENT_DATE), NULLIF(btrim(p_notes), ''),
     p_user_id, p_idempotency_key)
  RETURNING id INTO v_entrada_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_indice := v_indice + 1;

    SELECT id, pizzeria_id, base_unit INTO v_produto
      FROM inventory_products
     WHERE id = (v_item->>'product_id')::UUID
       AND pizzeria_id = p_pizzeria_id
       AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUTO_NAO_ENCONTRADO'
        USING HINT = 'Item ' || v_indice || ' não é um produto desta loja.';
    END IF;

    v_qtd     := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    v_unidade := NULLIF(btrim(COALESCE(v_item->>'unit', '')), '');
    v_custo   := GREATEST(0, COALESCE((v_item->>'unit_cost_cents')::INT, 0));

    IF v_qtd <= 0 THEN
      RAISE EXCEPTION 'QUANTIDADE_INVALIDA'
        USING HINT = 'Item ' || v_indice || ' está sem quantidade.';
    END IF;

    -- Quem converte caixa em unidade é o motor, usando as embalagens
    -- cadastradas no produto. Converter aqui duplicaria a regra.
    v_resultado := inventory_apply_movement(
      p_product_id  := v_produto.id,
      p_direction   := 'in',
      p_reason      := 'compra_fornecedor',
      p_quantity    := v_qtd,
      p_unit        := v_unidade,
      p_notes       := NULLIF(btrim(COALESCE(v_item->>'notes', '')), ''),
      p_source_type := 'entry',
      p_source_id   := v_entrada_id,
      p_source_item_id := v_indice::TEXT,
      p_supplier_id := p_supplier_id,
      p_entry_id    := v_entrada_id,
      p_user_id     := p_user_id
    );

    INSERT INTO inventory_entry_items
      (entry_id, product_id, quantity, unit, quantity_base, unit_cost_cents, batch, expires_at)
    VALUES
      (v_entrada_id, v_produto.id, v_qtd,
       COALESCE(v_unidade, v_produto.base_unit),
       COALESCE((v_resultado->>'converted_quantity')::NUMERIC, v_qtd),
       v_custo,
       NULLIF(btrim(COALESCE(v_item->>'batch', '')), ''),
       (NULLIF(btrim(COALESCE(v_item->>'expires_at', '')), ''))::DATE);

    v_total_cents := v_total_cents + ROUND(v_custo * v_qtd);
    v_lancados := v_lancados + 1;

    -- O custo da ficha passa a ser o da última compra. Sem isto, o "valor do
    -- estoque" continuaria calculado sobre um preço que não existe mais.
    IF v_custo > 0 THEN
      UPDATE inventory_products
         SET cost_cents = v_custo, updated_at = now()
       WHERE id = v_produto.id;
    END IF;
  END LOOP;

  UPDATE inventory_entries
     SET total_cost_cents = LEAST(v_total_cents, 2147483647)
   WHERE id = v_entrada_id;

  RETURN jsonb_build_object(
    'entry_id', v_entrada_id,
    'itens', v_lancados,
    'total_cents', v_total_cents,
    'repetida', FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_register_entry FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_register_entry TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. CONTAGEM DE INVENTÁRIO
-- ---------------------------------------------------------------------------
--
-- A conferência física: o dono conta o que existe na prateleira e o sistema
-- acerta a diferença.
--
-- A diferença NÃO é escrita por cima do saldo. Ela vira movimentação, como
-- todo o resto — do contrário o estoque mudaria sem nenhuma linha explicando
-- por quê, e o extrato deixaria de fechar com o saldo.

CREATE OR REPLACE FUNCTION public.inventory_start_count(
  p_pizzeria_id UUID,
  p_scope       TEXT DEFAULT 'todos',
  p_category_id UUID DEFAULT NULL,
  p_user_id     UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count_id UUID;
  v_itens INT;
BEGIN
  IF NOT (is_admin() OR owns_pizzeria(auth.uid(), p_pizzeria_id)) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;

  -- Duas contagens abertas ao mesmo tempo dariam dois retratos do mesmo
  -- estoque, e o segundo a ser aplicado desfaria o primeiro.
  IF EXISTS (
    SELECT 1 FROM inventory_counts
     WHERE pizzeria_id = p_pizzeria_id AND status = 'em_andamento'
  ) THEN
    RAISE EXCEPTION 'CONTAGEM_JA_ABERTA';
  END IF;

  INSERT INTO inventory_counts (pizzeria_id, scope, category_id, started_by)
  VALUES (p_pizzeria_id, COALESCE(p_scope, 'todos'), p_category_id, p_user_id)
  RETURNING id INTO v_count_id;

  -- O saldo é congelado agora, no momento de abrir. É o retrato contra o qual
  -- a contagem física será comparada.
  INSERT INTO inventory_count_items (count_id, product_id, system_quantity_base)
  SELECT v_count_id, p.id, p.stock_base
    FROM inventory_products p
   WHERE p.pizzeria_id = p_pizzeria_id
     AND p.active = TRUE
     AND p.deleted_at IS NULL
     AND (p_category_id IS NULL OR p.category_id = p_category_id);

  GET DIAGNOSTICS v_itens = ROW_COUNT;

  RETURN jsonb_build_object('count_id', v_count_id, 'itens', v_itens);
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_apply_count(
  p_count_id UUID,
  p_user_id  UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contagem RECORD;
  v_item RECORD;
  v_saldo_atual NUMERIC;
  v_diferenca NUMERIC;
  v_ajustados INT := 0;
  v_divergencias INT := 0;
  v_valor_cents BIGINT := 0;
  v_custo INT;
BEGIN
  SELECT * INTO v_contagem FROM inventory_counts WHERE id = p_count_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONTAGEM_NAO_ENCONTRADA'; END IF;

  IF NOT (is_admin() OR owns_pizzeria(auth.uid(), v_contagem.pizzeria_id)) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;

  IF v_contagem.status <> 'em_andamento' THEN
    RAISE EXCEPTION 'CONTAGEM_JA_FINALIZADA';
  END IF;

  FOR v_item IN
    SELECT ci.*, p.cost_cents
      FROM inventory_count_items ci
      JOIN inventory_products p ON p.id = ci.product_id
     WHERE ci.count_id = p_count_id
       AND ci.counted_quantity_base IS NOT NULL
       AND ci.applied = FALSE
  LOOP
    -- Comparado com o saldo de AGORA, não com o congelado: entre abrir e
    -- fechar a contagem o restaurante continuou vendendo, e ignorar isso
    -- apagaria as vendas do período.
    SELECT stock_base INTO v_saldo_atual FROM inventory_products WHERE id = v_item.product_id;
    v_diferenca := v_item.counted_quantity_base - v_saldo_atual;
    v_custo := COALESCE(v_item.cost_cents, 0);

    IF v_diferenca <> 0 THEN
      v_divergencias := v_divergencias + 1;
      v_valor_cents := v_valor_cents + ROUND(ABS(v_diferenca) * v_custo);

      PERFORM inventory_apply_movement(
        p_product_id  := v_item.product_id,
        p_direction   := CASE WHEN v_diferenca > 0 THEN 'in' ELSE 'out' END,
        p_reason      := CASE WHEN v_diferenca > 0 THEN 'inventario_entrada' ELSE 'inventario_saida' END,
        p_quantity    := ABS(v_diferenca),
        p_unit        := NULL,
        p_notes       := 'Acerto pela contagem de inventário',
        p_source_type := 'count',
        p_source_id   := p_count_id,
        p_source_item_id := v_item.id::TEXT,
        p_count_id    := p_count_id,
        p_user_id     := p_user_id
      );

      v_ajustados := v_ajustados + 1;
    END IF;

    UPDATE inventory_count_items SET applied = TRUE WHERE id = v_item.id;
  END LOOP;

  UPDATE inventory_counts
     SET status = 'concluido',
         finished_at = now(),
         divergence_count = v_divergencias,
         divergence_value_cents = LEAST(v_valor_cents, 2147483647)
   WHERE id = p_count_id;

  RETURN jsonb_build_object(
    'ajustados', v_ajustados,
    'divergencias', v_divergencias,
    'valor_divergencia_cents', v_valor_cents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_start_count FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_apply_count FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_start_count TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inventory_apply_count TO authenticated, service_role;
