-- ============================================================================
-- FASE 5.1 — A BAIXA AUTOMÁTICA PASSA A DISPARAR SOZINHA
-- ============================================================================
--
-- O motor já existia e já era à prova de repetição, mas ninguém o chamava:
-- dar baixa continuava sendo trabalho manual. Agora o próprio banco chama
-- quando o pedido muda de etapa.
--
-- POR QUE NO BANCO, E NÃO NA TELA
--
-- A mudança de status acontece em vários lugares: o painel, o portal do
-- garçom, a API e os webhooks do site. Pendurar a baixa em um desses lugares
-- deixaria os outros três sem descontar. E se a tela fosse fechada no meio do
-- caminho, o pedido mudaria de etapa sem o estoque acompanhar.
--
-- Aqui é o único ponto por onde todos passam — a porta única da despensa, em
-- vez de um aviso colado em cada entrada.
--
-- POR QUE A LÓGICA FOI SEPARADA EM DUAS CAMADAS
--
-- As funções originais recusam quem não é dono da loja. Está certo para quem
-- chama de fora, mas impede o próprio banco de chamar: um pedido que chega
-- por webhook não tem ninguém logado, e trocar de papel dentro de um gatilho
-- o Postgres não permite.
--
-- Então o miolo virou uma função interna, sem porteiro, que ninguém de fora
-- alcança (o acesso é revogado logo abaixo). A função pública continua
-- existindo com o mesmo nome, o mesmo comportamento e o mesmo porteiro — ela
-- só passou a delegar o trabalho.
--
-- É separar a chave da despensa da porta da rua: quem vem de fora continua
-- tendo de se identificar na portaria; quem já está dentro da casa não
-- precisa tocar a campainha para ir à cozinha.

-- ---------------------------------------------------------------------------
-- 0. O motor também precisa de uma porta interna
-- ---------------------------------------------------------------------------
--
-- `inventory_apply_movement` tem o mesmo porteiro, e ele também barrava o
-- gatilho. A condição que deveria liberar o sistema (`current_user =
-- 'service_role'`) nunca valeu: dentro de uma função SECURITY DEFINER,
-- `current_user` é sempre o dono da função, nunca quem chamou.
--
-- O núcleo é gerado a partir da função que está no ar, trocando só o nome e
-- removendo o bloco do porteiro. Copiar as 165 linhas à mão criaria duas
-- versões do motor que envelheceriam separadas — e a hora em que elas
-- divergissem seria a hora em que o saldo do estoque passaria a depender de
-- qual caminho a venda tomou.
--
-- Se o bloco não for encontrado exatamente, a migração falha de propósito:
-- gerar um motor "quase certo" é pior que não gerar nenhum.

DO $gerador$
DECLARE
  v_def TEXT;
  v_checagem CONSTANT TEXT :=
    'IF NOT (' || E'\n' ||
    '    current_user = ''service_role''' || E'\n' ||
    '    OR is_admin()' || E'\n' ||
    '    OR owns_pizzeria(auth.uid(), v_produto.pizzeria_id)' || E'\n' ||
    '  ) THEN' || E'\n' ||
    '    RAISE EXCEPTION ''ACESSO_NEGADO'' USING HINT = ''Este produto pertence a outra loja.'';' || E'\n' ||
    '  END IF;';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'inventory_apply_movement';

  IF position(v_checagem in v_def) = 0 THEN
    RAISE EXCEPTION 'Bloco de checagem nao encontrado — abortando para nao gerar motor errado';
  END IF;

  v_def := replace(v_def, 'FUNCTION public.inventory_apply_movement(',
                          'FUNCTION public.inventory_apply_movement_core(');
  v_def := replace(v_def, v_checagem,
    '-- Sem porteiro de proposito: funcao interna, revogada de anon e authenticated.');

  EXECUTE v_def;
END;
$gerador$;

REVOKE ALL ON FUNCTION public.inventory_apply_movement_core FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. O miolo, sem porteiro — uso interno do banco
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.inventory_deduct_order_core(p_order_id UUID)
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
    FOR v_link IN
      SELECT l.id, l.inventory_product_id, l.quantity_base
        FROM menu_product_inventory_links l
       WHERE l.menu_product_id = v_menu_id
         AND l.pizzeria_id = v_pedido.tenant_id
    LOOP
      v_resultado := inventory_apply_movement_core(
        p_product_id     := v_link.inventory_product_id,
        p_direction      := 'out',
        p_reason         := 'venda_online',
        p_quantity       := ROUND(v_qtd * v_link.quantity_base, 3),
        p_unit           := NULL,
        p_notes          := 'Pedido #' || COALESCE(v_pedido.order_number::TEXT, '?'),
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

CREATE OR REPLACE FUNCTION public.inventory_restore_order_core(p_order_id UUID)
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

  FOR v_mov IN
    SELECT * FROM inventory_movements
     WHERE source_type = 'order'
       AND source_id = p_order_id
       AND direction = 'out'
  LOOP
    v_resultado := inventory_apply_movement_core(
      p_product_id     := v_mov.product_id,
      p_direction      := 'in',
      p_reason         := 'estorno_cancelamento',
      p_quantity       := ABS(v_mov.quantity_base),
      p_unit           := NULL,
      p_notes          := 'Reposição por cancelamento do pedido #'
                          || COALESCE(v_pedido.order_number::TEXT, '?'),
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

-- Ninguém de fora chama o miolo. Quem vem pela rua usa a porta da frente.
REVOKE ALL ON FUNCTION public.inventory_deduct_order_core  FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.inventory_restore_order_core FROM PUBLIC, authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. As funções públicas: mesmo nome, mesmo porteiro, agora delegando
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.inventory_deduct_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'; END IF;

  IF NOT (is_admin() OR owns_pizzeria(auth.uid(), v_tenant)) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;

  RETURN inventory_deduct_order_core(p_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_restore_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'; END IF;

  IF NOT (is_admin() OR owns_pizzeria(auth.uid(), v_tenant)) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;

  RETURN inventory_restore_order_core(p_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_deduct_order  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_restore_order FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_deduct_order  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inventory_restore_order TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. O gatilho
-- ---------------------------------------------------------------------------
--
-- A REGRA MAIS IMPORTANTE DESTE ARQUIVO: falha na baixa NUNCA trava o pedido.
-- Se o estoque não puder ser descontado — ficha técnica faltando, produto
-- removido, o que for — o pedido muda de etapa do mesmo jeito e o problema
-- fica registrado no log.
--
-- O contrário seria a cozinha parar de receber comanda porque a despensa está
-- com a conta errada. Comanda que não anda é cliente sem comida.

CREATE OR REPLACE FUNCTION public.inventory_ao_mudar_status_do_pedido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status_da_baixa TEXT;
  v_baixa_ligada    BOOLEAN;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  -- Tudo dentro do bloco protegido, inclusive a leitura da configuração:
  -- qualquer erro aqui precisa parar em aviso, nunca em pedido travado.
  BEGIN
    SELECT COALESCE(s.deduct_on_status, 'preparando'),
           COALESCE(s.auto_deduct_orders, TRUE)
      INTO v_status_da_baixa, v_baixa_ligada
      FROM inventory_settings s
     WHERE s.pizzeria_id = NEW.tenant_id;

    -- Loja sem configuração salva usa o padrão: descontar ao entrar em
    -- "preparando", que é quando a comida começa a ser feita — ou seja,
    -- quando o ingrediente sai mesmo da prateleira.
    IF NOT FOUND THEN
      v_status_da_baixa := 'preparando';
      v_baixa_ligada    := TRUE;
    END IF;

    IF NOT v_baixa_ligada THEN
      RETURN NULL;
    END IF;

    IF NEW.status = v_status_da_baixa THEN
      PERFORM inventory_deduct_order_core(NEW.id);

    ELSIF NEW.status IN ('cancelado', 'deleted') THEN
      -- Devolve à prateleira o que tinha saído. Sem isto, cancelar um pedido
      -- deixaria o sistema achando que o ingrediente foi embora.
      PERFORM inventory_restore_order_core(NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[estoque] baixa automatica falhou no pedido % (% -> %): %',
      NEW.id, OLD.status, NEW.status, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS inventory_ao_mudar_status_do_pedido ON public.orders;
CREATE TRIGGER inventory_ao_mudar_status_do_pedido
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.inventory_ao_mudar_status_do_pedido();

-- Toda loja passa a ter a configuração escrita, em vez de depender do padrão
-- implícito. Assim a tela de configurações mostra o que está valendo, e mudar
-- o momento da baixa é uma edição, não uma criação.
INSERT INTO public.inventory_settings (pizzeria_id)
SELECT p.id FROM public.pizzerias p
ON CONFLICT (pizzeria_id) DO NOTHING;
