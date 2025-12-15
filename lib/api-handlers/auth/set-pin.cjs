const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const admin = require('../../../api/auth/firebase-admin.js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hwfsbpzercuoshodmnuf.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo'
);

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

// PIN validation function
const validatePin = (pin) => {
  // Must be exactly 4 digits
  if (!/^\d{4}$/.test(pin)) {
    return { valid: false, error: 'PIN must be exactly 4 digits' };
  }

  // Cannot be all same digits (1111, 2222, etc.)
  if (/^(\d)\1{3}$/.test(pin)) {
    return { valid: false, error: 'PIN cannot be all same digits' };
  }

  // Cannot be simple sequences
  const sequences = ['0123', '1234', '2345', '3456', '4567', '5678', '6789', '9876', '8765', '7654', '6543', '5432', '4321', '3210'];
  if (sequences.includes(pin)) {
    return { valid: false, error: 'PIN cannot be a simple sequence' };
  }

  return { valid: true };
};

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
    const { firebaseIdToken, pin } = req.body;

    if (!firebaseIdToken) {
      return res.status(400).json({
        success: false,
        error: 'Firebase ID token is required'
      });
    }

    if (!pin) {
      return res.status(400).json({
        success: false,
        error: 'PIN is required'
      });
    }

    // Validate PIN
    const pinValidation = validatePin(pin);
    if (!pinValidation.valid) {
      return res.status(400).json({
        success: false,
        error: pinValidation.error
      });
    }

    // Verify Firebase token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(firebaseIdToken);
    } catch (error) {
      console.error('Firebase token verification failed:', error);
      return res.status(401).json({
        success: false,
        error: 'Invalid Firebase token'
      });
    }

    const phoneNumber = decodedToken.phone_number;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Phone number not found in Firebase token'
      });
    }

    // Find user by phone number
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('phone', phoneNumber)
      .limit(1);

    if (fetchError) {
      console.error('Supabase fetch error:', fetchError);
      return res.status(500).json({
        success: false,
        error: 'Database error'
      });
    }

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found. Please sign up first.'
      });
    }

    const user = users[0];

    // Hash the PIN
    const pinHash = await bcrypt.hash(pin, 12);

    // Update user's PIN
    const { error: updateError } = await supabase
      .from('users')
      .update({
        pin: pinHash,
        pin_attempts: 0,
        pin_locked_until: null
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Supabase update error:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to set PIN'
      });
    }

    // Generate JWT token for immediate login
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
      message: 'PIN set successfully',
      data: {
        user: userData,
        token: token
      }
    });

  } catch (error) {
    console.error('Set PIN error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};
