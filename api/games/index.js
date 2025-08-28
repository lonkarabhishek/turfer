const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hwfsbpzercuoshodmnuf.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo'
);

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      // For now, return sample games data until games table is set up
      const sampleGames = [
        {
          id: "sample-game-1",
          creator_id: "sample-user-1", 
          turf_id: "sample-turf-1",
          title: "Evening Football Match",
          description: "Looking for players for a friendly football match",
          sport: "Football",
          skill_level: "intermediate",
          max_players: 14,
          current_players: 8,
          date: new Date(Date.now() + 24*60*60*1000).toISOString().split('T')[0], // Tomorrow
          start_time: "18:00",
          end_time: "19:00", 
          price_per_player: 100,
          game_type: "casual",
          status: "open",
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          host_name: "Sample Host",
          turf_name: "Sample Turf",
          turf_address: "Sample Address"
        }
      ];

      res.status(200).json({
        success: true,
        data: sampleGames
      });

    } catch (error) {
      console.error('Games API error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  } else if (req.method === 'POST') {
    try {
      // For now, just return success response for game creation
      const gameData = req.body;
      
      const mockNewGame = {
        id: "new-game-" + Date.now(),
        ...gameData,
        status: "open",
        current_players: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      res.status(201).json({
        success: true,
        data: mockNewGame
      });

    } catch (error) {
      console.error('Game creation error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  } else {
    res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }
};