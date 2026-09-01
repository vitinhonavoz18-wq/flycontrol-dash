
-- FlyStatus: artes visuais por status de pedido
ALTER TABLE public.pizzerias
  ADD COLUMN IF NOT EXISTS status_art_preparando_url text,
  ADD COLUMN IF NOT EXISTS status_art_saiu_url text,
  ADD COLUMN IF NOT EXISTS status_art_entregue_url text,
  ADD COLUMN IF NOT EXISTS status_text_preparando text DEFAULT '🍕🔥 SEU PEDIDO JÁ ESTÁ EM PREPARO

Nossa equipe já colocou a mão na massa 😋

Pedido #{NUMERO}',
  ADD COLUMN IF NOT EXISTS status_text_saiu text DEFAULT '🛵💨 SEU PEDIDO SAIU PARA ENTREGA

Agora falta pouco 😍

Pedido #{NUMERO}',
  ADD COLUMN IF NOT EXISTS status_text_entregue text DEFAULT '🍕❤️ PEDIDO ENTREGUE

Esperamos que tenha sido uma experiência deliciosa 😋

Obrigado pela preferência.

Pedido #{NUMERO}';

-- Bucket público para as artes
INSERT INTO storage.buckets (id, name, public)
VALUES ('status-arts', 'status-arts', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para o bucket status-arts
DROP POLICY IF EXISTS "status-arts public read" ON storage.objects;
CREATE POLICY "status-arts public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'status-arts');

DROP POLICY IF EXISTS "status-arts auth insert" ON storage.objects;
CREATE POLICY "status-arts auth insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'status-arts');

DROP POLICY IF EXISTS "status-arts auth update" ON storage.objects;
CREATE POLICY "status-arts auth update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'status-arts');

DROP POLICY IF EXISTS "status-arts auth delete" ON storage.objects;
CREATE POLICY "status-arts auth delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'status-arts');
