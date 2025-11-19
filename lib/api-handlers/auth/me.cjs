const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hwfsbpzercuoshodmnuf.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo'
);

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

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
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No authorization token provided'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    // Get user from database
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .limit(1);

    if (fetchError) {
      console.error('Supabase fetch error:', fetchError);
      return res.status(500).json({
        success: false,
        error: 'Database error while fetching user'
      });
    }

    if (!users || users.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = users[0];

    // Return user data (excluding password)
    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      isVerified: user.is_verified,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    };

    res.status(200).json({
      success: true,
      data: userData
    });

  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};