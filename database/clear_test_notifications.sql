-- Clear all test/dummy notifications
-- Run this in Supabase SQL Editor to clean up test data

-- Delete all notifications (if you want to start fresh)
DELETE FROM notifications;

-- OR, if you want to keep real notifications but delete test ones,
-- you can add specific conditions. For example:
-- DELETE FROM notifications WHERE title LIKE '%test%' OR title LIKE '%demo%';

-- Reset the sequence if needed (Postgres only)
-- This ensures IDs start fresh
-- ALTER SEQUENCE notifications_id_seq RESTART WITH 1;
