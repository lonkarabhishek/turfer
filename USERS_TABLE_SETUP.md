# Users Table Setup Guide

This guide explains how to set up the `users` table in your Supabase database to properly manage user data for the TapTurf application.

## Step 1: Create the Users Table

1. Go to your Supabase dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of `/database/create_users_table.sql`
4. Run the SQL script

This will:
- Create the `users` table with proper schema
- Set up Row Level Security (RLS) policies
- Create triggers to automatically sync new auth users
- Add indexes for better performance

## Step 2: Verify the Setup

After running the SQL script, you should see:
- A new `users` table in your database
- RLS policies in place
- A trigger that automatically creates user records when someone signs up

## Step 3: Test the Integration

1. Start the development server: `npm run dev`
2. Sign up a new user or log in with an existing user
3. Check the browser console for sync messages like:
   - `🔄 UserSyncUtility: Starting user sync...`
   - `✅ UserSyncUtility: User sync completed successfully`
4. Verify in Supabase that the user appears in the `users` table

## How It Works

### Automatic User Sync
- When a user signs up, the database trigger automatically creates a record in the `users` table
- For existing users, the `UserSyncUtility` component runs on login to ensure they exist in the table
- User data is extracted from `auth.users.raw_user_meta_data` and synced to the `users` table

### Game Request System
- Game requests now fetch user data directly from the `users` table
- This provides reliable access to user names and profile images
- No more "Game Player" placeholder text

### User Data Fields
The `users` table stores:
- `id` - UUID that matches `auth.users.id`
- `name` - User's display name
- `email` - User's email address
- `phone` - Phone number (optional)
- `role` - User role (player, owner, admin)
- `profile_image_url` - Profile picture URL
- `created_at` / `updated_at` - Timestamps

## Troubleshooting

### If users aren't syncing:
1. Check the browser console for error messages
2. Verify RLS policies are set up correctly
3. Ensure the trigger function exists and is working

### If game requests still show "Game Player":
1. Check that users exist in the `users` table
2. Look for console errors in the GameRequestSystem
3. Verify the user data queries are working

### Manual user sync:
If needed, you can manually sync a user by calling:
```javascript
import { ensureUserExists } from './src/lib/userSync';
await ensureUserExists();
```