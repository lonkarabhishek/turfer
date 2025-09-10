-- Fix database constraints to allow signup to work properly

-- 1. Make sure password field is nullable and has default value
ALTER TABLE users ALTER COLUMN password SET DEFAULT '';
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;

-- 2. Update any existing NULL passwords to empty string
UPDATE users SET password = '' WHERE password IS NULL;

-- 3. Update role constraint to match the application role mapping
-- Drop existing constraint if exists
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Add new constraint that matches the application (player, owner, admin)
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('player', 'owner', 'admin'));

-- 4. Ensure other columns have proper defaults
ALTER TABLE users ALTER COLUMN isVerified SET DEFAULT false;
ALTER TABLE users ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE users ALTER COLUMN updated_at SET DEFAULT NOW();

-- 5. Create an index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 6. Add RLS policies for public signup
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to read their own data
CREATE POLICY "Users can read own data" ON users FOR SELECT USING (auth.uid() = id);

-- Policy for authenticated users to update their own data  
CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (auth.uid() = id);

-- Policy to allow signup to insert new users
CREATE POLICY "Enable insert for new users" ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- Comment for tracking
COMMENT ON TABLE users IS 'Updated with proper signup constraints - migration 003';