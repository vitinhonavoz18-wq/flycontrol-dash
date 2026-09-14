-- IMPORTAÇÃO DE PRODUTOS POR JSON.
--
-- Traz três coisas:
--
--   1. O caderno das importações (quem importou, quando, o que aconteceu);
--   2. A trava que impede a mesma importação de entrar duas vezes;
--   3. O preço próprio da embalagem.
--
-- E a função que faz a importação inteira de uma vez só — ou tudo, ou nada.

-- ---------------------------------------------------------------------------
-- 1. PREÇO PRÓPRIO DA EMBALAGEM
-- ---------------------------------------------------------------------------
-- Até agora o preço da caixa era calculado: 12 latas × R$ 5,00 = R$ 60,00.
--
-- Só que na vida real a caixa sai mais barata que 12 latas avulsas — é o
-- desconto de quem leva mais. O modelo de importação já prevê isso ("caixa com
-- 6" por R$ 65 quando a unidade custa R$ 12, ou seja R$ 72 se fosse conta de
-- multiplicação).
--
-- Nulo continua significando "calcule pelo unitário", que é como todos os
-- produtos já cadastrados se comportam. Nada muda para quem já existe.
ALTER TABLE public.inventory_package_conversions
  ADD COLUMN IF NOT EXISTS price_cents INTEGER;

ALTER TABLE public.inventory_package_conversions
  DROP CONSTRAINT IF EXISTS inventory_package_preco_nao_negativo;
ALTER TABLE public.inventory_package_conversions
  ADD CONSTRAINT inventory_package_preco_nao_negativo
  CHECK (price_cents IS NULL OR price_cents >= 0);

COMMENT ON COLUMN public.inventory_package_conversions.price_cents IS
  'Preco proprio da embalagem, em centavos. Nulo = calcula multiplicando o preco unitario.';

-- ---------------------------------------------------------------------------
-- 2. O CADERNO DAS IMPORTAÇÕES
-- ---------------------------------------------------------------------------
-- Serve para responder, meses depois: "de onde vieram esses 300 produtos?".
-- Sem isso, uma importação errada vira um mistério — trezentos itens que
-- ninguém lembra de ter cadastrado.
CREATE TABLE IF NOT EXISTS public.inventory_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pizzeria_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  user_id UUID,

  -- A TRAVA CONTRA IMPORTAR DUAS VEZES.
  --
  -- A tela manda uma senha única por importação. Se o dono clicar duas vezes,
  -- ou a internet cair e o navegador tentar de novo, a segunda chegada esbarra
  -- no índice único e devolve o resultado da primeira — sem cadastrar nada de
  -- novo. É o caderno de reservas que só aceita um nome por mesa.
  idempotency_key TEXT NOT NULL,

  total_received INTEGER NOT NULL DEFAULT 0,
  total_created INTEGER NOT NULL DEFAULT 0,
  total_updated INTEGER NOT NULL DEFAULT 0,
  total_skipped INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,

  -- O que deu errado, produto por produto, para o suporte conseguir ajudar.
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,

  status TEXT NOT NULL DEFAULT 'concluida',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT inventory_imports_status_valido
    CHECK (status IN ('concluida', 'falhou'))
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_imports_chave_unica
  ON public.inventory_imports (pizzeria_id, idempotency_key);

CREATE INDEX IF NOT EXISTS inventory_imports_por_loja
  ON public.inventory_imports (pizzeria_id, created_at DESC);

ALTER TABLE public.inventory_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Manage inventory_imports" ON public.inventory_imports;
CREATE POLICY "Manage inventory_imports" ON public.inventory_imports
  FOR ALL
  USING (is_admin() OR owns_pizzeria(auth.uid(), pizzeria_id))
  WITH CHECK (is_admin() OR owns_pizzeria(auth.uid(), pizzeria_id));

-- ---------------------------------------------------------------------------
-- 3. A VENDA PASSA A RESPEITAR O PREÇO DA EMBALAGEM
-- ---------------------------------------------------------------------------
-- Única mudança na função de venda: quando a embalagem tem preço próprio, ele
-- manda. Sem preço próprio, tudo continua exatamente como estava.
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
  v_preco_embalagem INTEGER;
  v_qtd_base NUMERIC;
  v_preco INTEGER;
  v_total_item INTEGER;
  v_subtotal INTEGER := 0;
  v_total INTEGER;
  v_item_id UUID;
  v_desconto INTEGER := GREATEST(COALESCE(p_discount_cents, 0), 0);
  v_acrescimo INTEGER := GREATEST(COALESCE(p_surcharge_cents, 0), 0);
BEGIN
  IF NOT (current_user = 'service_role' OR is_admin() OR owns_pizzeria(auth.uid(), p_pizzeria_id)) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'VENDA_SEM_ITENS' USING HINT = 'Adicione ao menos um produto para finalizar a venda.';
  END IF;

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
      RAISE EXCEPTION 'QUANTIDADE_INVALIDA' USING HINT = 'Todo item da venda precisa ter quantidade maior que zero.';
    END IF;

    SELECT * INTO v_produto
      FROM inventory_products
     WHERE id = (v_item->>'product_id')::UUID
       AND pizzeria_id = p_pizzeria_id
       AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUTO_NAO_ENCONTRADO' USING HINT = 'Um dos produtos da venda nao existe nesta loja.';
    END IF;

    v_unidade := COALESCE(NULLIF(btrim(v_item->>'unit'), ''), v_produto.base_unit);
    v_preco_embalagem := NULL;

    IF lower(btrim(v_unidade)) = lower(btrim(v_produto.base_unit)) THEN
      v_fator := 1;
    ELSE
      SELECT base_quantity, price_cents INTO v_fator, v_preco_embalagem
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

    -- Preço próprio da embalagem ganha do calculado. Sem ele, multiplica.
    v_preco := COALESCE(v_preco_embalagem, ROUND(v_produto.price_cents * v_fator));
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

    PERFORM inventory_apply_movement(
      p_product_id := v_produto.id,
      p_direction := 'out',
      p_reason := 'venda_balcao',
      p_quantity := v_qtd,
      p_unit := v_unidade,
      p_notes := NULL,
      p_source_type := 'pos_sale',
      p_source_id := v_venda_id,
      p_source_item_id := v_item_id::TEXT,
      p_pos_sale_id := v_venda_id
    );
  END LOOP;

  v_total := GREATEST(v_subtotal - v_desconto + v_acrescimo, 0);

  UPDATE pos_sales
     SET subtotal_cents = v_subtotal, total_cents = v_total
   WHERE id = v_venda_id;

  RETURN jsonb_build_object(
    'sale_id', v_venda_id, 'sale_number', v_numero,
    'subtotal_cents', v_subtotal, 'discount_cents', v_desconto,
    'surcharge_cents', v_acrescimo, 'total_cents', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_finalize_sale FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_finalize_sale TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. A IMPORTAÇÃO EM SI
-- ---------------------------------------------------------------------------
-- Recebe a lista já conferida pela tela e pelo servidor, e grava tudo numa
-- operação só.
--
-- POR QUE NUMA FUNÇÃO DO BANCO, E NÃO EM CEM CHAMADAS
--
-- Cem produtos em cem requisições dariam cem chances de a internet cair no
-- meio — e aí o lojista fica com 63 produtos cadastrados, sem saber quais 37
-- faltaram. Aqui é tudo ou nada: se algo der errado, o banco desfaz sozinho e
-- o estoque continua exatamente como estava.
--
-- O ESTOQUE INICIAL NÃO É ESCRITO DIRETO
--
-- Cada produto que chega com quantidade vira uma ENTRADA registrada, igual à
-- que o dono faria na mão. Assim o extrato continua explicando o saldo desde
-- o primeiro dia, e não aparece um "24" que ninguém sabe de onde veio.
CREATE OR REPLACE FUNCTION public.inventory_import_products(
  p_pizzeria_id UUID,
  p_products JSONB,
  p_idempotency_key TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_import_id UUID;
  v_ja RECORD;
  v_item JSONB;
  v_emb JSONB;
  v_cat_id UUID;
  v_prod_id UUID;
  v_existente RECORD;
  v_acao TEXT;
  v_nome TEXT;
  v_criados INT := 0;
  v_atualizados INT := 0;
  v_ignorados INT := 0;
  v_erros INT := 0;
  v_lista_erros JSONB := '[]'::jsonb;
  v_qtd NUMERIC;
  v_total INT;
BEGIN
  IF NOT (current_user = 'service_role' OR is_admin() OR owns_pizzeria(auth.uid(), p_pizzeria_id)) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'CHAVE_AUSENTE' USING HINT = 'Importacao precisa de uma chave para nao repetir.';
  END IF;

  -- Já importado com esta chave? Devolve o que aconteceu na primeira vez.
  SELECT * INTO v_ja FROM inventory_imports
   WHERE pizzeria_id = p_pizzeria_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'import_id', v_ja.id, 'repetida', TRUE,
      'total_received', v_ja.total_received, 'total_created', v_ja.total_created,
      'total_updated', v_ja.total_updated, 'total_skipped', v_ja.total_skipped,
      'total_errors', v_ja.total_errors, 'errors', v_ja.errors
    );
  END IF;

  IF p_products IS NULL OR jsonb_typeof(p_products) <> 'array' THEN
    RAISE EXCEPTION 'LISTA_INVALIDA' USING HINT = 'Esperava uma lista de produtos.';
  END IF;

  v_total := jsonb_array_length(p_products);
  IF v_total = 0 THEN
    RAISE EXCEPTION 'LISTA_VAZIA' USING HINT = 'Nenhum produto selecionado para importar.';
  END IF;
  IF v_total > 1000 THEN
    RAISE EXCEPTION 'LIMITE_EXCEDIDO' USING HINT = 'Maximo de 1000 produtos por importacao.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_products) LOOP
    v_nome := btrim(COALESCE(v_item->>'nome', ''));
    v_acao := COALESCE(v_item->>'acao', 'criar');

    IF v_nome = '' THEN
      v_erros := v_erros + 1;
      v_lista_erros := v_lista_erros || jsonb_build_object('nome', '', 'mensagem', 'Produto sem nome.');
      CONTINUE;
    END IF;

    IF v_acao = 'ignorar' THEN
      v_ignorados := v_ignorados + 1;
      CONTINUE;
    END IF;

    -- CATEGORIA: usa a que existe, cria a que não existe. Sempre desta loja —
    -- por isso o filtro por pizzeria_id em todas as consultas.
    v_cat_id := NULL;
    IF btrim(COALESCE(v_item->>'categoria', '')) <> '' THEN
      SELECT id INTO v_cat_id FROM inventory_categories
       WHERE pizzeria_id = p_pizzeria_id
         AND lower(btrim(name)) = lower(btrim(v_item->>'categoria'))
       LIMIT 1;
      IF v_cat_id IS NULL THEN
        INSERT INTO inventory_categories (pizzeria_id, name)
        VALUES (p_pizzeria_id, btrim(v_item->>'categoria'))
        RETURNING id INTO v_cat_id;
      END IF;
    END IF;

    v_prod_id := NULL;

    IF v_acao = 'atualizar' AND (v_item->>'produto_existente_id') IS NOT NULL THEN
      SELECT * INTO v_existente FROM inventory_products
       WHERE id = (v_item->>'produto_existente_id')::UUID
         AND pizzeria_id = p_pizzeria_id
         AND deleted_at IS NULL;

      IF NOT FOUND THEN
        v_erros := v_erros + 1;
        v_lista_erros := v_lista_erros ||
          jsonb_build_object('nome', v_nome, 'mensagem', 'Produto a atualizar nao foi encontrado.');
        CONTINUE;
      END IF;

      -- ATUALIZA SÓ O QUE VEIO PREENCHIDO.
      --
      -- Campo vazio no JSON não apaga o que já existe. Se o produto tem foto e
      -- o arquivo manda "imagem_url": "", a foto fica — o arquivo está calado
      -- sobre a foto, não pedindo para removê-la.
      UPDATE inventory_products SET
        name = v_nome,
        category_id = COALESCE(v_cat_id, category_id),
        brand = COALESCE(NULLIF(btrim(v_item->>'marca'), ''), brand),
        description = COALESCE(NULLIF(btrim(v_item->>'descricao'), ''), description),
        sku = COALESCE(NULLIF(btrim(v_item->>'sku'), ''), sku),
        barcode = COALESCE(NULLIF(btrim(v_item->>'codigo_barras'), ''), barcode),
        image_url = COALESCE(NULLIF(btrim(v_item->>'imagem_url'), ''), image_url),
        cost_cents = CASE WHEN (v_item->>'preco_custo_cents')::INT > 0
                          THEN (v_item->>'preco_custo_cents')::INT ELSE cost_cents END,
        price_cents = CASE WHEN (v_item->>'preco_venda_cents')::INT > 0
                           THEN (v_item->>'preco_venda_cents')::INT ELSE price_cents END,
        min_stock_base = CASE WHEN (v_item->>'estoque_minimo')::NUMERIC > 0
                              THEN (v_item->>'estoque_minimo')::NUMERIC ELSE min_stock_base END,
        active = COALESCE((v_item->>'ativo')::BOOLEAN, active),
        updated_at = now()
      WHERE id = v_existente.id;

      v_prod_id := v_existente.id;
      v_atualizados := v_atualizados + 1;

    ELSE
      BEGIN
        INSERT INTO inventory_products (
          pizzeria_id, category_id, name, description, brand, sku, barcode,
          image_url, cost_cents, price_cents, base_unit, min_stock_base, active
        ) VALUES (
          p_pizzeria_id, v_cat_id, v_nome,
          NULLIF(btrim(v_item->>'descricao'), ''),
          NULLIF(btrim(v_item->>'marca'), ''),
          NULLIF(btrim(v_item->>'sku'), ''),
          NULLIF(btrim(v_item->>'codigo_barras'), ''),
          NULLIF(btrim(v_item->>'imagem_url'), ''),
          COALESCE((v_item->>'preco_custo_cents')::INT, 0),
          COALESCE((v_item->>'preco_venda_cents')::INT, 0),
          COALESCE(NULLIF(btrim(v_item->>'unidade_base'), ''), 'unidade'),
          COALESCE((v_item->>'estoque_minimo')::NUMERIC, 0),
          COALESCE((v_item->>'ativo')::BOOLEAN, TRUE)
        )
        RETURNING id INTO v_prod_id;
        v_criados := v_criados + 1;
      EXCEPTION WHEN unique_violation THEN
        -- Bateu num SKU ou código de barras que já existe. Não é falha da
        -- importação inteira: é este produto que precisa de atenção.
        v_erros := v_erros + 1;
        v_lista_erros := v_lista_erros || jsonb_build_object(
          'nome', v_nome,
          'mensagem', 'Ja existe outro produto com este SKU ou codigo de barras.'
        );
        CONTINUE;
      END;
    END IF;

    -- EMBALAGENS ("1 caixa = 12 unidades")
    IF jsonb_typeof(v_item->'embalagens') = 'array' THEN
      FOR v_emb IN SELECT * FROM jsonb_array_elements(v_item->'embalagens') LOOP
        INSERT INTO inventory_package_conversions (pizzeria_id, product_id, unit, base_quantity, price_cents)
        VALUES (
          p_pizzeria_id, v_prod_id,
          btrim(v_emb->>'unidade'),
          (v_emb->>'quantidade')::NUMERIC,
          NULLIF(v_emb->>'preco_cents', '')::INT
        )
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;

    -- ESTOQUE INICIAL: vira ENTRADA registrada, nunca escrita direta no saldo.
    v_qtd := COALESCE((v_item->>'quantidade_estoque')::NUMERIC, 0);

    -- Quantidade negativa é recusada, não engolida.
    --
    -- A tela já barra antes de chegar aqui, mas quem chamar esta função por
    -- fora não passa pela tela. Aceitar -5 e gravar 0 seria pior do que
    -- recusar: o lojista veria "importado com sucesso" e o estoque em branco,
    -- sem nada explicando o sumiço.
    IF v_qtd < 0 THEN
      RAISE EXCEPTION 'QUANTIDADE_INVALIDA'
        USING HINT = 'O produto "' || v_nome || '" veio com quantidade negativa.';
    END IF;

    IF v_qtd > 0 THEN
      PERFORM inventory_apply_movement(
        p_product_id := v_prod_id,
        p_direction := 'in',
        p_reason := 'outra_entrada',
        p_quantity := v_qtd,
        p_unit := NULL,
        p_notes := 'Estoque inicial da importacao por JSON',
        p_user_id := p_user_id
      );
    END IF;
  END LOOP;

  INSERT INTO inventory_imports (
    pizzeria_id, user_id, idempotency_key,
    total_received, total_created, total_updated, total_skipped, total_errors,
    errors, status
  ) VALUES (
    p_pizzeria_id, COALESCE(p_user_id, auth.uid()), p_idempotency_key,
    v_total, v_criados, v_atualizados, v_ignorados, v_erros,
    v_lista_erros, 'concluida'
  )
  RETURNING id INTO v_import_id;

  RETURN jsonb_build_object(
    'import_id', v_import_id, 'repetida', FALSE,
    'total_received', v_total, 'total_created', v_criados,
    'total_updated', v_atualizados, 'total_skipped', v_ignorados,
    'total_errors', v_erros, 'errors', v_lista_erros
  );
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_import_products FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_import_products TO authenticated, service_role;

COMMENT ON FUNCTION public.inventory_import_products IS
  'Importa varios produtos numa operacao so. Ou grava tudo, ou nao grava nada. Estoque inicial vira entrada registrada, e a chave de idempotencia impede a mesma importacao entrar duas vezes.';
