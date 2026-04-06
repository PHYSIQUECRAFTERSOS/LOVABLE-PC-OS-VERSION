UPDATE storage.buckets 
SET allowed_mime_types = ARRAY['application/pdf','image/png','image/jpeg','image/gif','image/webp','text/plain']
WHERE id = 'ai-import-uploads';