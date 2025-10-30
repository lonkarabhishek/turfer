-- Fix specific user ID mismatches
-- This handles the 4 users who have different IDs in public.users vs auth.users

-- STEP 1: Temporarily change emails of old records to avoid unique constraint
UPDATE public.users SET email = email || '.old' WHERE id = '257f5fdd-252c-4e96-949b-843806b35607'; -- old abhisheksoffice11
UPDATE public.users SET email = email || '.old' WHERE id = 'b7f84117-db40-4750-8140-daf2f248c746'; -- old lonkarabhishek00
UPDATE public.users SET email = email || '.old' WHERE id = '5e862c9f-f86c-45bb-914a-fe7924efefd8'; -- old nisox22166
UPDATE public.users SET email = email || '.old' WHERE id = '0d4b52f5-702a-4685-8dc4-2f282abc39d6'; -- old pawardishant28

-- STEP 2: Insert records with correct auth IDs for the 4 mismatched users
-- Copy data from the old records (now with .old emails) and use the correct auth ID

-- User 1: abhisheksoffice11@gmail.com
INSERT INTO public.users (id, email, password, name, phone, role, profile_image_url, created_at, updated_at)
SELECT
  'b8e4af57-c3fb-4593-bb6d-3805a706a699'::uuid as id,
  REPLACE(email, '.old', '') as email,
  password, name, phone, role, profile_image_url, created_at, NOW() as updated_at
FROM public.users
WHERE email = 'abhisheksoffice11@gmail.com.old'
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  profile_image_url = EXCLUDED.profile_image_url;

-- User 2: lonkarabhishek00@gmail.com
INSERT INTO public.users (id, email, password, name, phone, role, profile_image_url, created_at, updated_at)
SELECT
  '2067963f-fa2e-4983-b093-7338f65df37a'::uuid as id,
  REPLACE(email, '.old', '') as email,
  password, name, phone, role, profile_image_url, created_at, NOW() as updated_at
FROM public.users
WHERE email = 'lonkarabhishek00@gmail.com.old'
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  profile_image_url = EXCLUDED.profile_image_url;

-- User 3: nisox22166@ekuali.com
INSERT INTO public.users (id, email, password, name, phone, role, profile_image_url, created_at, updated_at)
SELECT
  'e1992095-d548-4de8-8b2e-0f9d4bcf1fdd'::uuid as id,
  REPLACE(email, '.old', '') as email,
  password, name, phone, role, profile_image_url, created_at, NOW() as updated_at
FROM public.users
WHERE email = 'nisox22166@ekuali.com.old'
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  profile_image_url = EXCLUDED.profile_image_url;

-- User 4: pawardishant28@gmail.com
INSERT INTO public.users (id, email, password, name, phone, role, profile_image_url, created_at, updated_at)
SELECT
  '30c52762-b448-4675-9fb5-d4e52e0b5ef4'::uuid as id,
  REPLACE(email, '.old', '') as email,
  password, name, phone, role, profile_image_url, created_at, NOW() as updated_at
FROM public.users
WHERE email = 'pawardishant28@gmail.com.old'
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  profile_image_url = EXCLUDED.profile_image_url;

-- STEP 2: Verify the fix worked
SELECT
  au.email,
  au.id as auth_id,
  pu.id as public_id,
  pu.name,
  CASE
    WHEN pu.id IS NULL THEN 'MISSING ✗'
    WHEN au.id = pu.id THEN 'FIXED ✓'
    WHEN au.id != pu.id THEN 'STILL MISMATCHED ✗'
  END as status
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE au.email IN (
  'abhisheksoffice11@gmail.com',
  'lonkarabhishek00@gmail.com',
  'nisox22166@ekuali.com',
  'pawardishant28@gmail.com'
)
ORDER BY au.email;

-- STEP 3: Optional - Delete the old records with wrong IDs
-- Uncomment the lines below ONLY if you're sure they have no foreign key references
-- or if you've already migrated those references to the new IDs

/*
DELETE FROM public.users WHERE id = '257f5fdd-252c-4e96-949b-843806b35607'; -- old abhisheksoffice11
DELETE FROM public.users WHERE id = 'b7f84117-db40-4750-8140-daf2f248c746'; -- old lonkarabhishek00
DELETE FROM public.users WHERE id = '5e862c9f-f86c-45bb-914a-fe7924efefd8'; -- old nisox22166
DELETE FROM public.users WHERE id = '0d4b52f5-702a-4685-8dc4-2f282abc39d6'; -- old pawardishant28
*/
