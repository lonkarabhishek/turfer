-- Delete all existing test turfs
-- Run this to clean up before importing analyst data

-- STEP 1: Verify what will be deleted
SELECT
  id,
  name,
  address,
  owner_id,
  'Will be deleted' as action
FROM public.turfs
ORDER BY created_at;

-- STEP 2: Delete all turfs
-- Uncomment when ready:
/*
DELETE FROM public.turfs;

-- Verify deletion
SELECT COUNT(*) as remaining_turfs FROM public.turfs;
*/
