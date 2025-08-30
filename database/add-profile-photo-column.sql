-- Add profile photo column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

-- Add comment to explain the column
COMMENT ON COLUMN users.profile_image_url IS 'URL to user profile image stored in Supabase Storage';

-- Create storage bucket for profile photos (if not exists)
-- This will be executed via JavaScript/API calls since it's a storage operation

-- Enable RLS on users table if not already enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to view their own profile
CREATE POLICY IF NOT EXISTS "Users can view own profile" 
ON users FOR SELECT 
USING (auth.uid() = id);

-- Create policy to allow users to update their own profile
CREATE POLICY IF NOT EXISTS "Users can update own profile" 
ON users FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Create policy to allow authenticated users to view other users' public info
CREATE POLICY IF NOT EXISTS "Authenticated users can view public profile info" 
ON users FOR SELECT 
USING (
  auth.role() = 'authenticated' 
  AND auth.uid() IS NOT NULL
);

-- Update the updated_at timestamp when profile is modified
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER IF NOT EXISTS update_users_updated_at 
BEFORE UPDATE ON users 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();