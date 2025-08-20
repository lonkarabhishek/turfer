import { UserModel } from '../models/User';
import { TurfModel } from '../models/Turf';
import { readFileSync } from 'fs';
import path from 'path';

const userModel = new UserModel();
const turfModel = new TurfModel();

export async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...');

    // Check if data already exists
    const existingTurfs = await turfModel.search({ page: 1, limit: 1 });
    if (existingTurfs.turfs.length > 0) {
      console.log('📊 Database already has data, skipping seeding');
      return;
    }

    // Create sample owner user
    const sampleOwner = await userModel.create({
      name: 'Sample Owner',
      email: 'owner@turfbooking.com',
      password: 'password123',
      phone: '+919876543210',
      role: 'owner',
      isVerified: true
    });

    // Create sample user
    const sampleUser = await userModel.create({
      name: 'John Doe',
      email: 'user@turfbooking.com',
      password: 'password123',
      phone: '+919876543211',
      role: 'user',
      isVerified: true
    });

    console.log('👤 Sample users created');

    // Try to read and parse the Nashik turfs data
    try {
      const nashikDataPath = path.join(process.cwd(), 'public', 'nashik_turfs.seed.json');
      const nashikDataRaw = readFileSync(nashikDataPath, 'utf8');
      const nashikData = JSON.parse(nashikDataRaw);

      // Convert to our database format
      for (const turf of nashikData.slice(0, 5)) { // Limit to first 5 for demo
        await turfModel.create({
          ownerId: sampleOwner.id,
          name: turf.name || 'Sample Turf',
          address: turf.address || 'Sample Address, Nashik',
          coordinates: undefined, // Would need geocoding
          description: `${turf.name} offers excellent facilities for sports activities.`,
          sports: turf.sports || ['Football', 'Cricket'],
          amenities: turf.amenities || ['Flood Lights', 'Parking', 'Washrooms'],
          images: turf.photos || [],
          pricePerHour: 600,
          pricePerHourWeekend: 800,
          operatingHours: {
            monday: { open: '06:00', close: '23:00', isOpen: true },
            tuesday: { open: '06:00', close: '23:00', isOpen: true },
            wednesday: { open: '06:00', close: '23:00', isOpen: true },
            thursday: { open: '06:00', close: '23:00', isOpen: true },
            friday: { open: '06:00', close: '23:00', isOpen: true },
            saturday: { open: '06:00', close: '23:00', isOpen: true },
            sunday: { open: '06:00', close: '23:00', isOpen: true }
          },
          contactInfo: {
            phone: turf.contact?.phone || '+919876543210',
            email: turf.contact?.email || 'contact@turf.com',
            website: turf.booking?.[0] || ''
          },
          rating: Math.random() * 2 + 3, // Random rating between 3-5
          totalReviews: Math.floor(Math.random() * 200) + 50,
          isActive: true
        });
      }

      console.log('🏟️ Nashik turfs data seeded');
    } catch (fileError) {
      console.log('📄 Nashik data file not found, creating sample turfs instead');
      
      // Create sample turfs if file doesn't exist
      const sampleTurfs = [
        {
          name: 'Big Bounce Turf',
          address: 'Govind Nagar Link Road, Govind Nagar, Nashik 422009',
          sports: ['Box Cricket', 'Football', 'Cricket', 'Yoga'],
          amenities: ['Artificial Turf', 'Flood lights', 'Parking', 'Washroom']
        },
        {
          name: 'Kridabhumi The Multisports Turf',
          address: 'Tigraniya Road, Dwarka, Nashik 422011',
          sports: ['Box Football', 'Cricket', 'Tennis', 'Basketball', 'Yoga'],
          amenities: ['Artificial Turf', 'Drinking Water', 'First Aid', 'Parking', 'Washroom']
        },
        {
          name: 'Greenfield The Multisports Turf',
          address: 'Near K.K. Wagh Engineering, Gangotri Vihar, Nashik 422003',
          sports: ['Football', 'Cricket', 'Yoga'],
          amenities: ['Drinking Water', 'Parking', 'Washroom']
        }
      ];

      for (const turfData of sampleTurfs) {
        await turfModel.create({
          ownerId: sampleOwner.id,
          name: turfData.name,
          address: turfData.address,
          description: `${turfData.name} offers excellent facilities for various sports activities.`,
          sports: turfData.sports,
          amenities: turfData.amenities,
          images: [],
          pricePerHour: 600 + Math.floor(Math.random() * 200),
          pricePerHourWeekend: 800 + Math.floor(Math.random() * 200),
          operatingHours: {
            monday: { open: '06:00', close: '23:00', isOpen: true },
            tuesday: { open: '06:00', close: '23:00', isOpen: true },
            wednesday: { open: '06:00', close: '23:00', isOpen: true },
            thursday: { open: '06:00', close: '23:00', isOpen: true },
            friday: { open: '06:00', close: '23:00', isOpen: true },
            saturday: { open: '06:00', close: '23:00', isOpen: true },
            sunday: { open: '06:00', close: '23:00', isOpen: true }
          },
          contactInfo: {
            phone: '+919876543210',
            email: 'contact@turf.com'
          },
          rating: Math.random() * 2 + 3,
          totalReviews: Math.floor(Math.random() * 200) + 50,
          isActive: true
        });
      }

      console.log('🏟️ Sample turfs created');
    }

    console.log('✅ Database seeding completed successfully');
    
    // Log sample credentials
    console.log('\n🔑 Sample login credentials:');
    console.log('Owner: owner@turfbooking.com / password123');
    console.log('User: user@turfbooking.com / password123');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}