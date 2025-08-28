const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Load Nashik turfs data
const nashikTurfs = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'nashik_turfs.seed.json'), 'utf8'));

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hwfsbpzercuoshodmnuf.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seedDatabase() {
  try {
    console.log('🌱 Starting Supabase database seeding...');

    // Create demo users first
    const demoUserPassword = await bcrypt.hash('password123', 10);
    const demoOwnerPassword = await bcrypt.hash('password123', 10);

    const demoUserId = uuidv4();
    const demoOwnerId = uuidv4();

    // Insert demo users
    const { error: userError } = await supabase
      .from('users')
      .upsert([
        {
          id: demoUserId,
          email: 'user@turfbooking.com',
          password: demoUserPassword,
          name: 'Demo User',
          phone: '9876543210',
          role: 'user',
          is_verified: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: demoOwnerId,
          email: 'owner@turfbooking.com',
          password: demoOwnerPassword,
          name: 'Demo Owner',
          phone: '9876543211',
          role: 'owner',
          is_verified: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ], { onConflict: 'email' });

    if (userError) {
      console.error('Error creating users:', userError);
      throw userError;
    }

    console.log('👤 Demo users created successfully');

    // Convert Nashik turfs data for Supabase
    const turfsToInsert = nashikTurfs.map(turf => {
      // Parse price from rates string
      let pricePerHour = 600; // default
      let pricePerHourWeekend = 800; // default
      
      if (turf.rates) {
        const priceMatch = turf.rates.match(/₹(\d+(?:,\d+)?)/);
        if (priceMatch) {
          pricePerHour = parseInt(priceMatch[1].replace(',', ''));
          pricePerHourWeekend = Math.round(pricePerHour * 1.3);
        }
      }

      return {
        id: uuidv4(),
        owner_id: demoOwnerId,
        name: turf.name,
        address: turf.address,
        lat: null,
        lng: null,
        description: `${turf.name} offers excellent facilities for sports activities. Located in Nashik with professional quality sports infrastructure.`,
        sports: JSON.stringify(turf.sports || ['Football', 'Cricket']),
        amenities: JSON.stringify(turf.amenities || ['Flood Lights', 'Parking', 'Washrooms']),
        images: JSON.stringify(turf.photos || []),
        price_per_hour: pricePerHour,
        price_per_hour_weekend: pricePerHourWeekend,
        operating_hours: JSON.stringify({
          monday: { open: '06:00', close: '23:00', isOpen: true },
          tuesday: { open: '06:00', close: '23:00', isOpen: true },
          wednesday: { open: '06:00', close: '23:00', isOpen: true },
          thursday: { open: '06:00', close: '23:00', isOpen: true },
          friday: { open: '06:00', close: '23:00', isOpen: true },
          saturday: { open: '06:00', close: '23:00', isOpen: true },
          sunday: { open: '06:00', close: '23:00', isOpen: true }
        }),
        contact_info: JSON.stringify({
          phone: turf.contact?.phone || '+919876543210',
          email: turf.contact?.email || 'contact@turf.com',
          website: turf.booking?.[0] || ''
        }),
        rating: Math.random() * 2 + 3, // Random rating between 3-5
        total_reviews: Math.floor(Math.random() * 200) + 50,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    });

    // Insert turfs
    const { error: turfError } = await supabase
      .from('turfs')
      .upsert(turfsToInsert, { onConflict: 'name' });

    if (turfError) {
      console.error('Error creating turfs:', turfError);
      throw turfError;
    }

    console.log(`🏟️ Successfully seeded ${nashikTurfs.length} Nashik turfs`);
    console.log('\n🔑 Demo login credentials:');
    console.log('Owner: owner@turfbooking.com / password123');
    console.log('User: user@turfbooking.com / password123');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

// Run seeding
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('✅ Seeding completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedDatabase };