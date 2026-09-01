CREATE POLICY "Public read menu images" ON storage.objects FOR SELECT USING (bucket_id = 'menu-images');
CREATE POLICY "Authenticated upload menu images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'menu-images');
CREATE POLICY "Authenticated update menu images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'menu-images');
CREATE POLICY "Authenticated delete menu images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'menu-images');