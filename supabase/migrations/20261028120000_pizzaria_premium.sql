-- ============================================================================
-- Pizzaria Premium — campos novos do cardápio (FlyControl)
-- ============================================================================
--
-- Só ACRESCENTA colunas, todas opcionais. Nenhuma tabela, coluna ou registro
-- existente é apagado ou alterado, e nenhum preço muda: uma coluna vazia
-- significa "comporta-se como antes".
--
-- Espelha a mesma migração no SiteCreatorFly
-- (`supabase/migrations/20261028120000_pizzaria_premium.sql` do conectfly),
-- que tem os mesmos campos em `menu_items`. ORDEM: aplicar a do SiteCreatorFly
-- PRIMEIRO. O painel passa a enviar estes campos ao site quando o lojista
-- salva; se a coluna não existir lá, o site recusa a gravação.
--
-- As regras de acesso (RLS) das três tabelas não mudam: cada loja continua
-- vendo e alterando só os próprios itens, e colunas novas herdam essas regras.
-- ============================================================================

-- Sabores: preço por tamanho e lista de ingredientes.
--   pizza_size_prices_cents = { "<nome do tamanho, normalizado>": centavos }
--   ex.: { "media": 4590, "grande": 5490 }
-- O nome do tamanho (sem acento, minúsculo) é a chave, e não o código: o
-- FlyControl e o site guardam o mesmo tamanho com códigos diferentes.
alter table public.menu_products
  add column if not exists pizza_size_prices_cents jsonb,
  add column if not exists ingredients text[];

-- Bordas e adicionais: preço por tamanho e quantas vezes a mesma opção pode
-- entrar na mesma pizza (bacon 2x, por exemplo).
alter table public.menu_extras
  add column if not exists pizza_size_prices_cents jsonb,
  add column if not exists max_quantity integer;

-- Quais categorias são de pizza (os produtos dela viram sabores no montador).
-- O site já tem esta coluna; o painel passa a poder marcá-la.
alter table public.menu_categories
  add column if not exists is_pizza boolean not null default false;

-- Travas de formato: impedem gravar lixo que quebraria a conta.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'menu_products_pizza_prices_obj') then
    alter table public.menu_products add constraint menu_products_pizza_prices_obj
      check (pizza_size_prices_cents is null or jsonb_typeof(pizza_size_prices_cents) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'menu_products_ingredients_max') then
    alter table public.menu_products add constraint menu_products_ingredients_max
      check (ingredients is null or cardinality(ingredients) <= 40);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'menu_extras_pizza_prices_obj') then
    alter table public.menu_extras add constraint menu_extras_pizza_prices_obj
      check (pizza_size_prices_cents is null or jsonb_typeof(pizza_size_prices_cents) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'menu_extras_max_quantity_faixa') then
    alter table public.menu_extras add constraint menu_extras_max_quantity_faixa
      check (max_quantity is null or (max_quantity between 1 and 20));
  end if;
end $$;

comment on column public.menu_products.pizza_size_prices_cents is
  'Pizzaria Premium: preço do sabor por tamanho, em centavos. Chave = nome do tamanho normalizado. Nulo = usa o preço do tamanho.';
comment on column public.menu_products.ingredients is
  'Pizzaria Premium: ingredientes do sabor (o cliente pode pedir para retirar, se a loja permitir). Retirar não dá desconto.';
comment on column public.menu_extras.pizza_size_prices_cents is
  'Pizzaria Premium: preço da borda/adicional por tamanho, em centavos. Nulo = usa o preço único.';
comment on column public.menu_extras.max_quantity is
  'Pizzaria Premium: quantas vezes o mesmo adicional pode entrar na mesma pizza. Nulo = 1.';
comment on column public.menu_categories.is_pizza is
  'Categoria de pizza: os produtos dela são os sabores do montador.';
