const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

// Open database
const db = new sqlite3.Database('./database.sqlite');

// Create multiple test games
const games = [
  {
    id: uuidv4(),
    host_id: 'e08186f6-61db-4ae6-a817-9b48b1697830',
    turf_id: 'bdda5b32-85f0-424e-be82-586d9d81b775', // Different turf
    date: '2025-08-24',
    start_time: '19:00',
    end_time: '20:00',
    sport: 'Cricket',
    format: 'Box Cricket',
    skill_level: 'beginner',
    current_players: 3,
    max_players: 12,
    cost_per_person: 80,
    description: 'Friendly cricket match for beginners',
    notes: 'Bring cricket gear',
    is_private: 0,
    join_requests: JSON.stringify([]),
    confirmed_players: JSON.stringify([]),
    status: 'open',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: uuidv4(),
    host_id: 'e08186f6-61db-4ae6-a817-9b48b1697830',
    turf_id: '68464699-5854-47e7-961d-efa28663a8f8', // Another turf
    date: '2025-08-25',
    start_time: '17:00',
    end_time: '18:00',
    sport: 'Football',
    format: '5v5',
    skill_level: 'advanced',
    current_players: 8,
    max_players: 10,
    cost_per_person: 150,
    description: 'Competitive 5v5 match',
    notes: 'Advanced players only - fast-paced game',
    is_private: 0,
    join_requests: JSON.stringify([]),
    confirmed_players: JSON.stringify([]),
    status: 'open',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

const sql = `
  INSERT INTO games (
    id, host_id, turf_id, date, start_time, end_time, 
    sport, format, skill_level, current_players, max_players, 
    cost_per_person, description, notes, is_private, 
    join_requests, confirmed_players, status, created_at, updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

let completed = 0;
games.forEach((gameData) => {
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
    
    completed++;
    if (completed === games.length) {
      db.close();
    }
  });
});