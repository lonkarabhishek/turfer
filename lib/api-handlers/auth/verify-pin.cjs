const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hwfsbpzercuoshodmnuf.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo'
);

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

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
    const { phone, pin } = req.body;

    if (!phone || !pin) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and PIN are required'
      });
    }

    // Validate PIN format
    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({
        success: false,
        error: 'PIN must be exactly 4 digits'
      });
    }

    // Normalize phone number to +91 format
    const normalizedPhone = phone.startsWith('+') ? phone : `+91${phone}`;

    // Find user by phone number
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('*')
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
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = users[0];

    // Check if user has a PIN set
    if (!user.pin) {
      return res.status(400).json({
        success: false,
        error: 'PIN not set. Please set up your PIN first.',
        requiresPinSetup: true
      });
    }

    // Check if account is locked
    if (user.pin_locked_until) {
      const lockoutEnd = new Date(user.pin_locked_until);
      const now = new Date();

      if (lockoutEnd > now) {
        const remainingMinutes = Math.ceil((lockoutEnd - now) / (1000 * 60));
        return res.status(423).json({
          success: false,
          error: `Account locked. Try again in ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}.`,
          lockedUntil: user.pin_locked_until
        });
      }
    }

    // Verify PIN
    const isPinValid = await bcrypt.compare(pin, user.pin);

    if (!isPinValid) {
      // Increment failed attempts
      const newAttempts = (user.pin_attempts || 0) + 1;
      const attemptsRemaining = MAX_PIN_ATTEMPTS - newAttempts;

      // Check if we should lock the account
      let lockUntil = null;
      if (newAttempts >= MAX_PIN_ATTEMPTS) {
        lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000).toISOString();
      }

      // Update attempts count and lock status
      await supabase
        .from('users')
        .update({
          pin_attempts: newAttempts,
          pin_locked_until: lockUntil
        })
        .eq('id', user.id);

      if (lockUntil) {
        return res.status(423).json({
          success: false,
          error: `Too many failed attempts. Account locked for ${LOCKOUT_DURATION_MINUTES} minutes.`,
          lockedUntil: lockUntil
        });
      }

      return res.status(401).json({
        success: false,
        error: 'Invalid PIN',
        attemptsRemaining: attemptsRemaining
      });
    }

    // PIN is correct - reset attempts and clear lockout
    await supabase
      .from('users')
      .update({
        pin_attempts: 0,
        pin_locked_until: null
      })
      .eq('id', user.id);

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
    console.error('Verify PIN error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};
