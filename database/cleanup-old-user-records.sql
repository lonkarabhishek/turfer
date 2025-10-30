-- Cleanup old duplicate user records with .old or .old.old emails
-- Run this AFTER verifying that player names are showing correctly

-- STEP 1: Verify which records will be deleted
SELECT
  id,
  email,
  name,
  'Will be deleted' as action
FROM public.users
WHERE email LIKE '%.old%'
ORDER BY email;

-- STEP 2: Delete the old duplicate records
-- Uncomment these lines when ready to clean up:
/*
DELETE FROM public.users WHERE email LIKE '%.old%';

-- Verify cleanup
SELECT COUNT(*) as remaining_old_records FROM public.users WHERE email LIKE '%.old%';
*/
