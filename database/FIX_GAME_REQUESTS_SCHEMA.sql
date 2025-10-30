-- ============================================
-- FIX game_requests TABLE SCHEMA
-- Add missing columns that the code expects
-- ============================================

-- Add missing columns to game_requests
ALTER TABLE game_requests
ADD COLUMN IF NOT EXISTS requester_name VARCHAR,
ADD COLUMN IF NOT EXISTS requester_phone VARCHAR,
ADD COLUMN IF NOT EXISTS requester_avatar TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Also change status to use CHECK constraint like our code expects
-- First, remove any existing check constraint
DO $$
BEGIN
  ALTER TABLE game_requests DROP CONSTRAINT IF EXISTS game_requests_status_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Add proper check constraint for status
ALTER TABLE game_requests
ADD CONSTRAINT game_requests_status_check
CHECK (status IN ('pending', 'accepted', 'declined'));

-- Verify the changes
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'game_requests'
ORDER BY ordinal_position;
