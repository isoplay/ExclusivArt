BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'imagens-estoque',
  'imagens-estoque',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS imagens_estoque_select ON storage.objects;
DROP POLICY IF EXISTS imagens_estoque_insert ON storage.objects;
DROP POLICY IF EXISTS imagens_estoque_update ON storage.objects;
DROP POLICY IF EXISTS imagens_estoque_delete ON storage.objects;

CREATE POLICY imagens_estoque_select
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'imagens-estoque');

CREATE POLICY imagens_estoque_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'imagens-estoque');

CREATE POLICY imagens_estoque_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'imagens-estoque')
WITH CHECK (bucket_id = 'imagens-estoque');

CREATE POLICY imagens_estoque_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'imagens-estoque');

COMMIT;
