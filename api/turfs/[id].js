const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hwfsbpzercuoshodmnuf.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo'
);

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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
    // Get turf ID from URL parameter
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Turf ID is required'
      });
    }

    // Get turf by ID
    const { data: turf, error } = await supabase
      .from('turfs')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error) {
      console.error('Supabase query error:', error);
      return res.status(500).json({
        success: false,
        error: 'Database error while fetching turf'
      });
    }

    if (!turf) {
      return res.status(404).json({
        success: false,
        error: 'Turf not found'
      });
    }

    // Transform turf data to match frontend expectations
    const transformedTurf = {
      id: turf.id,
      ownerId: turf.owner_id,
      name: turf.name,
      address: turf.address,
      coordinates: turf.lat && turf.lng ? {
        lat: turf.lat,
        lng: turf.lng
      } : null,
      description: turf.description,
      sports: turf.sports,
      amenities: turf.amenities,
      images: turf.images,
      pricePerHour: turf.price_per_hour,
      pricePerHourWeekend: turf.price_per_hour_weekend,
      operatingHours: turf.operating_hours,
      contactInfo: turf.contact_info,
      rating: turf.rating,
      totalReviews: turf.total_reviews,
      isActive: turf.is_active,
      createdAt: turf.created_at,
      updatedAt: turf.updated_at
    };

    res.status(200).json({
      success: true,
      data: transformedTurf
    });

  } catch (error) {
    console.error('Turf detail API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};