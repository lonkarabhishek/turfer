-- Storage policies for profile photos bucket
-- Run these in Supabase Dashboard > Storage > profile-photos > Policies

-- 1. Allow authenticated users to upload their own profile photos
CREATE POLICY "Allow authenticated users to upload profile photos" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (
  bucket_id = 'profile-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 2. Allow public read access to profile photos
CREATE POLICY "Allow public read access to profile photos" 
ON storage.objects FOR SELECT 
TO public 
USING (bucket_id = 'profile-photos');

-- 3. Allow users to update their own profile photos
CREATE POLICY "Allow users to update own profile photos" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING (
  bucket_id = 'profile-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 4. Allow users to delete their own profile photos
CREATE POLICY "Allow users to delete own profile photos" 
ON storage.objects FOR DELETE 
TO authenticated 
USING (
  bucket_id = 'profile-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);