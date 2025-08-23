const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function initializeProductionDB() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL database');

    // Read and execute PostgreSQL schema
    const schemaSQL = fs.readFileSync(path.join(__dirname, 'src/database/schema-postgres.sql'), 'utf8');
    await client.query(schemaSQL);
    console.log('✅ Database schema initialized');

    // Check if we need to seed sample data
    const usersResult = await client.query('SELECT COUNT(*) FROM users');
    const usersCount = parseInt(usersResult.rows[0].count);
    
    if (usersCount === 0) {
      console.log('No users found, creating sample users...');
      
      // Create sample users
      await client.query(`
        INSERT INTO users (id, email, password, name, phone, role, is_verified)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, ['user-1', 'user@example.com', 'hashed_password', 'John Doe', '9876543210', 'user', true]);
      
      console.log('✅ Created sample users');
    }
    
    const turfsResult = await client.query('SELECT COUNT(*) FROM turfs');
    const turfsCount = parseInt(turfsResult.rows[0].count);
    
    if (turfsCount === 0) {
      console.log('No turfs found, creating sample turfs...');
      
      // Create sample turfs
      const sampleTurfs = [
        {
          id: 'turf-1',
          owner_id: 'user-1',
          name: 'Elite Sports Arena',
          address: 'Koramangala, Bangalore',
          lat: 12.9352,
          lng: 77.6245,
          description: 'Premium football turf with floodlights',
          sports: '["Football", "Cricket"]',
          amenities: '["Parking", "Changing Room", "Water", "First Aid"]',
          images: '[]',
          price_per_hour: 1200,
          price_per_hour_weekend: 1500,
          operating_hours: '{"start": "06:00", "end": "23:00"}',
          contact_info: '{"phone": "9876543210", "whatsapp": "9876543210"}',
          rating: 4.5,
          total_reviews: 25,
          is_active: true
        },
        {
          id: 'turf-2', 
          owner_id: 'user-1',
          name: 'Champions Ground',
          address: 'Indiranagar, Bangalore',
          lat: 12.9719,
          lng: 77.6412,
          description: 'Multi-sport facility with AC changing rooms',
          sports: '["Football", "Cricket", "Badminton"]',
          amenities: '["Parking", "AC Changing Room", "Water", "Snacks"]',
          images: '[]',
          price_per_hour: 1000,
          price_per_hour_weekend: 1300,
          operating_hours: '{"start": "05:30", "end": "23:30"}',
          contact_info: '{"phone": "9876543211", "whatsapp": "9876543211"}',
          rating: 4.2,
          total_reviews: 18,
          is_active: true
        }
      ];
      
      for (const turf of sampleTurfs) {
        await client.query(`
          INSERT INTO turfs (
            id, owner_id, name, address, lat, lng, description, 
            sports, amenities, images, price_per_hour, price_per_hour_weekend,
            operating_hours, contact_info, rating, total_reviews, is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        `, [
          turf.id, turf.owner_id, turf.name, turf.address, turf.lat, turf.lng,
          turf.description, turf.sports, turf.amenities, turf.images,
          turf.price_per_hour, turf.price_per_hour_weekend, turf.operating_hours,
          turf.contact_info, turf.rating, turf.total_reviews, turf.is_active
        ]);
      }
      
      console.log(`✅ Created ${sampleTurfs.length} sample turfs`);
    }
    
    const gamesResult = await client.query('SELECT COUNT(*) FROM games');
    const gamesCount = parseInt(gamesResult.rows[0].count);
    
    if (gamesCount === 0) {
      console.log('No games found, creating sample games...');
      
      // Get a user and turf for sample data
      const userResult = await client.query('SELECT id FROM users LIMIT 1');
      const turfResult = await client.query('SELECT id FROM turfs LIMIT 3');
      
      if (userResult.rows.length > 0 && turfResult.rows.length > 0) {
        const userId = userResult.rows[0].id;
        const turfs = turfResult.rows;
        
        // Create sample games
        const sampleGames = [
          {
            id: 'sample-game-1',
            host_id: userId,
            turf_id: turfs[0].id,
            date: '2025-08-24',
            start_time: '18:00',
            end_time: '19:00',
            sport: 'Football',
            format: '7v7',
            skill_level: 'intermediate',
            current_players: 1,
            max_players: 14,
            cost_per_person: 100,
            description: 'Evening football match',
            notes: 'Bring your own water bottle',
            is_private: false,
            join_requests: '[]',
            confirmed_players: '[]',
            status: 'open'
          },
          {
            id: 'sample-game-2',
            host_id: userId,
            turf_id: turfs[1].id,
            date: '2025-08-25',
            start_time: '19:00',
            end_time: '20:00',
            sport: 'Cricket',
            format: 'Box Cricket',
            skill_level: 'beginner',
            current_players: 3,
            max_players: 12,
            cost_per_person: 80,
            description: 'Friendly cricket match',
            notes: 'Bring cricket gear',
            is_private: false,
            join_requests: '[]',
            confirmed_players: '[]',
            status: 'open'
          }
        ];
        
        for (const game of sampleGames) {
          await client.query(`
            INSERT INTO games (
              id, host_id, turf_id, date, start_time, end_time, 
              sport, format, skill_level, current_players, max_players, 
              cost_per_person, description, notes, is_private, 
              join_requests, confirmed_players, status, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
          `, [
            game.id, game.host_id, game.turf_id, game.date, game.start_time, game.end_time,
            game.sport, game.format, game.skill_level, game.current_players, game.max_players,
            game.cost_per_person, game.description, game.notes, game.is_private,
            game.join_requests, game.confirmed_players, game.status
          ]);
        }
        
        console.log(`✅ Created ${sampleGames.length} sample games`);
      } else {
        console.log('⚠️ No users or turfs found, skipping game creation');
      }
    } else {
      console.log(`✅ Found ${gamesCount} existing games`);
    }

  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  initializeProductionDB()
    .then(() => {
      console.log('🎉 Production database initialized successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Failed to initialize production database:', error);
      process.exit(1);
    });
}

module.exports = { initializeProductionDB };