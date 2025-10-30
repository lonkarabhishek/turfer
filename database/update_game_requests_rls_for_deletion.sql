-- Update RLS policies on game_requests to allow game hosts to delete requests for their games

-- Drop existing delete policy if it exists
DROP POLICY IF EXISTS "Users can delete their own game requests" ON game_requests;
DROP POLICY IF EXISTS "Game hosts can delete requests for their games" ON game_requests;
DROP POLICY IF EXISTS "Allow delete own requests" ON game_requests;
DROP POLICY IF EXISTS "Allow delete game requests" ON game_requests;

-- Create new delete policy that allows:
-- 1. Users to delete their own requests
-- 2. Game hosts to delete any requests for their games
CREATE POLICY "Users and hosts can delete game requests"
ON game_requests
FOR DELETE
USING (
  auth.uid() = user_id  -- User can delete their own request
  OR
  auth.uid() IN (       -- OR user is the game host
    SELECT creator_id
    FROM games
    WHERE games.id = game_requests.game_id
  )
);

-- Verify the policy was created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'game_requests' AND cmd = 'DELETE';
