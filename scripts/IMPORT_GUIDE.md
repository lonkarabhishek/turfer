# Turf Data Import Guide

This guide explains how to import bulk turf data from your research analyst into the TapTurf database.

## 📋 Prerequisites

1. ✅ Your schema already has all required fields
2. ✅ CSV file from your analyst with turf data
3. ✅ Admin user account in Supabase (to own the turfs)

## 🔧 Optional Schema Enhancements

Run this SQL in Supabase SQL Editor first (optional but recommended):

```bash
# In Supabase SQL Editor, run:
/Users/abhisheklonkar/turfer/database/add_turf_enhancements.sql
```

This adds:
- `external_review_url` - Link to Google Reviews, etc.
- `cover_image` - Primary display image
- Performance index on `rating`

## 📊 CSV Format Expected

Your analyst's data should have these columns (exact names):

| Column Name | Required | Example | Notes |
|-------------|----------|---------|-------|
| Turf Name | ✅ Yes | "Big Bounce Turf" | |
| Address | ✅ Yes | "New Tidke Colony Rd, Nashik" | |
| Playing hours | ✅ Yes | "Mon-Fri: 6am-10pm, Sat-Sun: 5am-11pm" | Will parse automatically |
| Google Maps Embed Html Link | No | `<iframe src="...">` | Will extract lat/lng |
| Description | No | "Premium football turf..." | |
| Ratings | No | 4.5 | Decimal 0-5 |
| No. of reviews | No | 127 | Integer |
| Link to reviews | No | "https://g.page/..." | External review link |
| Phone number | No | "9876543210" | |
| Email | No | "info@turf.com" | |
| Sports | No | "Football, Cricket, Tennis" | Comma-separated |
| Amenities | No | "Parking, Changing Room" | Comma-separated |
| Website | No | "https://turf.com" | |
| Price Per Hour | No | 500 | Default: 500 |
| Weekend Price | No | 600 | Optional |
| Image 1 | No | "https://..." | Image URLs |
| Image 2 | No | "https://..." | |
| Image 3 | No | "https://..." | |
| Image 4 | No | "https://..." | |
| Image 5 | No | "https://..." | |
| Concat Image | No | "https://..." | Primary/cover image |

## 🚀 Import Steps

### Step 1: Get Your Admin User ID

```sql
-- Run in Supabase SQL Editor to get your user ID
SELECT id, email, name FROM users WHERE role = 'admin' OR email = 'your-email@example.com';
```

Copy the `id` - you'll need it for the import.

### Step 2: Prepare Your CSV File

1. Save your analyst's Excel/CSV file as `turfs-data.csv`
2. Place it in `/Users/abhisheklonkar/turfer/scripts/turfs-data.csv`
3. Ensure column names match exactly (case-sensitive)

### Step 3: Update the Script

Open `/Users/abhisheklonkar/turfer/scripts/import-turfs.js` and update:

```javascript
// Line 19: Replace with your admin user ID
const DEFAULT_OWNER_ID = 'your-admin-user-id-here';
```

### Step 4: Install Dependencies

```bash
cd /Users/abhisheklonkar/turfer
npm install csv-parse
```

### Step 5: Run the Import

```bash
# Basic usage (uses default owner ID and looks for scripts/turfs-data.csv)
node scripts/import-turfs.js

# Or specify custom path and owner ID
node scripts/import-turfs.js /path/to/data.csv your-owner-id
```

### Step 6: Monitor Progress

The script will:
1. ✅ Load and parse CSV
2. ✅ Transform data to match your schema
3. ✅ Show preview of first record
4. ⏸️  Wait 5 seconds (you can Ctrl+C to cancel)
5. ✅ Upload in batches of 100
6. ✅ Show progress and summary

Example output:
```
🚀 Starting turf import...

✅ CSV file loaded
✅ Parsed 50 records

✅ Data transformed

📋 Preview of first record:
{
  "name": "Big Bounce Turf",
  "address": "New Tidke Colony Rd, Nashik",
  "sports": ["Football", "Cricket"],
  ...
}

⚠️  About to import 50 turfs to database
Press Ctrl+C to cancel, or wait 5 seconds to continue...

📤 Uploading batch 1/1 (50 records)...
✅ Batch 1 complete (50 records)

==================================================
📊 Import Summary:
==================================================
Total records in CSV: 50
Successfully imported: 50
Errors: 0

✅ Import complete!
🎉 All done!
```

## 🔍 Data Transformation Details

### Operating Hours Parsing

The script intelligently parses various formats:

```
"Mon-Fri: 6am-10pm, Sat-Sun: 5am-11pm"
→ {"weekdays": "6am-10pm", "weekends": "5am-11pm"}

"9am-9pm daily"
→ {"default": "9am-9pm"}
```

### Coordinate Extraction

Automatically extracts lat/lng from Google Maps embed links:

```html
<iframe src="https://maps.google.com/?q=19.1234,72.5678&...">
→ lat: 19.1234, lng: 72.5678
```

### Sports & Amenities

Converts comma-separated strings to arrays:

```
"Football, Cricket, Tennis"
→ ["Football", "Cricket", "Tennis"]
```

### Images

Combines Image 1-5 into an array:

```
Image 1: "url1", Image 2: "url2", Image 3: ""
→ ["url1", "url2"]
```

### Contact Info

Structures into JSONB:

```
Phone: "9876543210", Email: "info@turf.com", Website: "turf.com"
→ {"phone": "9876543210", "email": "info@turf.com", "website": "turf.com"}
```

## ⚠️ Common Issues & Solutions

### Issue: "DEFAULT_OWNER_ID not found"
**Solution**: Update the owner ID in the script (Step 3)

### Issue: "Column 'Turf Name' not found"
**Solution**: Check CSV column names match exactly (case-sensitive)

### Issue: "Duplicate key violation"
**Solution**: Some turfs already exist. Either:
- Delete existing turfs, or
- Modify script to use `upsert` instead of `insert`

### Issue: "Price parsing error"
**Solution**: Ensure price columns contain numbers only (no currency symbols)

## 🧪 Testing with Sample Data

Test with a small CSV first:

```csv
Turf Name,Address,Playing hours,Ratings,Phone number,Sports,Price Per Hour
Test Turf 1,123 Test St,Mon-Fri: 9am-9pm,4.5,9876543210,Football,500
Test Turf 2,456 Test Ave,Daily: 6am-10pm,4.2,9876543211,"Football, Cricket",600
```

Run import → Verify in Supabase → Delete test data → Import full dataset

## 📊 Verify Import

After import, check in Supabase:

```sql
-- Count imported turfs
SELECT COUNT(*) FROM turfs;

-- View sample records
SELECT name, address, sports, rating FROM turfs LIMIT 10;

-- Check for missing data
SELECT
  COUNT(*) as total,
  COUNT(description) as with_description,
  COUNT(rating) as with_rating,
  COUNT(lat) as with_coordinates
FROM turfs;
```

## 🔄 Updating Existing Data

If you need to update turfs later, modify the script to use `upsert`:

```javascript
const { data, error } = await supabase
  .from('turfs')
  .upsert(batch, { onConflict: 'name,address' }) // Update if name+address match
  .select();
```

## 💡 Tips

1. **Backup First**: Export existing turfs before import
2. **Test Small**: Import 2-3 records first to verify
3. **Check Images**: Ensure image URLs are publicly accessible
4. **Validate Coordinates**: Check a few turfs on map after import
5. **Review Data**: Have analyst double-check critical fields

## 🆘 Need Help?

If you encounter issues:

1. Check the import summary for error messages
2. Verify CSV format matches expected columns
3. Ensure Supabase credentials are correct
4. Check Supabase logs for detailed error messages

---

Good luck with your import! 🚀
