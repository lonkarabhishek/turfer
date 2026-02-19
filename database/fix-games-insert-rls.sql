-- ============================================
-- FIX: Allow anon users (phone auth via Firebase) to create games
-- Run this in Supabase SQL Editor
-- ============================================

-- Drop restrictive insert policy
DROP POLICY IF EXISTS "Authenticated users can create games" ON games;
DROP POLICY IF EXISTS "Users can create games" ON games;

-- Allow anyone to create games (auth is handled in app layer for phone users)
CREATE POLICY "Anyone can create games"
ON games
FOR INSERT
TO public
WITH CHECK (true);

-- Also allow anon to add participants
DROP POLICY IF EXISTS "Anyone can insert participants" ON game_participants;
CREATE POLICY "Anyone can insert participants"
ON game_participants
FOR INSERT
TO public
WITH CHECK (true);

-- Allow reading game_participants for anyone
DROP POLICY IF EXISTS "Anyone can view participants" ON game_participants;
CREATE POLICY "Anyone can view participants"
ON game_participants
FOR SELECT
TO public
USING (true);

-- Verify
SELECT 'Done! Game creation should now work for phone auth users.' as status;
