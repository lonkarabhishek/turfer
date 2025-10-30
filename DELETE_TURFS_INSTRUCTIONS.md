# How to Delete All Turfs

The `turfs` table has foreign key constraints from other tables. You need to delete in the correct order.

## Quick Delete Command

Copy and paste this entire command:

```bash
PGPASSWORD=5rCkckqFBOy0Wkrp psql -h aws-0-ap-southeast-1.pooler.supabase.com -p 6543 -U postgres.hwfsbpzercuoshodmnuf -d postgres << 'EOF'
-- Delete turf notifications first
DELETE FROM public.turf_notifications WHERE turf_id IN (SELECT id FROM public.turfs);

-- Delete any bookings (if exists)
DELETE FROM public.bookings WHERE turf_id IN (SELECT id FROM public.turfs);

-- Now delete all turfs
DELETE FROM public.turfs;

-- Show result
SELECT 'Remaining turfs' as status, COUNT(*) as count FROM public.turfs;
EOF
```

## OR Use the SQL File

```bash
PGPASSWORD=5rCkckqFBOy0Wkrp psql \
  -h aws-0-ap-southeast-1.pooler.supabase.com \
  -p 6543 \
  -U postgres.hwfsbpzercuoshodmnuf \
  -d postgres \
  -f database/delete-all-turfs-cascade.sql
```

## What Gets Deleted:

1. ❌ All turf_notifications related to turfs
2. ❌ All bookings related to turfs (if any)
3. ❌ All turfs

After this, you'll have a clean slate for fresh uploads!
