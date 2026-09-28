-- Limite de adicionais por produto.
--
-- Até agora um produto (ex.: "Açaí 250ml") aceitava qualquer quantidade de
-- adicionais marcados pelo cliente, sem trava nenhuma. Esta coluna guarda,
-- por produto, o número máximo de adicionais que o cliente pode escolher.
-- Nulo continua significando "sem limite" — nenhum produto já cadastrado
-- muda de comportamento até o lojista preencher um valor.
alter table public.menu_products
  add column if not exists max_extras integer;

comment on column public.menu_products.max_extras is
  'Quantidade máxima de adicionais que o cliente pode escolher neste produto. Nulo = sem limite.';
