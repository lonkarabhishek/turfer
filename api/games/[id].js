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
      const { id } = req.query;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Game ID is required'
        });
      }

      // Get game from Supabase with turf and host information
      const { data: game, error } = await supabase
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
            phone,
            email
          )
        `)
        .eq('id', id)
        .single();

      if (error) {
        console.error('Supabase game fetch error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch game: ' + error.message
        });
      }

      if (!game) {
        return res.status(404).json({
          success: false,
          error: 'Game not found'
        });
      }

      // Transform to frontend format
      const transformedGame = {
        id: game.id,
        hostId: game.host_id,
        hostName: game.users?.name || 'Unknown Host',
        hostPhone: game.users?.phone || '0000000000',
        hostEmail: game.users?.email || '',
        turfId: game.turf_id,
        turfName: game.turfs?.name || 'Unknown Turf',
        turfAddress: game.turfs?.address || 'Unknown Address',
        date: game.date,
        startTime: game.start_time,
        endTime: game.end_time,
        timeSlot: `${game.start_time}-${game.end_time}`,
        sport: game.sport,
        format: game.format,
        skillLevel: game.skill_level,
        currentPlayers: game.current_players,
        maxPlayers: game.max_players,
        costPerPerson: game.cost_per_person,
        description: game.description,
        notes: game.notes,
        isPrivate: game.is_private,
        status: game.status,
        createdAt: game.created_at,
        updatedAt: game.updated_at
      };

      res.status(200).json({
        success: true,
        data: transformedGame
      });

    } catch (error) {
      console.error('Game fetch error:', error);
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