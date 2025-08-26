import { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';
import { UserModel } from '../../lib/models/UserSupabase';

const userModel = new UserModel();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { name, email, password, phone, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and password are required'
      });
    }

    // Check if user already exists
    const existingUser = await userModel.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    // Create new user
    const user = await userModel.create({
      name,
      email,
      password,
      phone,
      role: role || 'user',
      isVerified: false
    });

    // Generate JWT token
    const jwtPayload = { id: user.id, email: user.email, role: user.role };
    const jwtSecret = process.env.JWT_SECRET!;
    const jwtOptions = { expiresIn: process.env.JWT_EXPIRES_IN || '7d' };
    const token = jwt.sign(jwtPayload, jwtSecret, jwtOptions);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({
      success: true,
      data: {
        user: userWithoutPassword,
        token
      },
      message: 'User registered successfully'
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}