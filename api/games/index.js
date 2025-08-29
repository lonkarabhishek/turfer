const { createClient } = require('@supabase/supabase-js');

// Use service key for server-side operations to bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hwfsbpzercuoshodmnuf.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo'
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
      // Get games from Supabase with turf and host information
      const { data: games, error } = await supabase
        .from('games')
        .select(`
          *,
          turfs:turf_id (
            id,
            name,
            address
          ),
          users:host_id (
            id,
            name,
            phone
          )
        `)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Supabase games fetch error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch games: ' + error.message
        });
      }

      // Transform to frontend format
      const transformedGames = (games || []).map(game => ({
        id: game.id,
        hostId: game.host_id,
        turfId: game.turf_id,
        date: game.date,
        startTime: game.start_time,
        endTime: game.end_time,
        sport: game.sport,
        format: game.format,
        skillLevel: game.skill_level,
        currentPlayers: game.current_players,
        maxPlayers: game.max_players,
        costPerPerson: game.cost_per_person,
        description: game.description,
        notes: game.notes,
        isPrivate: game.is_private,
        joinRequests: [],
        confirmedPlayers: [],
        status: game.status,
        createdAt: game.created_at,
        updatedAt: game.updated_at,
        // Add turf and host info
        turf_name: game.turfs?.name || 'Unknown Turf',
        turf_address: game.turfs?.address || 'Unknown Address',
        host_name: game.users?.name || 'Unknown Host',
        host_phone: game.users?.phone || '0000000000'
      }));

      res.status(200).json({
        success: true,
        data: transformedGames
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
      // Get authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Authorization token required'
        });
      }

      const token = authHeader.substring(7);
      
      // Decode the JWT to get user info and validate
      let userId;
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        console.log('Full JWT payload:', JSON.stringify(payload, null, 2)); // Detailed debug log
        
        // Try all possible user ID fields - prioritize userId (your app's format)
        userId = payload.userId ||  // Your app uses this field
                 payload.id || 
                 payload.user_id || 
                 payload.sub || 
                 payload.uid || 
                 payload.user?.id ||
                 payload.data?.user?.id;
        
        if (!userId) {
          console.error('No user ID found in token payload. Available fields:', Object.keys(payload));
          return res.status(401).json({
            success: false,
            error: 'Invalid token: no user ID found',
            debug: {
              availableFields: Object.keys(payload),
              payload: payload // Temporary debug info
            }
          });
        }
        
        console.log('Extracted user ID:', userId);
      } catch (e) {
        console.error('JWT decode error:', e);
        return res.status(401).json({
          success: false,
          error: 'Invalid token format: ' + e.message
        });
      }

      // Verify the user exists in Supabase users table
      const { data: userProfile, error: userError } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('id', userId)
        .single();
        
      if (userError || !userProfile) {
        console.error('User not found in users table:', userId, userError);
        return res.status(400).json({
          success: false,
          error: 'User not found in database. Please ensure you are properly registered.'
        });
      }
      
      console.log('User found:', userProfile.name);

      const gameData = req.body;
      
      // Log the data being inserted for debugging
      const insertData = {
        host_id: userId,
        turf_id: gameData.turfId,
        date: gameData.date,
        start_time: gameData.startTime,
        end_time: gameData.endTime,
        sport: gameData.sport,
        format: gameData.format,
        skill_level: gameData.skillLevel,
        max_players: gameData.maxPlayers,
        current_players: 1,
        cost_per_person: gameData.costPerPerson,
        description: gameData.description,
        notes: gameData.notes,
        is_private: gameData.isPrivate || false,
        status: 'open'
      };
      
      console.log('Attempting to insert game data:', insertData);
      
      // Create game in Supabase
      const { data: newGame, error } = await supabase
        .from('games')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Supabase game creation error:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        return res.status(500).json({
          success: false,
          error: 'Failed to create game: ' + (error.message || error.details || 'Unknown error'),
          details: error.details || error.hint || null
        });
      }
      
      console.log('Game created successfully:', newGame);

      // Transform to frontend format
      const transformedGame = {
        id: newGame.id,
        hostId: newGame.host_id,
        turfId: newGame.turf_id,
        date: newGame.date,
        startTime: newGame.start_time,
        endTime: newGame.end_time,
        sport: newGame.sport,
        format: newGame.format,
        skillLevel: newGame.skill_level,
        currentPlayers: newGame.current_players,
        maxPlayers: newGame.max_players,
        costPerPerson: newGame.cost_per_person,
        description: newGame.description,
        notes: newGame.notes,
        isPrivate: newGame.is_private,
        joinRequests: [],
        confirmedPlayers: [],
        status: newGame.status,
        createdAt: newGame.created_at,
        updatedAt: newGame.updated_at
      };

      res.status(201).json({
        success: true,
        data: transformedGame,
        message: 'Game created successfully'
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