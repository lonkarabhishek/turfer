# 🗃️ TapTurf Database Migration Guide

## Prerequisites
- Access to your Supabase project dashboard
- Project URL: https://hwfsbpzercuoshodmnuf.supabase.co
- Admin access to run SQL migrations

## Method 1: Supabase Dashboard (Recommended) ✅

### Step 1: Access SQL Editor
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to your project: `hwfsbpzercuoshodmnuf`
3. Click on **SQL Editor** in the left sidebar
4. Create a new query

### Step 2: Run Database Schema Migration
Copy and paste this SQL script into the SQL Editor:

```sql
-- Add profile photo column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

-- Add comment to explain the column
COMMENT ON COLUMN users.profile_image_url IS 'URL to user profile image stored in Supabase Storage';

-- Enable RLS on users table if not already enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to view their own profile
CREATE POLICY IF NOT EXISTS "Users can view own profile" 
ON users FOR SELECT 
USING (auth.uid()::text = id);

-- Create policy to allow users to update their own profile
CREATE POLICY IF NOT EXISTS "Users can update own profile" 
ON users FOR UPDATE 
USING (auth.uid()::text = id)
WITH CHECK (auth.uid()::text = id);

-- Create policy to allow authenticated users to view other users' public info
CREATE POLICY IF NOT EXISTS "Authenticated users can view public profile info" 
ON users FOR SELECT 
USING (
  auth.role() = 'authenticated' 
  AND auth.uid() IS NOT NULL
);

-- Update the updated_at timestamp when profile is modified (adjust column name as needed)
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
```

### Step 3: Create Storage Bucket
1. Go to **Storage** in the left sidebar
2. Click **New Bucket**
3. Create a bucket with these settings:
   - **Name**: `profile-photos`
   - **Public**: ✅ Yes (checked)
   - **File size limit**: 5MB
   - **Allowed MIME types**: `image/jpeg,image/png,image/webp`

### Step 4: Set Storage Policies
In the **Storage** section, add these policies for the `profile-photos` bucket:

1. **Allow authenticated uploads**:
```sql
CREATE POLICY "Allow authenticated users to upload profile photos" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
```

2. **Allow public reads**:
```sql
CREATE POLICY "Allow public read access to profile photos" 
ON storage.objects FOR SELECT 
TO public 
USING (bucket_id = 'profile-photos');
```

3. **Allow users to update own photos**:
```sql
CREATE POLICY "Allow users to update own profile photos" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
```

4. **Allow users to delete own photos**:
```sql
CREATE POLICY "Allow users to delete own profile photos" 
ON storage.objects FOR DELETE 
TO authenticated 
USING (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
```

## Method 2: Command Line (Advanced) 🛠️

If you prefer using the Supabase CLI:

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref hwfsbpzercuoshodmnuf

# Run the migration
supabase db push

# Or run the specific migration file
supabase migration new add_profile_photos
# Then copy the SQL content into the generated file
supabase db push
```

## Verification Steps ✅

After running the migration, verify everything works:

### 1. Check Database Schema
In the Supabase SQL Editor, run:
```sql
-- Check if column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'profile_image_url';

-- Check RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'users';
```

### 2. Check Storage Bucket
1. Go to **Storage** > **profile-photos**
2. Try uploading a test image
3. Verify public access works

### 3. Test Application Features
1. Deploy your updated application
2. Log in to TapTurf
3. Navigate to dashboard
4. Test profile photo upload functionality

## Troubleshooting 🔧

### Common Issues:

1. **Column already exists**: 
   - The migration uses `IF NOT EXISTS` so it's safe to run multiple times

2. **Permission denied**:
   - Make sure you're running as project owner
   - Check your Supabase project permissions

3. **Storage bucket issues**:
   - Verify bucket is public
   - Check storage policies are correctly applied
   - Test upload with curl or Postman

4. **RLS Policy conflicts**:
   - Check existing policies don't conflict
   - Update policies as needed for your use case

### Support:
- Check Supabase docs: https://supabase.com/docs
- TapTurf logs for any database connection issues
- Test with the ProfilePhotoUpload component we created

## Post-Migration Checklist ✅

- [ ] Database column `profile_image_url` added to `users` table
- [ ] RLS policies created and working
- [ ] Storage bucket `profile-photos` created with public access
- [ ] Storage policies allow authenticated uploads and public reads
- [ ] Application successfully connects and uploads photos
- [ ] Photos display correctly in TopNav and dashboard
- [ ] Error handling works for failed uploads

---

**Ready to deploy!** Once these migrations are complete, your TapTurf application will have full profile photo functionality! 🎉