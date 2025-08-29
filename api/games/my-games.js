const { createClient } = require('@supabase/supabase-js');

// Use service key for server-side operations to bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hwfsbpzercuoshodmnuf.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo'
);

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
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
      let userId;
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        userId = payload.userId || payload.id || payload.user_id || payload.sub;
        if (!userId) {
          return res.status(401).json({ success: false, error: 'Invalid token' });
        }
      } catch (e) {
        return res.status(401).json({ success: false, error: 'Invalid token format' });
      }
      
      // Get user's created games
      const { data: games, error } = await supabase
        .from('games')
        .select(`
          *,
          turfs:turf_id (
            id,
            name,
            address
          )
        `)
        .eq('host_id', userId)
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error('Supabase my-games fetch error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch games: ' + error.message
        });
      }
      
      // Transform to frontend format
      const transformedGames = (games || []).map(game => ({
        id: game.id,
        date: game.date,
        startTime: game.start_time,
        endTime: game.end_time,
        sport: game.sport,
        format: game.format,
        currentPlayers: game.current_players,
        maxPlayers: game.max_players,
        costPerPerson: game.cost_per_person,
        notes: game.notes,
        turfName: game.turfs?.name || 'Unknown Turf',
        turfAddress: game.turfs?.address || 'Unknown Address',
        status: game.status,
        createdAt: game.created_at
      }));
      
      res.status(200).json({
        success: true,
        data: transformedGames
      });

    } catch (error) {
      console.error('My games API error:', error);
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