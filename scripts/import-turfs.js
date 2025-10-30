/**
 * Bulk Turf Data Import Script
 *
 * Usage:
 *   1. Save your analyst's data as 'turfs-data.csv' in the scripts folder
 *   2. Set your Supabase credentials in .env
 *   3. Run: node scripts/import-turfs.js
 *
 * CSV Format Expected:
 * Turf Name, Address, Playing hours, Google Maps Embed Html Link, Description,
 * Ratings, No. of reviews, Link to reviews, Phone number, Email, Sports,
 * Amenities, Website, Image 1, Image 2, Image 3, Image 4, Image 5, Concat Image
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hwfsbpzercuoshodmnuf.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo';

const supabase = createClient(supabaseUrl, supabaseKey);

// Default owner ID - UPDATE THIS with your admin user ID
const DEFAULT_OWNER_ID = '00000000-0000-0000-0000-000000000000'; // TODO: Replace with actual admin user ID

/**
 * Parse playing hours string into JSON format
 * Examples:
 *   "Mon-Fri: 6am-10pm, Sat-Sun: 5am-11pm"
 *   -> {"weekdays": "6am-10pm", "weekends": "5am-11pm"}
 */
function parseOperatingHours(hoursString) {
  if (!hoursString) return { "default": "9am-9pm" };

  try {
    const hours = {};
    const parts = hoursString.split(',').map(s => s.trim());

    parts.forEach(part => {
      if (part.includes('Mon-Fri') || part.includes('Weekday')) {
        const time = part.split(':')[1]?.trim();
        if (time) hours.weekdays = time;
      } else if (part.includes('Sat-Sun') || part.includes('Weekend')) {
        const time = part.split(':')[1]?.trim();
        if (time) hours.weekends = time;
      } else {
        // Try to extract time pattern like "6am-10pm"
        const timeMatch = part.match(/(\d+(?:am|pm)-\d+(?:am|pm))/i);
        if (timeMatch) {
          hours.default = timeMatch[1];
        }
      }
    });

    return Object.keys(hours).length > 0 ? hours : { "default": hoursString };
  } catch (error) {
    console.warn('Error parsing operating hours:', hoursString, error);
    return { "default": hoursString };
  }
}

/**
 * Parse comma-separated sports into array
 * Example: "Football, Cricket, Tennis" -> ["Football", "Cricket", "Tennis"]
 */
function parseSports(sportsString) {
  if (!sportsString) return [];
  return sportsString.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Parse comma-separated amenities into array
 */
function parseAmenities(amenitiesString) {
  if (!amenitiesString) return [];
  return amenitiesString.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Parse images into array
 */
function parseImages(img1, img2, img3, img4, img5) {
  return [img1, img2, img3, img4, img5].filter(Boolean);
}

/**
 * Extract lat/lng from Google Maps embed link
 * Example: <iframe src="https://maps.google.com/...?q=19.1234,72.5678&...">
 */
function extractCoordinates(embedLink) {
  if (!embedLink) return { lat: null, lng: null };

  try {
    // Try to find coordinates in various formats
    const patterns = [
      /q=([-\d.]+),([-\d.]+)/,  // ?q=lat,lng
      /@([-\d.]+),([-\d.]+)/,   // @lat,lng
      /ll=([-\d.]+),([-\d.]+)/,  // ll=lat,lng
    ];

    for (const pattern of patterns) {
      const match = embedLink.match(pattern);
      if (match) {
        return {
          lat: parseFloat(match[1]),
          lng: parseFloat(match[2])
        };
      }
    }
  } catch (error) {
    console.warn('Error extracting coordinates:', error);
  }

  return { lat: null, lng: null };
}

/**
 * Transform CSV row to database record
 */
function transformRow(row, ownerId) {
  const coords = extractCoordinates(row['Google Maps Embed Html Link']);

  return {
    owner_id: ownerId,
    name: row['Turf Name']?.trim() || 'Unnamed Turf',
    address: row['Address']?.trim() || 'Address not provided',
    lat: coords.lat,
    lng: coords.lng,
    description: row['Description']?.trim() || null,
    sports: parseSports(row['Sports']),
    amenities: parseAmenities(row['Amenities']),
    images: parseImages(
      row['Image 1'],
      row['Image 2'],
      row['Image 3'],
      row['Image 4'],
      row['Image 5']
    ),
    price_per_hour: parseFloat(row['Price Per Hour']) || 500, // Default price if missing
    price_per_hour_weekend: parseFloat(row['Weekend Price']) || null,
    operating_hours: parseOperatingHours(row['Playing hours']),
    contact_info: {
      phone: row['Phone number']?.trim() || null,
      email: row['Email']?.trim() || null,
      website: row['Website']?.trim() || null
    },
    'Gmap Embed link': row['Google Maps Embed Html Link']?.trim() || null,
    rating: parseFloat(row['Ratings']) || 0,
    total_reviews: parseInt(row['No. of reviews']) || 0,
    external_review_url: row['Link to reviews']?.trim() || null,
    cover_image: row['Concat Image']?.trim() || null,
    is_active: true
  };
}

/**
 * Import turfs from CSV file
 */
async function importTurfs(csvFilePath, ownerId = DEFAULT_OWNER_ID) {
  try {
    console.log('🚀 Starting turf import...\n');

    // Read CSV file
    const csvContent = fs.readFileSync(csvFilePath, 'utf-8');
    console.log('✅ CSV file loaded');

    // Parse CSV
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    console.log(`✅ Parsed ${records.length} records\n`);

    // Transform records
    const turfs = records.map(record => transformRow(record, ownerId));
    console.log('✅ Data transformed\n');

    // Preview first record
    console.log('📋 Preview of first record:');
    console.log(JSON.stringify(turfs[0], null, 2));
    console.log('\n');

    // Confirm import
    console.log(`⚠️  About to import ${turfs.length} turfs to database`);
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Batch insert (Supabase handles up to 1000 records at once)
    const batchSize = 100;
    let imported = 0;
    let errors = [];

    for (let i = 0; i < turfs.length; i += batchSize) {
      const batch = turfs.slice(i, i + batchSize);
      console.log(`📤 Uploading batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(turfs.length / batchSize)} (${batch.length} records)...`);

      const { data, error } = await supabase
        .from('turfs')
        .insert(batch)
        .select();

      if (error) {
        console.error(`❌ Error in batch ${Math.floor(i / batchSize) + 1}:`, error.message);
        errors.push({ batch: Math.floor(i / batchSize) + 1, error: error.message });
      } else {
        imported += batch.length;
        console.log(`✅ Batch ${Math.floor(i / batchSize) + 1} complete (${data.length} records)\n`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Import Summary:');
    console.log('='.repeat(50));
    console.log(`Total records in CSV: ${records.length}`);
    console.log(`Successfully imported: ${imported}`);
    console.log(`Errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      errors.forEach(err => {
        console.log(`  Batch ${err.batch}: ${err.error}`);
      });
    }

    console.log('\n✅ Import complete!');

  } catch (error) {
    console.error('\n❌ Fatal error during import:', error);
    throw error;
  }
}

// Main execution
const csvPath = process.argv[2] || path.join(process.cwd(), 'scripts', 'turfs-data.csv');
const ownerId = process.argv[3] || DEFAULT_OWNER_ID;

console.log('📁 CSV file:', csvPath);
console.log('👤 Owner ID:', ownerId);
console.log('\n');

importTurfs(csvPath, ownerId)
  .then(() => {
    console.log('\n🎉 All done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Import failed:', error);
    process.exit(1);
  });
