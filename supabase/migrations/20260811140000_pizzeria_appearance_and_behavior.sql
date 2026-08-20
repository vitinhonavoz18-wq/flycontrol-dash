-- Bloco 2 (aparência) e Bloco 3 (comportamento do cardápio) do site
-- público: modelo visual, cor secundária, mostrar fotos nos itens, e as
-- opções de comportamento que o SiteCreatorFly guarda dentro de
-- `restaurants.site_settings` (modo de navegação, visibilidade dos combos,
-- botão do carrinho, texto do botão principal).
--
-- `site_settings` aqui é só o espelho local do que o FlyControl conhece —
-- o SiteCreatorFly mescla com o que já tem salvo lá (ver
-- mergeJsonbSettings em conectfly/src/routes/api/menu-sync.$.ts), então
-- este objeto não precisa (e não deve) tentar conter todas as chaves que
-- o SiteCreatorFly eventualmente suporte.
ALTER TABLE public.pizzerias
  ADD COLUMN IF NOT EXISTS selected_template text NOT NULL DEFAULT 'black',
  ADD COLUMN IF NOT EXISTS secondary_color text,
  ADD COLUMN IF NOT EXISTS show_item_images boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS site_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
