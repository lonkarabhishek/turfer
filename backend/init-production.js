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

    // Check if we need to seed games data
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