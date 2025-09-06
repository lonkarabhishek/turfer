-- Fix users table password constraint for Supabase Auth integration
-- Since we're using Supabase Auth, we don't need the password field to be required

-- Make password field nullable (for existing users who might have this field)
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;

-- Update existing users with null passwords to empty string (if any exist)
UPDATE users SET password = '' WHERE password IS NULL;

-- Alternatively, we could remove the password column entirely since Supabase Auth handles it:
-- ALTER TABLE users DROP COLUMN password;

-- Add profile_image_url column if it doesn't exist (for user avatars)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='profile_image_url') THEN
        ALTER TABLE users ADD COLUMN profile_image_url TEXT;
    END IF;
END $$;

-- Update role enum to match our application values
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('player', 'owner', 'admin'));