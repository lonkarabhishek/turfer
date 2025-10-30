# 🚨 CRITICAL: Database Migration Required

## Game Requests Not Working - Apply This Migration ASAP

### Quick Steps:

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard
   - Select project: `hwfsbpzercuoshodmnuf`

2. **Open SQL Editor**
   - Click "SQL Editor" in left sidebar
   - Click "New Query"

3. **Apply Migration**
   - Open file: `database/APPLY_THIS_MIGRATION.sql`
   - Copy ALL contents
   - Paste in SQL Editor
   - Click "Run" (or Cmd/Ctrl + Enter)

4. **Verify Success**
   You should see: "Success. No rows returned"

---

## What This Fixes:

### Current Issues:
- ❌ Game join requests not creating in backend
- ❌ "You are hosting this game" not showing in production
- ❌ Requests disappearing after page refresh
- ❌ Notifications not working

### After Migration:
- ✅ Join requests saved to database
- ✅ Host identification working correctly
- ✅ Request state persists across refreshes
- ✅ In-app notifications functional
- ✅ Proper request tracking and management

---

## Tables Created:

### 1. `game_requests`
Stores all join requests from players:
- Request ID, game ID, user ID
- Request status (pending/accepted/declined)
- Requester info (name, phone, avatar)
- Timestamps

### 2. `notifications`
Stores in-app notifications:
- Notification type and content
- Read/unread status
- Metadata (game IDs, request IDs, etc.)

### 3. `games.creator_id` (new column)
- Identifies game creator/host
- Enables "You are hosting this game" message
- Used for access control

---

## Troubleshooting:

### Error: "relation already exists"
✅ **This is OK!** The migration uses `IF NOT EXISTS` - it's safe to run multiple times.

### Error: "column host_id does not exist"
This means your production schema is different. Run this first:
```sql
-- Check what columns exist in games table
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'games';
```

Then contact me with the output.

### Error: "permission denied"
Make sure you're logged in as the project owner in Supabase.

---

## Verification:

After running the migration, verify it worked:

```sql
-- Should return 2 rows (game_requests, notifications)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('game_requests', 'notifications');

-- Should return 1 row (creator_id)
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'games'
AND column_name = 'creator_id';

-- Should return several rows (RLS policies)
SELECT policyname
FROM pg_policies
WHERE tablename IN ('game_requests', 'notifications');
```

---

## Need Help?

If you encounter any errors:
1. Copy the exact error message
2. Run the verification queries above
3. Share both with me

**Remember:** The frontend code is already deployed and waiting for these database tables. Apply the migration ASAP! 🚀
