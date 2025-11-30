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
    // Verify authentication token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization header'
      });
    }

    const token = authHeader.substring(7);
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    const { userId } = decoded;
    const { field, value } = req.body;

    if (!field || value === undefined || value === null) {
      return res.status(400).json({
        success: false,
        error: 'Field and value are required'
      });
    }

    // Validate the field being updated
    const allowedFields = ['name', 'email', 'phone', 'profile_image_url'];
    if (!allowedFields.includes(field)) {
      return res.status(400).json({
        success: false,
        error: `Invalid field. Allowed fields: ${allowedFields.join(', ')}`
      });
    }

    // Validate the value based on field
    if (field === 'name' && (!value.trim() || value.trim().length < 1)) {
      return res.status(400).json({
        success: false,
        error: 'Name cannot be empty'
      });
    }

    if (field === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value.trim())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format'
        });
      }

      // Check if email is already in use by another user
      const { data: existingUsers, error: checkError } = await supabase
        .from('users')
        .select('id')
        .eq('email', value.trim())
        .neq('id', userId)
        .limit(1);

      if (checkError) {
        console.error('Error checking email:', checkError);
        return res.status(500).json({
          success: false,
          error: 'Database error'
        });
      }

      if (existingUsers && existingUsers.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Email already in use'
        });
      }
    }

    if (field === 'phone' && value.trim()) {
      // Normalize phone number
      const normalizedPhone = value.trim().startsWith('+') ? value.trim() : `+91${value.trim()}`;

      // Check if phone is already in use by another user
      const { data: existingUsers, error: checkError } = await supabase
        .from('users')
        .select('id')
        .eq('phone', normalizedPhone)
        .neq('id', userId)
        .limit(1);

      if (checkError) {
        console.error('Error checking phone:', checkError);
        return res.status(500).json({
          success: false,
          error: 'Database error'
        });
      }

      if (existingUsers && existingUsers.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Phone number already in use'
        });
      }
    }

    // Prepare update object
    const updates = {
      [field]: field === 'phone' && value.trim()
        ? (value.trim().startsWith('+') ? value.trim() : `+91${value.trim()}`)
        : value.trim(),
      updated_at: new Date().toISOString()
    };

    // Update the user in the database
    const { data: updatedUsers, error: updateError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select();

    if (updateError) {
      console.error('Error updating profile:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to update profile'
      });
    }

    if (!updatedUsers || updatedUsers.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const updatedUser = updatedUsers[0];

    // Return updated user data
    const userData = {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      phone: updatedUser.phone,
      role: updatedUser.role,
      isVerified: updatedUser.is_verified,
      profile_image_url: updatedUser.profile_image_url,
      createdAt: updatedUser.created_at,
      updatedAt: updatedUser.updated_at
    };

    res.status(200).json({
      success: true,
      data: {
        user: userData,
        field,
        value: updates[field]
      }
    });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};
