const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const admin = require('../../../api/auth/firebase-admin.js');

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
    const { name, phone, firebaseIdToken, email, pin } = req.body;

    if (!name || !phone || !firebaseIdToken || !pin) {
      return res.status(400).json({
        success: false,
        error: 'Name, phone, Firebase ID token, and PIN are required'
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

    // Validate email format if provided
    if (email && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format'
        });
      }
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

    const tokenPhoneNumber = decodedToken.phone_number;
    const firebaseUid = decodedToken.uid;

    // Verify phone numbers match
    const normalizedPhone = phone.startsWith('+') ? phone : `+91${phone}`;
    if (tokenPhoneNumber !== normalizedPhone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number mismatch'
      });
    }

    // Check if user already exists
    const { data: existingUsers, error: checkError } = await supabase
      .from('users')
      .select('*')
      .eq('phone', tokenPhoneNumber)
      .limit(1);

    if (checkError) {
      console.error('Supabase check error:', checkError);
      return res.status(500).json({
        success: false,
        error: 'Database error during signup'
      });
    }

    if (existingUsers && existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'User already exists. Please login instead.'
      });
    }

    // Hash the PIN
    const pinHash = await bcrypt.hash(pin, 12);

    // Create new user in Supabase
    // Generate placeholder email if not provided (email column is NOT NULL in DB)
    const userEmail = email && email.trim() ? email.trim() : `${tokenPhoneNumber.replace('+', '')}@phone.tapturf.in`;

    const newUser = {
      name: name.trim(),
      phone: tokenPhoneNumber,
      email: userEmail,
      password: firebaseUid, // Store Firebase UID as password (won't be used for login)
      role: 'user',
      is_verified: true, // Phone is verified via Firebase
      firebase_uid: firebaseUid,
      pin: pinHash, // Store hashed PIN
      pin_attempts: 0,
      pin_locked_until: null
    };

    const { data: createdUsers, error: insertError } = await supabase
      .from('users')
      .insert([newUser])
      .select();

    if (insertError) {
      console.error('Supabase insert error:', insertError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create user account'
      });
    }

    const user = createdUsers[0];

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

    res.status(201).json({
      success: true,
      data: {
        user: userData,
        token: token
      }
    });

  } catch (error) {
    console.error('Firebase signup error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error: ' + error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
};
