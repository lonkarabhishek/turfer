-- ============================================
-- POPULATE creator_id FOR EXISTING GAMES
-- Run this AFTER the main migration
-- ============================================

-- Step 1: Check what columns exist in games table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'games'
AND column_name IN ('id', 'host_id', 'creator_id')
ORDER BY column_name;

-- Step 2: Check current state of games
SELECT
  id,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'games' AND column_name = 'host_id'
    ) THEN 'host_id exists'
    ELSE 'host_id missing'
  END as host_id_status,
  creator_id as current_creator_id
FROM games
LIMIT 5;

-- Step 3: Populate creator_id from various possible sources
-- This handles different schema variations

-- Try Method 1: If host_id column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'games' AND column_name = 'host_id'
  ) THEN
    UPDATE games
    SET creator_id = host_id
    WHERE creator_id IS NULL AND host_id IS NOT NULL;

    RAISE NOTICE 'Updated % games from host_id', (SELECT COUNT(*) FROM games WHERE creator_id IS NOT NULL);
  END IF;
END $$;

-- Verification: Check how many games now have creator_id
SELECT
  COUNT(*) as total_games,
  COUNT(creator_id) as games_with_creator_id,
  COUNT(*) - COUNT(creator_id) as games_missing_creator_id
FROM games;

-- Show games that still don't have creator_id
SELECT id, creator_id
FROM games
WHERE creator_id IS NULL
LIMIT 10;
