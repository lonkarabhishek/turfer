-- Debug script to check Kridabhumi turf data
-- Run this in Supabase SQL Editor

-- 1. Check if the turf exists and has gmap_embed_link
SELECT
  id,
  name,
  CASE
    WHEN gmap_embed_link IS NULL THEN '❌ NULL - Need to add it!'
    WHEN gmap_embed_link = '' THEN '⚠️  EMPTY STRING'
    WHEN gmap_embed_link LIKE 'https://www.google.com/maps/embed%' THEN '✅ CORRECT FORMAT'
    WHEN gmap_embed_link LIKE '<iframe%' THEN '❌ WRONG - Contains iframe HTML'
    ELSE '⚠️  UNKNOWN FORMAT'
  END as gmap_status,
  LEFT(gmap_embed_link, 100) as gmap_preview
FROM turfs
WHERE name LIKE '%Kridabhumi%';

-- 2. Check all columns for this turf
SELECT * FROM turfs WHERE name LIKE '%Kridabhumi%';

-- 3. If gmap_embed_link is NULL or wrong, run this to fix it:
/*
UPDATE turfs
SET gmap_embed_link = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d59988.056981411595!2d73.7634669863553!3d19.997869983765423!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bddebec5a4252c9%3A0x7202127a9d820b53!2sKridabhumi%20-%20The%20Multisports%20Turf!5e0!3m2!1sen!2sin!4v1761559948927!5m2!1sen!2sin'
WHERE name LIKE '%Kridabhumi%';
*/

-- 4. Verify the update worked
SELECT
  name,
  LENGTH(gmap_embed_link) as link_length,
  LEFT(gmap_embed_link, 50) as first_50_chars
FROM turfs
WHERE name LIKE '%Kridabhumi%';

-- 5. Check for games at this turf
SELECT
  COUNT(*) as total_games,
  COUNT(CASE WHEN status = 'open' THEN 1 END) as open_games,
  COUNT(CASE WHEN date >= CURRENT_DATE THEN 1 END) as upcoming_games
FROM games
WHERE turf_id = (SELECT id FROM turfs WHERE name LIKE '%Kridabhumi%' LIMIT 1);

-- 6. List all games for this turf
SELECT
  id,
  date,
  start_time,
  sport,
  status,
  current_players || '/' || max_players as players
FROM games
WHERE turf_id = (SELECT id FROM turfs WHERE name LIKE '%Kridabhumi%' LIMIT 1)
ORDER BY date DESC, start_time DESC
LIMIT 5;
