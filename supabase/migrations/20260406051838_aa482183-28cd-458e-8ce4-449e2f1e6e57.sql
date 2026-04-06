
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ai-import-uploads', 'ai-import-uploads', false, 52428800, ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Coaches can upload to ai-import-uploads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'ai-import-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Coaches can read from ai-import-uploads"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'ai-import-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Service role can delete from ai-import-uploads"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'ai-import-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
