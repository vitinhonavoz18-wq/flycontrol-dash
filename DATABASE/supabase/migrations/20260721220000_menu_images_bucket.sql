-- Fix: bucket "menu-images" nunca foi recriado na migração para o Supabase
-- próprio. As policies de storage.objects para esse bucket já existiam
-- (migradas junto com o resto do schema), mas sem a linha correspondente em
-- storage.buckets o upload falhava com "Bucket not found".
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'menu-images',
  'menu-images',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
