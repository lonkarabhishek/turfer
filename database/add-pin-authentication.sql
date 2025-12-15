-- Migration: Add PIN-based authentication support
-- Date: 2024-12-15
-- Description: Adds columns for permanent PIN storage and lockout tracking

-- Add PIN hash column (nullable for backward compatibility with existing users)
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin VARCHAR(255) NULL;

-- Add PIN attempt tracking for lockout mechanism
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_attempts INTEGER DEFAULT 0;

-- Add lockout timestamp (null = not locked)
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ NULL;

-- Create index for faster PIN lockout checks
CREATE INDEX IF NOT EXISTS idx_users_pin_locked ON users(pin_locked_until) WHERE pin_locked_until IS NOT NULL;

-- Comment on columns for documentation
COMMENT ON COLUMN users.pin IS 'Bcrypt hashed 4-digit PIN for quick login';
COMMENT ON COLUMN users.pin_attempts IS 'Failed PIN attempts counter (resets on success, locks at 5)';
COMMENT ON COLUMN users.pin_locked_until IS 'Timestamp until which PIN login is locked (15 min lockout)';
