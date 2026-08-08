-- Capa (hero) do cardápio digital configurada pelo FlyControl.
--
-- Antes, a loja só tinha logo. A imagem/vídeo de capa que aparece no topo do
-- cardápio só podia ser trocada dentro do SiteCreatorFly. Agora o dono
-- configura tudo em um lugar só ("Minha Loja") e o FlyControl envia para o
-- site.
ALTER TABLE public.pizzerias
  ADD COLUMN IF NOT EXISTS hero_media_type text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS hero_image_url  text,
  ADD COLUMN IF NOT EXISTS hero_video_url  text;

ALTER TABLE public.pizzerias
  DROP CONSTRAINT IF EXISTS pizzerias_hero_media_type_check;

ALTER TABLE public.pizzerias
  ADD CONSTRAINT pizzerias_hero_media_type_check
  CHECK (hero_media_type IN ('image', 'video'));

-- O bucket de mídia já existia, mas só aceitava imagem e no máximo 10 MB.
-- Para aceitar vídeo de capa o limite sobe para 30 MB e os formatos de vídeo
-- passam a ser aceitos. O limite de 10 MB para imagem continua sendo aplicado
-- pelo próprio formulário, então nada muda para foto de produto.
UPDATE storage.buckets
SET
  file_size_limit = 31457280,
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
WHERE id = 'menu-images';
