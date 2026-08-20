-- Capa (hero) do cardápio digital: imagem ou vídeo de fundo exibido no topo
-- do site público. Estes campos espelham os que o SiteCreatorFly já aceita
-- em `restaurants` (hero_image_url, hero_media_type, hero_video_url) — o
-- FlyControl passa a poder configurá-los e sincronizá-los.
ALTER TABLE public.pizzerias
  ADD COLUMN IF NOT EXISTS hero_image_url text,
  ADD COLUMN IF NOT EXISTS hero_video_url text,
  ADD COLUMN IF NOT EXISTS hero_media_type text NOT NULL DEFAULT 'image';
