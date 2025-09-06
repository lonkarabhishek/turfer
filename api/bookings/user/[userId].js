const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hwfsbpzercuoshodmnuf.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo';

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Extract userId from URL path
    const urlPath = req.url;
    const userIdMatch = urlPath.match(/\/api\/bookings\/user\/([^\/]+)/);
    const userId = userIdMatch ? userIdMatch[1] : null;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID is required' });
    }

    console.log(`Fetching bookings for user: ${userId}`);

    // Fetch user bookings from Supabase
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        *,
        turfs (
          id,
          name,
          address,
          images
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching bookings:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`Found ${bookings?.length || 0} bookings for user ${userId}`);

    return res.status(200).json({
      success: true,
      data: bookings || []
    });

  } catch (error) {
    console.error('Unexpected error in bookings API:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};