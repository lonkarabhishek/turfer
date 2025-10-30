-- Delete ALL turfs from the database
-- Use this to clean slate before fresh upload

-- STEP 1: First, verify what will be deleted
SELECT
  id,
  name,
  address,
  owner_id,
  price_per_hour,
  created_at,
  'Will be deleted' as action
FROM public.turfs
ORDER BY created_at DESC;

-- Show count
SELECT COUNT(*) as total_turfs_to_delete FROM public.turfs;

-- STEP 2: Delete all turfs
-- Uncomment the line below when ready:
-- DELETE FROM public.turfs;

-- STEP 3: Verify deletion (run after uncommenting DELETE)
-- SELECT COUNT(*) as remaining_turfs FROM public.turfs;
