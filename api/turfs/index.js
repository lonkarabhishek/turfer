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

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET.'
    });
  }

  try {
    // Get query parameters
    const {
      query,
      sport,
      priceMin,
      priceMax,
      rating,
      page = 1,
      limit = 20
    } = req.query;

    // Build Supabase query  
    let supabaseQuery = supabase
      .from('turfs')
      .select('*')
      .eq('is_active', true);

    // Apply filters
    if (query) {
      supabaseQuery = supabaseQuery.or(
        `name.ilike.%${query}%,address.ilike.%${query}%,description.ilike.%${query}%`
      );
    }

    if (sport) {
      supabaseQuery = supabaseQuery.contains('sports', [sport]);
    }

    if (priceMin) {
      supabaseQuery = supabaseQuery.gte('price_per_hour', parseFloat(priceMin));
    }

    if (priceMax) {
      supabaseQuery = supabaseQuery.lte('price_per_hour', parseFloat(priceMax));
    }

    if (rating) {
      supabaseQuery = supabaseQuery.gte('rating', parseFloat(rating));
    }

    // Get total count
    const { count, error: countError } = await supabase
      .from('turfs')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    if (countError) {
      console.error('Count error:', countError);
    }

    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    supabaseQuery = supabaseQuery
      .order('rating', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    // Execute query
    const { data: turfs, error } = await supabaseQuery;

    if (error) {
      console.error('Supabase query error:', error);
      return res.status(500).json({
        success: false,
        error: 'Database error while fetching turfs'
      });
    }

    // Calculate pagination info
    const total = count || 0;
    const totalPages = Math.ceil(total / parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        turfs: turfs || [],
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages
      }
    });

  } catch (error) {
    console.error('Turfs API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};