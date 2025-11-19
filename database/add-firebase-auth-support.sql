-- Add missing columns for Firebase authentication support

-- Add firebase_uid column to store Firebase user ID
ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid TEXT UNIQUE;

-- Add is_verified column to track verification status
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

-- Add password column (optional, for compatibility)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;

-- Allow id to be generated if not provided (for Firebase users)
ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Create index on firebase_uid for fast lookups
CREATE INDEX IF NOT EXISTS users_firebase_uid_idx ON users(firebase_uid);

-- Create index on phone for fast lookups
CREATE INDEX IF NOT EXISTS users_phone_idx ON users(phone);

-- Update RLS policies to work without auth.uid() dependency
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Users can view other users for games" ON users;

-- Create new policies that work with our custom JWT auth
-- Allow all authenticated requests (we handle auth in the API layer)
CREATE POLICY "Allow all authenticated access" ON users
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Disable the auth trigger that tries to auto-create users from auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
