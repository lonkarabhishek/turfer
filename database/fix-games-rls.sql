-- Fix RLS policies for games table to allow public read access

-- Enable RLS on games table (if not already enabled)
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view open games" ON games;
DROP POLICY IF EXISTS "Users can view all games" ON games;
DROP POLICY IF EXISTS "Public games are viewable by everyone" ON games;

-- Create a permissive policy for reading open/upcoming games
CREATE POLICY "Anyone can view open games"
ON games
FOR SELECT
TO public
USING (
  status IN ('open', 'upcoming', 'active')
  OR (status IS NULL)
);

-- Policy for users to view their own games
CREATE POLICY "Users can view their own games"
ON games
FOR SELECT
TO authenticated
USING (creator_id = auth.uid());

-- Policy for creating games
CREATE POLICY "Authenticated users can create games"
ON games
FOR INSERT
TO authenticated
WITH CHECK (creator_id = auth.uid());

-- Policy for updating own games
CREATE POLICY "Users can update their own games"
ON games
FOR UPDATE
TO authenticated
USING (creator_id = auth.uid())
WITH CHECK (creator_id = auth.uid());

-- Policy for deleting own games
CREATE POLICY "Users can delete their own games"
ON games
FOR DELETE
TO authenticated
USING (creator_id = auth.uid());
