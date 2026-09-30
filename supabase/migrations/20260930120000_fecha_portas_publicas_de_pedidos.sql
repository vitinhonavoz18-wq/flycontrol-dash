-- Fecha as portas públicas da tabela de pedidos e dos itens de pedido.
--
-- O QUE ESTAVA ABERTO
--
--   orders       "orders_anon_insert_policy"   qualquer visitante (sem conta)
--                "orders_insert_policy"         qualquer conta logada
--                → podiam criar um pedido DIRETO na tabela, em qualquer loja,
--                  com o preço e o status que quisessem. É uma comanda em
--                  branco deixada no balcão: qualquer um escreve "2 pizzas por
--                  R$ 0,01, já entregue" e ela entra na fila da cozinha.
--
--   order_items  "Public can view order items"  qualquer visitante LIA todos os
--                                               itens de todos os pedidos de
--                                               todas as lojas (o que cada
--                                               concorrente vende, quanto, e as
--                                               observações dos clientes)
--                "Public can insert order items" qualquer visitante gravava
--
-- POR QUE É SEGURO FECHAR
--
-- Nenhum caminho legítimo usa essas portas. Os pedidos entram por dois
-- servidores, que usam a chave de serviço (e por isso não dependem destas
-- regras): a API do painel (/api/orders — site, WhatsApp, garçom) e a função
-- flydelivery-order (aplicativo). Conferido no código do painel e nas
-- estatísticas do banco desde 20/07/2026: nenhuma criação de pedido nem
-- leitura de itens feita por visitante ou conta logada nesse período —
-- apenas pelo servidor.
--
-- O que CONTINUA funcionando: dono da loja e administrador leem e mudam os
-- pedidos da própria loja; o cliente do app lê os próprios pedidos; os
-- servidores criam pedidos normalmente.
--
-- COMO DESFAZER (se algum sistema externo se revelar dependente):
--   create policy "orders_anon_insert_policy" on public.orders
--     for insert to anon with check (true);
--   create policy "orders_insert_policy" on public.orders
--     for insert with check (tenant_id is not null);
--   create policy "Public can view order items" on public.order_items
--     for select using (true);
--   create policy "Public can insert order items" on public.order_items
--     for insert with check (true);

drop policy if exists "orders_anon_insert_policy" on public.orders;
drop policy if exists "orders_insert_policy" on public.orders;
drop policy if exists "Public can view order items" on public.order_items;
drop policy if exists "Public can insert order items" on public.order_items;
