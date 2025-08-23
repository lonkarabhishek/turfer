const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

// Open database
const db = new sqlite3.Database('./database.sqlite');

// Create a test game
const gameData = {
  id: uuidv4(),
  host_id: 'e08186f6-61db-4ae6-a817-9b48b1697830',
  turf_id: 'f1b3d424-0973-4ec4-8f0b-13ebb0e6b80b',
  date: '2025-08-23',
  start_time: '18:00',
  end_time: '19:00',
  sport: 'Football',
  format: '7v7',
  skill_level: 'intermediate',
  current_players: 1,
  max_players: 14,
  cost_per_person: 100,
  description: 'Looking for players for evening football',
  notes: 'Bring your own water bottle',
  is_private: 0,
  join_requests: JSON.stringify([]),
  confirmed_players: JSON.stringify([]),
  status: 'open',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

const sql = `
  INSERT INTO games (
    id, host_id, turf_id, date, start_time, end_time, 
    sport, format, skill_level, current_players, max_players, 
    cost_per_person, description, notes, is_private, 
    join_requests, confirmed_players, status, created_at, updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

db.run(sql, [
  gameData.id,
  gameData.host_id,
  gameData.turf_id,
  gameData.date,
  gameData.start_time,
  gameData.end_time,
  gameData.sport,
  gameData.format,
  gameData.skill_level,
  gameData.current_players,
  gameData.max_players,
  gameData.cost_per_person,
  gameData.description,
  gameData.notes,
  gameData.is_private,
  gameData.join_requests,
  gameData.confirmed_players,
  gameData.status,
  gameData.created_at,
  gameData.updated_at
], function(err) {
  if (err) {
    console.error('Error creating game:', err);
  } else {
    console.log('Game created successfully with ID:', gameData.id);
  }
  db.close();
});