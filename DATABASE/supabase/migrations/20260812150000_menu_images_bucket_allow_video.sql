-- O bucket "menu-images" nasceu só para fotos (10MB, apenas
-- jpeg/jpg/png/webp). Quando o upload de vídeo da Capa do Cardápio
-- (Hero) foi criado, ele passou a usar este mesmo bucket, mas o bucket
-- em si nunca aprendeu a aceitar vídeo — é como liberar uma nova
-- bandeira de cartão na maquininha sem cadastrar ela no sistema do
-- banco: a maquininha aceita o cartão, mas o banco recusa por trás.
-- Por isso todo upload de vídeo falhava com "mime type ... is not
-- supported", em qualquer formato (mp4, webm ou mov).
UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime'
  ],
  -- Sobe para acompanhar o limite de 25MB já usado pelo upload de vídeo
  -- (fotos continuam podendo no máximo 10MB, controlado no próprio formulário).
  file_size_limit = 26214400
WHERE id = 'menu-images';
