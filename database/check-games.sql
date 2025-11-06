-- Check if games table exists and has data
-- Run this in Supabase SQL Editor to diagnose issues

-- 1. Check if games table exists
SELECT EXISTS (
   SELECT FROM information_schema.tables
   WHERE table_schema = 'public'
   AND table_name = 'games'
) as games_table_exists;

-- 2. Count total games
SELECT COUNT(*) as total_games FROM games;

-- 3. Check games by status
SELECT
    status,
    COUNT(*) as count
FROM games
GROUP BY status
ORDER BY count DESC;

-- 4. View sample games with their turf and user info
SELECT
    g.id,
    g.sport,
    g.date,
    g.status,
    g.turf_id,
    g.creator_id,
    t.name as turf_name,
    u.name as creator_name
FROM games g
LEFT JOIN turfs t ON g.turf_id = t.id
LEFT JOIN users u ON g.creator_id = u.id
ORDER BY g.created_at DESC
LIMIT 10;

-- 5. Check for games without turf_id or creator_id
SELECT
    COUNT(*) as games_without_turf
FROM games
WHERE turf_id IS NULL;

SELECT
    COUNT(*) as games_without_creator
FROM games
WHERE creator_id IS NULL;

-- 6. Check foreign key constraints
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_name = 'games';

-- 7. Check RLS policies on games table
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'games';
