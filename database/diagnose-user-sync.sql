-- Diagnostic query to understand the user sync issue
-- Run this first to see what's going on

-- 1. Show users in auth.users
SELECT 'auth.users' as source, id, email,
       raw_user_meta_data->>'name' as name
FROM auth.users
ORDER BY email;

-- 2. Show users in public.users
SELECT 'public.users' as source, id, email, name
FROM public.users
ORDER BY email;

-- 3. Show mismatches where email matches but ID doesn't
SELECT
  au.id as auth_id,
  pu.id as public_id,
  au.email,
  au.raw_user_meta_data->>'name' as auth_name,
  pu.name as public_name,
  CASE
    WHEN au.id = pu.id THEN 'IDs match ✓'
    WHEN au.id != pu.id THEN 'IDs MISMATCH! ✗'
  END as status
FROM auth.users au
LEFT JOIN public.users pu ON au.email = pu.email
ORDER BY au.email;

-- 4. Show users in auth but not in public
SELECT
  'Missing from public.users' as issue,
  au.id,
  au.email,
  au.raw_user_meta_data->>'name' as name
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.email = au.email
);

-- 5. Show users in public but not in auth
SELECT
  'Orphaned in public.users' as issue,
  pu.id,
  pu.email,
  pu.name
FROM public.users pu
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users au WHERE au.email = pu.email
);
