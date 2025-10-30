# Turf Data Import Instructions

## Overview
Import turf data from analyst's CSV into Supabase database.

## Step 1: Clean Up Existing Test Data

Run the cleanup SQL to delete existing test turfs:

```bash
# First, verify what will be deleted
PGPASSWORD=5rCkckqFBOy0Wkrp psql \
  -h aws-0-ap-southeast-1.pooler.supabase.com \
  -p 6543 \
  -U postgres.hwfsbpzercuoshodmnuf \
  -d postgres \
  -f database/cleanup-test-turfs.sql
```

Once verified, edit `database/cleanup-test-turfs.sql` and uncomment the DELETE statement, then run again.

## Step 2: Prepare Your CSV File

Your CSV should have these columns (exact names):
- `Turf Name` - Required
- `Address` - Required
- `Playing hours` - Optional (e.g., "Mon-Fri: 6am-11pm")
- `Google Maps Embed Html Link` - Optional
- `Description` - Optional
- `Ratings` - Optional (numeric, e.g., 4.5)
- `No. of reviews` - Optional (integer)
- `Link to reviews` - Optional (URL)
- `Phone number` - Optional
- `Email` - Optional
- `Sports` - Optional (comma-separated, e.g., "Football, Cricket")
- `Aminites` - Optional (comma-separated, e.g., "Parking, Washroom, Changing Room")
- `Website` - Optional (URL)
- `Price Per Hour` - Required (numeric)
- `Weekend Price` - Optional (numeric, defaults to Price Per Hour)
- `Image 1` through `Image 5` - Optional (image URLs)
- `Concat Image` - Not used (we use Image 1-5 individually)

## Step 3: Get Owner ID

You need a user ID to assign as the owner of all turfs.

To get an existing user ID or create a turf owner account:

```bash
# List existing users
PGPASSWORD=5rCkckqFBOy0Wkrp psql \
  -h aws-0-ap-southeast-1.pooler.supabase.com \
  -p 6543 \
  -U postgres.hwfsbpzercuoshodmnuf \
  -d postgres \
  -c "SELECT id, email, name FROM public.users LIMIT 10;"
```

**Use your own user ID** or create a dedicated "turf owner" account.

## Step 4: Generate SQL from CSV

```bash
# Run the Python script to convert CSV to SQL
python scripts/import-turfs-from-csv.py path/to/analyst_data.csv YOUR_OWNER_ID_HERE > database/import-turfs.sql
```

Example:
```bash
python scripts/import-turfs-from-csv.py ~/Downloads/turfs.csv 2067963f-xxxx-xxxx-xxxx-xxxxxxxxxxxx > database/import-turfs.sql
```

## Step 5: Review Generated SQL

Open `database/import-turfs.sql` and verify:
- Turf names are correct
- Addresses are properly escaped
- Images are correctly parsed
- Prices look correct

## Step 6: Import to Database

```bash
PGPASSWORD=5rCkckqFBOy0Wkrp psql \
  -h aws-0-ap-southeast-1.pooler.supabase.com \
  -p 6543 \
  -U postgres.hwfsbpzercuoshodmnuf \
  -d postgres \
  -f database/import-turfs.sql
```

## Step 7: Verify Import

```bash
# Check how many turfs were imported
PGPASSWORD=5rCkckqFBOy0Wkrp psql \
  -h aws-0-ap-southeast-1.pooler.supabase.com \
  -p 6543 \
  -U postgres.hwfsbpzercuoshodmnuf \
  -d postgres \
  -c "SELECT COUNT(*) as total_turfs, owner_id FROM public.turfs GROUP BY owner_id;"
```

```bash
# View imported turfs
PGPASSWORD=5rCkckqFBOy0Wkrp psql \
  -h aws-0-ap-southeast-1.pooler.supabase.com \
  -p 6543 \
  -U postgres.hwfsbpzercuoshodmnuf \
  -d postgres \
  -c "SELECT id, name, address, price_per_hour, rating FROM public.turfs ORDER BY created_at DESC LIMIT 10;"
```

## Troubleshooting

### Error: "invalid input syntax for type uuid"
- Make sure the owner_id is a valid UUID
- Check that owner_id exists in the users table

### Error: "syntax error" or "unterminated string"
- Check for special characters in turf names/descriptions (apostrophes, quotes)
- The script escapes single quotes, but check for other special chars

### Missing images
- Verify image URLs in CSV are valid and accessible
- Check that column names are exactly "Image 1", "Image 2", etc.

### Amenities spelled wrong
- Note: CSV column is "Aminites" (with typo) - script handles this
- If your CSV has "Amenities" (correct spelling), update the script on line 85

## Notes

- All turfs are set to `is_active = true` by default
- If lat/lng are not in CSV, they default to NULL (you can geocode later)
- Operating hours use a default 6am-11pm schedule if not specified
- First image becomes the cover_image automatically
