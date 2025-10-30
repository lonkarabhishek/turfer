-- Add game_requests and notifications tables for Supabase
-- This migration creates the missing tables needed for the game request system

-- Create game_requests table
CREATE TABLE IF NOT EXISTS game_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type VARCHAR NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add creator_id column to games table (alias for host_id for compatibility)
ALTER TABLE games
ADD COLUMN IF NOT EXISTS creator_id UUID;

-- Populate creator_id from host_id for existing records
UPDATE games
SET creator_id = host_id
WHERE creator_id IS NULL;

-- Create indexes for better performance
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

-- RLS Policies for game_requests

-- Users can view requests for their own games (as host)
CREATE POLICY "Hosts can view requests for their games" ON game_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM games
      WHERE games.id = game_requests.game_id
      AND (games.host_id = auth.uid() OR games.creator_id = auth.uid())
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
      AND (games.host_id = auth.uid() OR games.creator_id = auth.uid())
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

-- Create trigger to keep creator_id in sync with host_id
CREATE OR REPLACE FUNCTION sync_game_creator_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.host_id IS NOT NULL AND NEW.creator_id IS NULL THEN
    NEW.creator_id = NEW.host_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_game_creator_id_trigger ON games;
CREATE TRIGGER sync_game_creator_id_trigger
  BEFORE INSERT OR UPDATE ON games
  FOR EACH ROW
  EXECUTE FUNCTION sync_game_creator_id();
