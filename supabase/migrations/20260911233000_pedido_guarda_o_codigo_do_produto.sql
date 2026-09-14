-- ============================================================================
-- O PEDIDO PASSA A GUARDAR O CÓDIGO DO PRODUTO, NÃO SÓ O NOME
-- ============================================================================
--
-- O PROBLEMA
--
-- Os itens do pedido chegam do site com nome, preço e quantidade — sem o
-- código do produto. Para dar baixa no estoque, o sistema precisa descobrir de
-- qual item do cardápio se trata, e a única pista é o nome.
--
-- Funciona quase sempre. Falha no dia em que alguém renomeia "Pizza
-- Calabresa" para "Pizza de Calabresa": dali em diante o vínculo se perde e o
-- estoque para de baixar, em silêncio. Pior: os pedidos ANTIGOS também deixam
-- de ser reconhecidos, porque o nome guardado neles não existe mais no
-- cardápio.
--
-- É procurar a ficha do cliente pelo nome em vez do CPF. Enquanto ninguém
-- muda de nome, ninguém percebe o problema.
--
-- A SOLUÇÃO POSSÍVEL DESTE LADO
--
-- O conserto definitivo é o site mandar o código junto, e isso mora no outro
-- sistema. Mas dá para resolver quase tudo aqui: no instante em que o pedido
-- chega, o nome AINDA BATE com o cardápio. Então é esse o momento de resolver
-- o código e gravá-lo dentro do item.
--
-- Anotar o CPF quando o cliente entra, em vez de tentar achá-lo pelo nome
-- seis meses depois.
--
-- A partir daqui, renomear um produto deixa de quebrar a baixa: o pedido já
-- carrega o código, e `inventory_resolve_menu_product` prefere o código ao
-- nome. Pedidos gravados antes desta migração seguem dependendo do nome — não
-- há como adivinhar retroativamente o que já se perdeu.

CREATE OR REPLACE FUNCTION public.pedido_carimba_codigo_do_produto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_menu_id UUID;
  v_novos JSONB := '[]'::jsonb;
BEGIN
  IF NEW.items IS NULL OR jsonb_typeof(NEW.items) <> 'array' THEN
    RETURN NEW;
  END IF;

  -- Falha aqui NUNCA pode impedir um pedido de entrar. Pedido que não entra é
  -- venda perdida com o cliente já esperando; item sem código é, no pior caso,
  -- uma baixa de estoque que não acontece.
  BEGIN
    FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.items) LOOP
      -- Item que já veio com o código é respeitado como está: se um dia o site
      -- passar a mandar, esta função sai da frente sozinha.
      IF v_item ? 'menu_product_id' AND NULLIF(btrim(v_item->>'menu_product_id'), '') IS NOT NULL THEN
        v_novos := v_novos || v_item;
        CONTINUE;
      END IF;

      v_menu_id := inventory_resolve_menu_product(NEW.tenant_id, v_item);

      IF v_menu_id IS NULL THEN
        v_novos := v_novos || v_item;
      ELSE
        v_novos := v_novos || (v_item || jsonb_build_object('menu_product_id', v_menu_id));
      END IF;
    END LOOP;

    NEW.items := v_novos;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[estoque] nao foi possivel carimbar o codigo dos itens do pedido: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pedido_carimba_codigo_do_produto ON public.orders;
CREATE TRIGGER pedido_carimba_codigo_do_produto
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.pedido_carimba_codigo_do_produto();
