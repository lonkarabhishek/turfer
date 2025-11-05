import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const supabaseUrl = 'https://hwfsbpzercuoshodmnuf.supabase.co';
const supabaseServiceKey = 'YOUR_SERVICE_ROLE_KEY'; // You need to get this from Supabase dashboard

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Function to download image from Google Drive and upload to Supabase
async function migrateImageToSupabase(driveUrl, turfName, imageIndex) {
  try {
    // Extract file ID
    const match = driveUrl.match(/[?&]id=([^&]+)/);
    if (!match) {
      console.error('Could not extract file ID from:', driveUrl);
      return null;
    }

    const fileId = match[1];
    const thumbnailUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`;

    console.log(`Downloading image ${imageIndex} for ${turfName}...`);

    // Download image from Google Drive
    const response = await fetch(thumbnailUrl);
    if (!response.ok) {
      console.error(`Failed to download: ${thumbnailUrl}`);
      return null;
    }

    const imageBuffer = await response.buffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const extension = contentType.split('/')[1] || 'jpg';

    // Generate filename
    const filename = `${turfName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${imageIndex}.${extension}`;
    const filepath = `turf-images/${filename}`;

    console.log(`Uploading to Supabase: ${filepath}...`);

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('turf-images') // You need to create this bucket in Supabase
      .upload(filepath, imageBuffer, {
        contentType: contentType,
        upsert: true
      });

    if (error) {
      console.error(`Upload failed:`, error);
      return null;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('turf-images')
      .getPublicUrl(filepath);

    console.log(`✅ Uploaded: ${publicUrl}`);
    return publicUrl;

  } catch (error) {
    console.error('Error migrating image:', error);
    return null;
  }
}

// Example usage
async function migrateTurfImages() {
  const turfImages = {
    "BIRLA TURF": [
      "https://drive.google.com/open?id=1JneTB1HMlcx5Ljls0e8QUdcGC-pH85t6",
      "https://drive.google.com/open?id=17cQj4OAglrm5EljJbmtkdXP8BnYc6cyx",
      "https://drive.google.com/open?id=11UyTi0mvfL7eANBK3LI-vmz3Y_MRUOaf",
      "https://drive.google.com/open?id=1_EeoWbJxpU1OjzhVaDH56OfTZjPDucAv",
      "https://drive.google.com/open?id=1zhJqv3BJnf6CS1Ig9xCz2WMZKf9O9DAm"
    ]
  };

  for (const [turfName, imageUrls] of Object.entries(turfImages)) {
    console.log(`\n🏟️ Processing ${turfName}...`);
    const newUrls = [];

    for (let i = 0; i < imageUrls.length; i++) {
      const newUrl = await migrateImageToSupabase(imageUrls[i], turfName, i + 1);
      if (newUrl) {
        newUrls.push(newUrl);
      }
    }

    console.log(`\n✅ New URLs for ${turfName}:`);
    console.log(JSON.stringify(newUrls, null, 2));
  }
}

migrateTurfImages();
