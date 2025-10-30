-- Sync existing auth.users to public.users
-- This migration ensures all users in auth.users also exist in public.users

-- STEP 1: Update existing users that have matching email
-- This preserves their existing data and foreign key relationships
UPDATE public.users pu
SET
  name = COALESCE(
    au.raw_user_meta_data->>'name',
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'display_name',
    pu.name
  ),
  profile_image_url = COALESCE(
    au.raw_user_meta_data->>'profile_image_url',
    au.raw_user_meta_data->>'avatar_url',
    au.raw_user_meta_data->>'picture',
    pu.profile_image_url
  )
FROM auth.users au
WHERE pu.email = au.email;

-- STEP 2: Insert NEW users from auth.users that don't exist in public.users
-- Only insert if there's no user with that email OR that ID
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
  SELECT 1 FROM public.users pu WHERE pu.email = au.email
)
ON CONFLICT (id) DO NOTHING;

-- Log the sync
DO $$
DECLARE
  synced_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO synced_count FROM public.users;
  RAISE NOTICE 'User sync complete. Total users in public.users: %', synced_count;
END $$;
