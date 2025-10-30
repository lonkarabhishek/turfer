-- ============================================
-- PRODUCTION DATABASE MIGRATION
-- Apply this in Supabase SQL Editor
-- SAFE TO RUN MULTIPLE TIMES
-- ============================================

-- 1. Create game_requests table
CREATE TABLE IF NOT EXISTS game_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL,
  user_id UUID NOT NULL,
  note TEXT,
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  requester_name VARCHAR,
  requester_phone VARCHAR,
  requester_avatar TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type VARCHAR NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add creator_id column to games table
ALTER TABLE games ADD COLUMN IF NOT EXISTS creator_id UUID;

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_game_requests_game_id ON game_requests(game_id);
CREATE INDEX IF NOT EXISTS idx_game_requests_user_id ON game_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_game_requests_status ON game_requests(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_games_creator_id ON games(creator_id);

-- 5. Enable RLS (safe to run multiple times)
ALTER TABLE game_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 6. Drop and recreate all policies to ensure they're correct
DO $$
BEGIN
  -- Drop game_requests policies
  DROP POLICY IF EXISTS "Hosts can view requests for their games" ON game_requests;
  DROP POLICY IF EXISTS "Users can view own requests" ON game_requests;
  DROP POLICY IF EXISTS "Users can create requests" ON game_requests;
  DROP POLICY IF EXISTS "Hosts can update requests" ON game_requests;
  DROP POLICY IF EXISTS "Hosts can view requests" ON game_requests;

  -- Drop notifications policies
  DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
  DROP POLICY IF EXISTS "Anyone can create notifications" ON notifications;
  DROP POLICY IF EXISTS "System can create notifications" ON notifications;
  DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
  DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
END $$;

-- 7. Create RLS policies for game_requests
CREATE POLICY "Users can view own requests" ON game_requests
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Hosts can view requests" ON game_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM games
      WHERE games.id = game_requests.game_id
      AND games.creator_id = auth.uid()
    )
  );

CREATE POLICY "Users can create requests" ON game_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Hosts can update requests" ON game_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM games
      WHERE games.id = game_requests.game_id
      AND games.creator_id = auth.uid()
    )
  );

-- 8. Create RLS policies for notifications
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can create notifications" ON notifications
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own notifications" ON notifications
  FOR DELETE USING (user_id = auth.uid());

-- 9. Create or replace trigger function for game_requests updated_at
CREATE OR REPLACE FUNCTION update_game_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. Create trigger (drop first to avoid errors)
DROP TRIGGER IF EXISTS update_game_requests_updated_at ON game_requests;
CREATE TRIGGER update_game_requests_updated_at
  BEFORE UPDATE ON game_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_game_requests_updated_at();

-- ============================================
-- VERIFICATION QUERIES (Uncomment to run)
-- ============================================

-- Check tables were created
SELECT 'Tables created:' as status;
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('game_requests', 'notifications');

-- Check creator_id column was added
SELECT 'creator_id column added:' as status;
SELECT column_name FROM information_schema.columns
WHERE table_name = 'games' AND column_name = 'creator_id';

-- Check RLS policies
SELECT 'RLS policies created:' as status;
SELECT tablename, policyname FROM pg_policies
WHERE tablename IN ('game_requests', 'notifications')
ORDER BY tablename, policyname;
