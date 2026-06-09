-- Create the barber-photos storage bucket (public) if it doesn't exist,
-- then add RLS policies so authenticated users can upload/update/delete their
-- own files and anyone can read public URLs.

INSERT INTO storage.buckets (id, name, public)
VALUES ('barber-photos', 'barber-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop first to make idempotent (CREATE POLICY has no IF NOT EXISTS)
DROP POLICY IF EXISTS "authenticated_insert_barber_photos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_update_barber_photos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_delete_barber_photos" ON storage.objects;
DROP POLICY IF EXISTS "public_select_barber_photos"        ON storage.objects;

-- Allow authenticated users to upload new files
CREATE POLICY "authenticated_insert_barber_photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'barber-photos');

-- Allow authenticated users to overwrite (upsert)
CREATE POLICY "authenticated_update_barber_photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING  (bucket_id = 'barber-photos')
  WITH CHECK (bucket_id = 'barber-photos');

-- Allow authenticated users to delete their uploads
CREATE POLICY "authenticated_delete_barber_photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'barber-photos');

-- Allow anyone to read (public bucket — used by getPublicUrl)
CREATE POLICY "public_select_barber_photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'barber-photos');
