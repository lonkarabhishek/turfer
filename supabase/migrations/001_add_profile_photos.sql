-- Add profile photo column to users table
-- Migration: 001_add_profile_photos
-- Created: 2025-08-30

-- Add profile photo column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

-- Add comment to explain the column
COMMENT ON COLUMN users.profile_image_url IS 'URL to user profile image stored in Supabase Storage';

-- Enable RLS on users table if not already enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Authenticated users can view public profile info" ON users;

-- Create policy to allow users to view their own profile
CREATE POLICY "Users can view own profile" 
ON users FOR SELECT 
USING (auth.uid()::text = id);

-- Create policy to allow users to update their own profile
CREATE POLICY "Users can update own profile" 
ON users FOR UPDATE 
USING (auth.uid()::text = id)
WITH CHECK (auth.uid()::text = id);

-- Create policy to allow authenticated users to view other users' public info
CREATE POLICY "Authenticated users can view public profile info" 
ON users FOR SELECT 
USING (
  auth.role() = 'authenticated' 
  AND auth.uid() IS NOT NULL
);

-- Update the updated_at timestamp when profile is modified
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_users_updated_at'
    ) THEN
        CREATE TRIGGER update_users_updated_at 
        BEFORE UPDATE ON users 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;