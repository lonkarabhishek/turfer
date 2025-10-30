-- Sync existing auth.users to public.users
-- This migration ensures all users in auth.users also exist in public.users

-- Insert users from auth.users that don't exist in public.users
INSERT INTO public.users (id, email, password, name, profile_image_url)
SELECT
  au.id,
  au.email,
  'supabase_auth' as password, -- Placeholder since Supabase Auth handles authentication
  COALESCE(
    au.raw_user_meta_data->>'name',
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'display_name',
    split_part(au.email, '@', 1),
    'User'
  ) as name,
  COALESCE(
    au.raw_user_meta_data->>'profile_image_url',
    au.raw_user_meta_data->>'avatar_url',
    au.raw_user_meta_data->>'picture'
  ) as profile_image_url
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.id = au.id
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = COALESCE(EXCLUDED.name, public.users.name),
  profile_image_url = COALESCE(EXCLUDED.profile_image_url, public.users.profile_image_url);

-- Log the sync
DO $$
DECLARE
  synced_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO synced_count FROM public.users;
  RAISE NOTICE 'User sync complete. Total users in public.users: %', synced_count;
END $$;
