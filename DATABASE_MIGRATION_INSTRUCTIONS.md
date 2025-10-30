# Database Migration Instructions

## Critical: Apply Database Migration for Game Requests

The game request system requires database tables that need to be created in production.

### Steps to Apply Migration:

1. **Go to your Supabase Dashboard**
   - Visit: https://supabase.com/dashboard
   - Select your project: `hwfsbpzercuoshodmnuf`

2. **Open SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Copy and Execute the Migration**
   - Open the file: `database/add_game_requests_and_notifications.sql`
   - Copy the entire contents
   - Paste into the SQL Editor
   - Click "Run" or press Cmd/Ctrl + Enter

4. **Verify the Migration**
   After running, verify the tables were created:
   ```sql
   -- Check if game_requests table exists
   SELECT table_name
   FROM information_schema.tables
   WHERE table_schema = 'public'
   AND table_name IN ('game_requests', 'notifications');

   -- Check if creator_id column was added to games
   SELECT column_name
   FROM information_schema.columns
   WHERE table_name = 'games'
   AND column_name = 'creator_id';
   ```

### What This Migration Does:

1. **Creates `game_requests` table**
   - Stores join requests from players
   - Includes requester info (name, phone, avatar)
   - Tracks request status (pending, accepted, declined)

2. **Creates `notifications` table**
   - Stores in-app notifications
   - Supports different notification types
   - Tracks read/unread status

3. **Adds `creator_id` column to `games` table**
   - Aliases `host_id` for compatibility
   - Auto-syncs with trigger
   - Fixes "You are hosting this game" not showing in prod

4. **Sets up Row Level Security (RLS)**
   - Proper access control for requests and notifications
   - Users can only see their own data
   - Hosts can manage requests for their games

### Troubleshooting:

**If you get errors about existing tables:**
- The migration uses `IF NOT EXISTS` clauses, so it's safe to run multiple times
- If tables already exist but are missing columns, drop and recreate them

**If RLS policies conflict:**
```sql
-- Drop existing policies if needed
DROP POLICY IF EXISTS "Hosts can view requests for their games" ON game_requests;
DROP POLICY IF EXISTS "Users can view own requests" ON game_requests;
-- Then re-run the migration
```

### After Migration:

The following features will work properly:
- ✅ Game join requests creation in backend
- ✅ "You are hosting this game" message in production
- ✅ Request state persistence across refreshes
- ✅ Notifications for game hosts
- ✅ Proper request tracking and management
