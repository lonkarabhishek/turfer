const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Supabase configuration
const supabaseUrl = 'https://hwfsbpzercuoshodmnuf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo';

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper function to parse price from rate string
function parsePrice(rateString) {
  if (!rateString) return 800; // Default price
  
  const match = rateString.match(/₹(\d+)/);
  return match ? parseInt(match[1]) : 800;
}

// Helper function to parse coordinates from address (basic geocoding simulation)
function getCoordinatesForNashik(address) {
  // Basic coordinate mapping for Nashik areas
  const areaCoordinates = {
    'dwarka': { lat: 20.0176, lng: 73.7810 },
    'govind nagar': { lat: 19.9975, lng: 73.7898 },
    'panchavati': { lat: 20.0176, lng: 73.7810 },
    'gangapur': { lat: 20.0059, lng: 73.7741 },
    'shivaji nagar': { lat: 19.9919, lng: 73.7749 },
    'pathardi': { lat: 20.0209, lng: 73.7749 },
    'savarkar nagar': { lat: 20.0100, lng: 73.7850 },
    'college road': { lat: 20.0059, lng: 73.7741 },
    'mumbai naka': { lat: 19.9919, lng: 73.7749 }
  };

  const lowerAddress = address.toLowerCase();
  
  for (const [area, coords] of Object.entries(areaCoordinates)) {
    if (lowerAddress.includes(area)) {
      return coords;
    }
  }
  
  // Default to central Nashik coordinates
  return { lat: 20.0063, lng: 73.7740 };
}

async function seedTurfs() {
  try {
    console.log('🌱 Starting to seed Nashik turfs data...');
    
    // Read the seed data
    const seedData = JSON.parse(fs.readFileSync('./public/nashik_turfs.seed.json', 'utf8'));
    
    // Get or create owner user
    let ownerId;
    const { data: ownerUsers, error: ownerError } = await supabase
      .from('users')
      .select('id')
      .eq('email', 'owner@tapturf.in')
      .limit(1);
    
    if (ownerError) {
      console.error('Error checking for owner:', ownerError);
      return;
    }
    
    if (ownerUsers && ownerUsers.length > 0) {
      ownerId = ownerUsers[0].id;
      console.log('✅ Found existing owner user:', ownerId);
    } else {
      // Create owner user
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('password123', 12);
      
      const { data: newOwner, error: createError } = await supabase
        .from('users')
        .insert({
          name: 'Nashik Turf Owner',
          email: 'owner@tapturf.in',
          password: hashedPassword,
          role: 'owner',
          is_verified: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (createError) {
        console.error('Error creating owner:', createError);
        return;
      }
      
      ownerId = newOwner.id;
      console.log('✅ Created new owner user:', ownerId);
    }
    
    // Clear existing turfs
    console.log('🧹 Clearing existing turfs...');
    const { error: deleteError } = await supabase
      .from('turfs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (deleteError) {
      console.error('Error clearing turfs:', deleteError);
    } else {
      console.log('✅ Cleared existing turfs');
    }
    
    // Transform and insert turfs
    const turfsToInsert = seedData.map((turf, index) => {
      const coordinates = getCoordinatesForNashik(turf.address);
      const basePrice = parsePrice(turf.rates);
      
      return {
        owner_id: ownerId,
        name: turf.name,
        address: turf.address,
        lat: coordinates.lat,
        lng: coordinates.lng,
        description: `${turf.name} is a premium sports facility in Nashik offering ${turf.sports.join(' and ')} facilities.`,
        sports: turf.sports,
        amenities: turf.amenities || [],
        images: turf.photos || [],
        price_per_hour: basePrice,
        price_per_hour_weekend: Math.round(basePrice * 1.25), // 25% premium for weekends
        operating_hours: {
          monday: turf.operating_hours || "6:00 AM - 10:00 PM",
          tuesday: turf.operating_hours || "6:00 AM - 10:00 PM", 
          wednesday: turf.operating_hours || "6:00 AM - 10:00 PM",
          thursday: turf.operating_hours || "6:00 AM - 10:00 PM",
          friday: turf.operating_hours || "6:00 AM - 10:00 PM",
          saturday: turf.operating_hours || "6:00 AM - 11:00 PM",
          sunday: turf.operating_hours || "6:00 AM - 11:00 PM"
        },
        contact_info: {
          phone: turf.contact.phone,
          email: turf.contact.email,
          booking_urls: turf.booking || [],
          social: turf.social || {}
        },
        rating: Math.round((4.0 + Math.random() * 1.0) * 10) / 10, // Random rating between 4.0-5.0
        total_reviews: Math.floor(Math.random() * 200) + 50, // Random reviews between 50-250
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    });
    
    console.log(`📥 Inserting ${turfsToInsert.length} turfs...`);
    
    // Insert turfs in batches
    const batchSize = 5;
    for (let i = 0; i < turfsToInsert.length; i += batchSize) {
      const batch = turfsToInsert.slice(i, i + batchSize);
      
      const { data, error } = await supabase
        .from('turfs')
        .insert(batch)
        .select();
      
      if (error) {
        console.error(`❌ Error inserting batch ${Math.floor(i/batchSize) + 1}:`, error);
      } else {
        console.log(`✅ Inserted batch ${Math.floor(i/batchSize) + 1} (${batch.length} turfs)`);
      }
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Verify insertion
    const { data: allTurfs, error: countError } = await supabase
      .from('turfs')
      .select('name, sports, price_per_hour, rating', { count: 'exact' });
    
    if (countError) {
      console.error('Error counting turfs:', countError);
    } else {
      console.log(`\n🎯 Successfully seeded ${allTurfs.length} turfs!`);
      console.log('\n📊 Sample of inserted turfs:');
      allTurfs.slice(0, 5).forEach((turf, i) => {
        console.log(`  ${i + 1}. ${turf.name}`);
        console.log(`     Sports: ${turf.sports.join(', ')}`);
        console.log(`     Price: ₹${turf.price_per_hour}/hr | Rating: ${turf.rating}/5`);
      });
      
      if (allTurfs.length > 5) {
        console.log(`     ... and ${allTurfs.length - 5} more turfs`);
      }
    }
    
    console.log('\n🎉 Database seeding completed successfully!');
    
  } catch (error) {
    console.error('💥 Seeding error:', error);
  }
}

// Run the seeding
seedTurfs();