-- Add requester information columns to game_requests table
-- This stores the requester's name, phone, and avatar to avoid needing joins

-- Add columns if they don't exist
ALTER TABLE game_requests
ADD COLUMN IF NOT EXISTS requester_name VARCHAR,
ADD COLUMN IF NOT EXISTS requester_phone VARCHAR,
ADD COLUMN IF NOT EXISTS requester_avatar TEXT;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_game_requests_user_id ON game_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_game_requests_game_id ON game_requests(game_id);
CREATE INDEX IF NOT EXISTS idx_game_requests_status ON game_requests(status);

-- Update existing rows to populate requester_name from users table if available
UPDATE game_requests gr
SET requester_name = u.name,
    requester_phone = u.phone,
    requester_avatar = u.profile_image_url
FROM users u
WHERE gr.user_id = u.id
  AND gr.requester_name IS NULL;
