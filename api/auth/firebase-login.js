const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const admin = require('./firebase-admin');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hwfsbpzercuoshodmnuf.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo'
);

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

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
    const { firebaseIdToken } = req.body;

    if (!firebaseIdToken) {
      return res.status(400).json({
        success: false,
        error: 'Firebase ID token is required'
      });
    }

    // Verify Firebase token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(firebaseIdToken);
      console.log('✅ Firebase token verified:', decodedToken);
    } catch (error) {
      console.error('❌ Firebase token verification failed:', error);
      return res.status(401).json({
        success: false,
        error: 'Invalid Firebase token'
      });
    }

    const phoneNumber = decodedToken.phone_number;
    const firebaseUid = decodedToken.uid;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Phone number not found in Firebase token'
      });
    }

    // Find user in Supabase by phone number
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('phone', phoneNumber)
      .limit(1);

    if (fetchError) {
      console.error('Supabase fetch error:', fetchError);
      return res.status(500).json({
        success: false,
        error: 'Database error during login'
      });
    }

    if (!users || users.length === 0) {
      // User doesn't exist - they need to sign up
      return res.status(404).json({
        success: false,
        error: 'User not found. Please sign up first.',
        requiresSignup: true
      });
    }

    const user = users[0];

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Return user data and token
    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      isVerified: user.is_verified,
      profile_image_url: user.profile_image_url,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    };

    res.status(200).json({
      success: true,
      data: {
        user: userData,
        token: token
      }
    });

  } catch (error) {
    console.error('Firebase login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};
