-- Add game_requests and notifications tables for Supabase
-- This migration creates the missing tables needed for the game request system
-- SAFE VERSION: Works regardless of existing schema state

-- Create game_requests table
CREATE TABLE IF NOT EXISTS game_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  type VARCHAR NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add creator_id column to games table if it doesn't exist
-- This is safe to run multiple times
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'games' AND column_name = 'creator_id'
  ) THEN
    ALTER TABLE games ADD COLUMN creator_id UUID;
  END IF;
END $$;

-- Populate creator_id from host_id for existing records (if host_id exists)
-- This handles both cases: host_id exists or doesn't exist
DO $$
BEGIN
  -- Check if host_id column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'games' AND column_name = 'host_id'
  ) THEN
    -- If host_id exists, copy to creator_id
    UPDATE games
    SET creator_id = host_id
    WHERE creator_id IS NULL;
  END IF;
END $$;

-- Create indexes for better performance (safe to run multiple times)
CREATE INDEX IF NOT EXISTS idx_game_requests_game_id ON game_requests(game_id);
CREATE INDEX IF NOT EXISTS idx_game_requests_user_id ON game_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_game_requests_status ON game_requests(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_games_creator_id ON games(creator_id);

-- Enable Row Level Security
ALTER TABLE game_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Hosts can view requests for their games" ON game_requests;
DROP POLICY IF EXISTS "Users can view own requests" ON game_requests;
DROP POLICY IF EXISTS "Users can create requests" ON game_requests;
DROP POLICY IF EXISTS "Hosts can update requests" ON game_requests;
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Anyone can create notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;

-- RLS Policies for game_requests

-- Users can view requests for their own games (as host)
CREATE POLICY "Hosts can view requests for their games" ON game_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM games
      WHERE games.id = game_requests.game_id
      AND (
        games.creator_id = auth.uid()
        OR (games.creator_id IS NULL AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'games' AND column_name = 'host_id'
        ))
      )
    )
  );

-- Users can view their own requests (as requester)
CREATE POLICY "Users can view own requests" ON game_requests
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can create requests
CREATE POLICY "Users can create requests" ON game_requests
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Hosts can update requests (accept/decline)
CREATE POLICY "Hosts can update requests" ON game_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM games
      WHERE games.id = game_requests.game_id
      AND games.creator_id = auth.uid()
    )
  );

-- RLS Policies for notifications

-- Users can only view their own notifications
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT
  USING (user_id = auth.uid());

-- Anyone can insert notifications (for system-generated notifications)
CREATE POLICY "Anyone can create notifications" ON notifications
  FOR INSERT
  WITH CHECK (true);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications" ON notifications
  FOR DELETE
  USING (user_id = auth.uid());

-- Create trigger for updated_at on game_requests
CREATE OR REPLACE FUNCTION update_game_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_game_requests_updated_at ON game_requests;
CREATE TRIGGER update_game_requests_updated_at
  BEFORE UPDATE ON game_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_game_requests_updated_at();

-- Create trigger to keep creator_id in sync with host_id (if host_id exists)
CREATE OR REPLACE FUNCTION sync_game_creator_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if host_id column exists in the games table
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'games' AND column_name = 'host_id'
  ) THEN
    -- If host_id column exists, sync it with creator_id
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
      -- Use dynamic SQL to handle the case where host_id might not exist
      EXECUTE format('
        SELECT CASE
          WHEN NEW.creator_id IS NULL AND $1.host_id IS NOT NULL
          THEN $1.host_id
          ELSE NEW.creator_id
        END
      ', TG_TABLE_NAME)
      INTO NEW.creator_id
      USING NEW;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_game_creator_id_trigger ON games;
CREATE TRIGGER sync_game_creator_id_trigger
  BEFORE INSERT OR UPDATE ON games
  FOR EACH ROW
  EXECUTE FUNCTION sync_game_creator_id();
