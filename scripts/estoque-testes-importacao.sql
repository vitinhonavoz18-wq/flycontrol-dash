-- TESTES DA IMPORTAÇÃO POR JSON.
--
-- Os cenários pedidos na especificação, rodados contra um banco de verdade
-- com as migrações de verdade aplicadas.

\set ON_ERROR_STOP on
SET client_min_messages = WARNING;

CREATE TEMP TABLE resultado(ordem SERIAL, caso TEXT, veredito TEXT);

DO $$
DECLARE
  loja_a UUID; loja_b UUID;
  dono_a UUID := gen_random_uuid();
  dono_b UUID := gen_random_uuid();
  r JSONB; r2 JSONB;
  n INT; v NUMERIC; t TEXT;
  id_coca UUID; id_cat UUID;
  lista JSONB;
BEGIN
  INSERT INTO pizzerias (owner_id, name, plan_type) VALUES (dono_a, 'Mercado A', 'premium') RETURNING id INTO loja_a;
  INSERT INTO pizzerias (owner_id, name, plan_type) VALUES (dono_b, 'Mercado B', 'premium') RETURNING id INTO loja_b;
  PERFORM set_config('test.uid', dono_a::TEXT, FALSE);

  -- =======================================================================
  -- CENÁRIO 1 — um produto simples
  -- =======================================================================
  r := inventory_import_products(loja_a, jsonb_build_array(jsonb_build_object(
        'nome','Coca-Cola 2L','categoria','Bebidas','quantidade_estoque',20,
        'preco_venda_cents',1200,'acao','criar')), 'chave-1');
  INSERT INTO resultado(caso,veredito) VALUES ('1. Um produto e importado',
    CASE WHEN (r->>'total_created')::INT = 1 THEN 'OK' ELSE 'FALHOU: '||r::text END);

  -- o estoque inicial virou ENTRADA registrada, nao escrita direta
  SELECT stock_base INTO v FROM inventory_products WHERE pizzeria_id=loja_a AND name='Coca-Cola 2L';
  SELECT count(*) INTO n FROM inventory_movements m
    JOIN inventory_products p ON p.id=m.product_id
   WHERE p.name='Coca-Cola 2L' AND m.direction='in';
  INSERT INTO resultado(caso,veredito) VALUES ('   Estoque inicial virou entrada no extrato',
    CASE WHEN v=20 AND n=1 THEN 'OK (20, 1 movimentacao)' ELSE 'FALHOU: saldo '||v||' movs '||n END);

  -- =======================================================================
  -- CENÁRIO 8 — categoria inexistente e criada
  -- =======================================================================
  SELECT count(*) INTO n FROM inventory_categories WHERE pizzeria_id=loja_a AND name='Bebidas';
  INSERT INTO resultado(caso,veredito) VALUES ('8. Categoria nova e criada sozinha',
    CASE WHEN n=1 THEN 'OK' ELSE 'FALHOU: '||n END);

  -- =======================================================================
  -- CENÁRIO 9 — caixa + unidade
  -- =======================================================================
  r := inventory_import_products(loja_a, jsonb_build_array(jsonb_build_object(
        'nome','Guarana 2L','categoria','Bebidas','quantidade_estoque',0,
        'preco_venda_cents',1000,'acao','criar',
        'embalagens', jsonb_build_array(
          jsonb_build_object('unidade','caixa','quantidade',6,'preco_cents',5500)))), 'chave-2');
  SELECT c.base_quantity, c.price_cents INTO v, n FROM inventory_package_conversions c
    JOIN inventory_products p ON p.id=c.product_id
   WHERE p.name='Guarana 2L' AND c.unit='caixa';
  INSERT INTO resultado(caso,veredito) VALUES ('9. Caixa com 6 e preco proprio de R$ 55',
    CASE WHEN v=6 AND n=5500 THEN 'OK' ELSE 'FALHOU: qtd '||COALESCE(v::text,'-')||' preco '||COALESCE(n::text,'-') END);

  -- a venda pela caixa usa o preco da caixa, nao 6 x unitario
  SELECT id INTO id_coca FROM inventory_products WHERE pizzeria_id=loja_a AND name='Guarana 2L';
  PERFORM inventory_apply_movement(id_coca,'in','compra_fornecedor',10,'caixa');
  r := pos_finalize_sale(loja_a, jsonb_build_array(
        jsonb_build_object('product_id',id_coca,'quantity',1,'unit','caixa')), 'pix');
  INSERT INTO resultado(caso,veredito) VALUES ('   Venda de 1 caixa cobra R$ 55, nao R$ 60',
    CASE WHEN (r->>'subtotal_cents')::INT = 5500 THEN 'OK' ELSE 'FALHOU: '||(r->>'subtotal_cents') END);

  SELECT stock_base INTO v FROM inventory_products WHERE id=id_coca;
  INSERT INTO resultado(caso,veredito) VALUES ('   1 caixa vendida tira 6 unidades (60 -> 54)',
    CASE WHEN v=54 THEN 'OK (54)' ELSE 'FALHOU: '||v END);

  -- =======================================================================
  -- CENÁRIO 3 e 4 — sem preco e sem estoque sao validos
  -- =======================================================================
  r := inventory_import_products(loja_a, jsonb_build_array(jsonb_build_object(
        'nome','Produto Sem Preco','acao','criar')), 'chave-3');
  SELECT p2.price_cents, p2.stock_base INTO n, v FROM inventory_products p2
   WHERE p2.pizzeria_id=loja_a AND p2.name='Produto Sem Preco';
  INSERT INTO resultado(caso,veredito) VALUES ('3/4. Produto sem preco e sem estoque e aceito',
    CASE WHEN n=0 AND v=0 THEN 'OK' ELSE 'FALHOU: preco '||n||' estoque '||v END);

  -- =======================================================================
  -- CENÁRIO 5/6 — duplicidade por codigo de barras e SKU
  -- =======================================================================
  PERFORM inventory_import_products(loja_a, jsonb_build_array(jsonb_build_object(
        'nome','Agua 500ml','sku','AGUA500','codigo_barras','111','acao','criar')), 'chave-4');
  r := inventory_import_products(loja_a, jsonb_build_array(jsonb_build_object(
        'nome','Agua Mineral 500','sku','AGUA500','acao','criar')), 'chave-5');
  INSERT INTO resultado(caso,veredito) VALUES ('5/6. SKU repetido nao cria produto duplicado',
    CASE WHEN (r->>'total_errors')::INT = 1 AND (r->>'total_created')::INT = 0
         THEN 'OK: recusado' ELSE 'FALHOU: '||r::text END);

  -- =======================================================================
  -- CENÁRIO 7 — atualizar existente sem apagar o que ja tinha
  -- =======================================================================
  UPDATE inventory_products SET image_url='https://foto.antiga/coca.jpg'
   WHERE pizzeria_id=loja_a AND name='Coca-Cola 2L';
  SELECT id INTO id_coca FROM inventory_products WHERE pizzeria_id=loja_a AND name='Coca-Cola 2L';

  r := inventory_import_products(loja_a, jsonb_build_array(jsonb_build_object(
        'nome','Coca-Cola 2L','preco_venda_cents',1500,'imagem_url','',
        'acao','atualizar','produto_existente_id',id_coca)), 'chave-6');
  SELECT p2.price_cents, p2.image_url INTO n, t FROM inventory_products p2 WHERE p2.id=id_coca;
  INSERT INTO resultado(caso,veredito) VALUES ('7. Atualizar muda o preco e NAO apaga a foto',
    CASE WHEN n=1500 AND t='https://foto.antiga/coca.jpg' THEN 'OK'
         ELSE 'FALHOU: preco '||n||' foto '||COALESCE(t,'nula') END);

  -- =======================================================================
  -- CENÁRIO 12 — outra loja nao importa aqui
  -- =======================================================================
  PERFORM set_config('test.uid', dono_b::TEXT, FALSE);
  BEGIN
    PERFORM inventory_import_products(loja_a, jsonb_build_array(jsonb_build_object(
      'nome','Invasor','acao','criar')), 'chave-invasor');
    INSERT INTO resultado(caso,veredito) VALUES ('12. Outra loja nao importa neste estoque','FALHOU: deixou!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado(caso,veredito) VALUES ('12. Outra loja nao importa neste estoque','OK: '||SQLERRM);
  END;
  PERFORM set_config('test.uid', dono_a::TEXT, FALSE);

  -- =======================================================================
  -- CENÁRIO 14 — mesma importacao enviada duas vezes
  -- =======================================================================
  SELECT count(*) INTO n FROM inventory_products WHERE pizzeria_id=loja_a;
  r2 := inventory_import_products(loja_a, jsonb_build_array(jsonb_build_object(
        'nome','Coca-Cola 2L','categoria','Bebidas','quantidade_estoque',20,
        'preco_venda_cents',1200,'acao','criar')), 'chave-1');
  SELECT count(*) INTO v FROM inventory_products WHERE pizzeria_id=loja_a;
  INSERT INTO resultado(caso,veredito) VALUES ('14. Mesma importacao 2x nao cadastra de novo',
    CASE WHEN (r2->>'repetida')::BOOLEAN AND v = n THEN 'OK: devolveu o resultado anterior'
         ELSE 'FALHOU: repetida='||(r2->>'repetida')||' produtos '||n||'->'||v END);

  -- =======================================================================
  -- CENÁRIO 2 — 100 produtos de uma vez
  -- =======================================================================
  SELECT jsonb_agg(jsonb_build_object(
           'nome','Item Lote '||i,'categoria','Lote','quantidade_estoque',i,
           'preco_venda_cents',i*100,'acao','criar'))
    INTO lista FROM generate_series(1,100) i;
  r := inventory_import_products(loja_a, lista, 'chave-lote');
  INSERT INTO resultado(caso,veredito) VALUES ('2. Cem produtos numa importacao so',
    CASE WHEN (r->>'total_created')::INT = 100 THEN 'OK' ELSE 'FALHOU: '||(r->>'total_created') END);

  -- =======================================================================
  -- CENÁRIO 15 — falha no meio nao deixa metade gravada
  -- =======================================================================
  SELECT count(*) INTO n FROM inventory_products WHERE pizzeria_id=loja_a;
  BEGIN
    -- O segundo item tem quantidade negativa: o motor recusa e derruba tudo.
    PERFORM inventory_import_products(loja_a, jsonb_build_array(
      jsonb_build_object('nome','Antes da falha','acao','criar'),
      jsonb_build_object('nome','Causa da falha','quantidade_estoque',-5,'acao','criar')
    ), 'chave-falha');
    INSERT INTO resultado(caso,veredito) VALUES ('15. Falha no meio nao grava metade','FALHOU: passou');
  EXCEPTION WHEN OTHERS THEN
    SELECT count(*) INTO v FROM inventory_products WHERE pizzeria_id=loja_a;
    INSERT INTO resultado(caso,veredito) VALUES ('15. Falha no meio nao grava metade',
      CASE WHEN v = n THEN 'OK: desfez tudo ('||v||' produtos, igual antes)'
           ELSE 'FALHOU: sobrou gravado '||n||'->'||v END);
  END;

  -- =======================================================================
  -- Isolamento das categorias entre lojas
  -- =======================================================================
  PERFORM set_config('test.uid', dono_b::TEXT, FALSE);
  PERFORM inventory_import_products(loja_b, jsonb_build_array(jsonb_build_object(
    'nome','Coca-Cola 2L','categoria','Bebidas','acao','criar')), 'chave-b');
  SELECT count(*) INTO n FROM inventory_categories WHERE name='Bebidas';
  INSERT INTO resultado(caso,veredito) VALUES ('   Categoria "Bebidas" nao e compartilhada entre lojas',
    CASE WHEN n=2 THEN 'OK: cada loja tem a sua' ELSE 'FALHOU: '||n||' categorias' END);
  PERFORM set_config('test.uid', dono_a::TEXT, FALSE);

  -- =======================================================================
  -- Historico da importacao
  -- =======================================================================
  SELECT count(*) INTO n FROM inventory_imports WHERE pizzeria_id=loja_a;
  INSERT INTO resultado(caso,veredito) VALUES ('19. Toda importacao fica registrada',
    CASE WHEN n >= 6 THEN 'OK: '||n||' registros' ELSE 'FALHOU: '||n END);
END $$;

SELECT ordem, caso, veredito FROM resultado ORDER BY ordem;
SELECT COUNT(*) FILTER (WHERE veredito LIKE 'OK%') AS passaram,
       COUNT(*) FILTER (WHERE veredito LIKE 'FALHOU%') AS falharam
FROM resultado;
