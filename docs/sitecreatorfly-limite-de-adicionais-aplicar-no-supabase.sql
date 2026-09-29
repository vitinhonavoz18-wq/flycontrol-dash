-- =====================================================================
-- APLICAR NO SUPABASE DO SITECREATORFLY (projeto SITECREATORFLY),
-- não no do FlyControl.
--
-- JÁ FOI APLICADO em 29/09/2026. Este arquivo fica como registro, porque
-- o repositório do SiteCreatorFly não vive junto com o do FlyControl.
--
-- POR QUE ISTO EXISTE
--
-- Salvar um produto no painel falhava com:
--   "Could not find the 'max_extras' column of 'menu_items' in the
--    schema cache"
--
-- A migração do "limite de adicionais" (20260928150000) criou a coluna só
-- no banco do FlyControl. Mas o painel também manda o produto para o site,
-- e a tabela de itens do site (`menu_items`) não tinha onde guardar o
-- limite — então o site recusava o produto inteiro.
--
-- É o caderno de pedidos da cozinha ganhar um campo novo ("limite de
-- adicionais") enquanto o caderno do salão continua sem esse campo: quando
-- o garçom tenta copiar a anotação inteira, o caderno do salão recusa.
-- =====================================================================
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS max_extras integer;

COMMENT ON COLUMN public.menu_items.max_extras IS
  'Quantidade máxima de adicionais que o cliente pode escolher neste item. Nulo = sem limite.';

-- Faz a API do Supabase enxergar a coluna nova imediatamente.
NOTIFY pgrst, 'reload schema';
