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
      // Get available games
      const { data: games, error } = await supabase
        .from('games')
        .select(`
          *,
          turf:turfs(*),
          creator:users(id, name, email)
        `)
        .eq('isActive', true)
        .order('createdAt', { ascending: false });

      if (error) {
        console.error('Games fetch error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch games'
        });
      }

      res.status(200).json({
        success: true,
        data: games || []
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
      // Create new game - would need auth middleware in real app
      const gameData = req.body;
      
      const { data: newGame, error } = await supabase
        .from('games')
        .insert([{
          ...gameData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) {
        console.error('Game creation error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to create game'
        });
      }

      res.status(201).json({
        success: true,
        data: newGame
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