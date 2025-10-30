-- FIX: Resolve user ID mismatch between auth.users and public.users
-- This script handles the situation where public.users has different IDs than auth.users

-- APPROACH: Since game_participants.user_id references auth.users.id,
-- we need to ensure public.users has records with those same IDs.

-- STEP 1: For each auth user, check if there's a matching public.users by email but different ID
-- If so, we need to insert a NEW record with the correct auth ID
INSERT INTO public.users (id, email, password, name, phone, role, profile_image_url)
SELECT
  au.id as id, -- Use auth.users ID
  au.email,
  'supabase_auth' as password,
  COALESCE(
    au.raw_user_meta_data->>'name',
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'display_name',
    pu.name,
    split_part(au.email, '@', 1),
    'User'
  ) as name,
  COALESCE(
    au.raw_user_meta_data->>'phone',
    au.phone,
    pu.phone
  ) as phone,
  COALESCE(pu.role, 'user') as role,
  COALESCE(
    au.raw_user_meta_data->>'profile_image_url',
    au.raw_user_meta_data->>'avatar_url',
    au.raw_user_meta_data->>'picture',
    pu.profile_image_url
  ) as profile_image_url
FROM auth.users au
LEFT JOIN public.users pu ON pu.email = au.email
WHERE NOT EXISTS (
  -- Only insert if there isn't already a user with this auth ID
  SELECT 1 FROM public.users WHERE id = au.id
)
ON CONFLICT (id) DO NOTHING;

-- STEP 2: Now we have users with correct IDs.
-- The old records with wrong IDs can be left (they might have FK references)
-- But going forward, new users will be created with correct IDs via the trigger.

-- STEP 3: Verify the fix
SELECT
  au.email,
  au.id as auth_id,
  pu.id as public_id,
  pu.name,
  CASE
    WHEN pu.id IS NULL THEN 'MISSING from public.users ✗'
    WHEN au.id = pu.id THEN 'IDs match ✓'
    WHEN au.id != pu.id THEN 'IDs mismatch (but record exists) ⚠'
  END as status
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
ORDER BY status, au.email;
