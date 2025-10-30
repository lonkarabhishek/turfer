-- Delete ALL turfs and related data (handles foreign keys)
-- This will delete turfs and all related records in other tables

-- STEP 1: Show what exists
SELECT 'TURFS' as table_name, COUNT(*) as count FROM public.turfs
UNION ALL
SELECT 'TURF_NOTIFICATIONS', COUNT(*) FROM public.turf_notifications
UNION ALL
SELECT 'BOOKINGS (if exists)', COUNT(*) FROM public.bookings WHERE turf_id IS NOT NULL;

-- STEP 2: Delete in correct order (child tables first, then parent)

-- Delete turf notifications first
DELETE FROM public.turf_notifications WHERE turf_id IN (SELECT id FROM public.turfs);

-- Delete any bookings related to turfs (if table exists)
-- DELETE FROM public.bookings WHERE turf_id IN (SELECT id FROM public.turfs);

-- Now delete all turfs
DELETE FROM public.turfs;

-- STEP 3: Verify deletion
SELECT 'AFTER DELETE - TURFS' as status, COUNT(*) as count FROM public.turfs
UNION ALL
SELECT 'AFTER DELETE - TURF_NOTIFICATIONS', COUNT(*) FROM public.turf_notifications;
