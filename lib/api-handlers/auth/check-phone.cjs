const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hwfsbpzercuoshodmnuf.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo'
);

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }

  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    // Normalize phone number to +91 format
    const normalizedPhone = phone.startsWith('+') ? phone : `+91${phone}`;

    // Check if user exists and has PIN set
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('id, pin')
      .eq('phone', normalizedPhone)
      .limit(1);

    if (fetchError) {
      console.error('Supabase fetch error:', fetchError);
      return res.status(500).json({
        success: false,
        error: 'Database error'
      });
    }

    if (!users || users.length === 0) {
      // User doesn't exist
      return res.status(200).json({
        success: true,
        data: {
          exists: false,
          hasPin: false
        }
      });
    }

    const user = users[0];

    // User exists - check if they have a PIN set
    return res.status(200).json({
      success: true,
      data: {
        exists: true,
        hasPin: !!user.pin
      }
    });

  } catch (error) {
    console.error('Check phone error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};
