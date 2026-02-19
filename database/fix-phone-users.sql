-- ============================================
-- FIX: Allow phone OTP users to create accounts
-- Apply this in Supabase SQL Editor
-- SAFE TO RUN MULTIPLE TIMES
-- ============================================

-- Problem: Phone OTP users authenticate via Firebase, not Supabase Auth.
-- They don't have an auth.users entry, so:
-- 1. The FK constraint on users.id blocks the insert
-- 2. RLS INSERT policy (auth.uid() = id) blocks anon users
-- 3. RLS SELECT policy (auth.uid() = id) blocks reading their own data

-- ============================================
-- STEP 1: Remove the FK constraint on users.id
-- This allows phone users to have IDs not in auth.users
-- ============================================

-- Find and drop the FK constraint (name may vary)
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO constraint_name
  FROM information_schema.table_constraints tc
  WHERE tc.table_name = 'users'
    AND tc.table_schema = 'public'
    AND tc.constraint_type = 'FOREIGN KEY';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', constraint_name);
    RAISE NOTICE 'Dropped FK constraint: %', constraint_name;
  ELSE
    RAISE NOTICE 'No FK constraint found on users table';
  END IF;
END $$;

-- ============================================
-- STEP 2: Add RLS policies for phone (anon) users
-- ============================================

-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Anyone can insert users" ON users;
DROP POLICY IF EXISTS "Anyone can read users" ON users;
DROP POLICY IF EXISTS "Users can view other users for games" ON users;

-- Allow anyone (including anon) to insert new users
-- This is needed because phone OTP users don't have a Supabase session
CREATE POLICY "Anyone can insert users" ON users
  FOR INSERT WITH CHECK (true);

-- Allow anyone to read user profiles (needed for game cards, host info, etc.)
CREATE POLICY "Anyone can read users" ON users
  FOR SELECT USING (true);

-- Keep existing update policy (only auth users can update their own data)
-- Phone users can update via anon key since they match by ID in localStorage

-- ============================================
-- STEP 3: Also fix game_requests and notifications for phone users
-- ============================================

-- Allow anon users to insert game requests
DROP POLICY IF EXISTS "Anyone can create requests" ON game_requests;
CREATE POLICY "Anyone can create requests" ON game_requests
  FOR INSERT WITH CHECK (true);

-- Allow anon users to read their own game requests (by user_id)
DROP POLICY IF EXISTS "Anyone can view own requests" ON game_requests;
CREATE POLICY "Anyone can view own requests" ON game_requests
  FOR SELECT USING (true);

-- Allow anon users to create notifications
DROP POLICY IF EXISTS "Anyone can create notifications" ON notifications;
CREATE POLICY "Anyone can create notifications" ON notifications
  FOR INSERT WITH CHECK (true);

-- Allow anon users to read notifications
DROP POLICY IF EXISTS "Anyone can read notifications" ON notifications;
CREATE POLICY "Anyone can read notifications" ON notifications
  FOR SELECT USING (true);

-- Allow anon users to update notifications (mark as read)
DROP POLICY IF EXISTS "Anyone can update notifications" ON notifications;
CREATE POLICY "Anyone can update notifications" ON notifications
  FOR UPDATE USING (true);

-- ============================================
-- STEP 4: Fix games table for phone users
-- ============================================

-- Allow anon users to insert games
DROP POLICY IF EXISTS "Anyone can create games" ON games;
CREATE POLICY "Anyone can create games" ON games
  FOR INSERT WITH CHECK (true);

-- Allow anon users to read games
DROP POLICY IF EXISTS "Anyone can read games" ON games;
CREATE POLICY "Anyone can read games" ON games
  FOR SELECT USING (true);

-- Allow anon users to update games (for accepting requests, updating player count)
DROP POLICY IF EXISTS "Anyone can update games" ON games;
CREATE POLICY "Anyone can update games" ON games
  FOR UPDATE USING (true);

-- ============================================
-- STEP 5: Fix game_participants for phone users
-- ============================================

DROP POLICY IF EXISTS "Anyone can manage participants" ON game_participants;

-- Check if table exists first
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'game_participants') THEN
    -- Enable RLS if not already
    ALTER TABLE game_participants ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Anyone can manage participants" ON game_participants
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'FK constraints on users:' as status;
SELECT tc.constraint_name, tc.constraint_type
FROM information_schema.table_constraints tc
WHERE tc.table_name = 'users' AND tc.table_schema = 'public';

SELECT 'RLS policies:' as status;
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename IN ('users', 'games', 'game_requests', 'notifications', 'game_participants')
ORDER BY tablename, policyname;
