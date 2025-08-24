import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/User';
import { validate, userRegistrationSchema, userLoginSchema } from '../middleware/validation';
import { ApiResponse } from '../types';

const router = Router();
const userModel = new UserModel();

// Register
router.post('/register', validate(userRegistrationSchema), async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone, role } = req.body;

    // Check if user already exists
    const existingUser = await userModel.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User with this email already exists'
      } as ApiResponse);
    }

    // Create new user
    const user = await userModel.create({
      name,
      email,
      password,
      phone,
      role: role || 'user',
      isVerified: true
    });

    // Generate JWT token
    const jwtPayload = { id: user.id, email: user.email, role: user.role };
    const jwtSecret = process.env.JWT_SECRET!;
    const jwtOptions: any = { expiresIn: process.env.JWT_EXPIRES_IN || '7d' };
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
    } as ApiResponse);
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Login
router.post('/login', validate(userLoginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await userModel.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      } as ApiResponse);
    }

    // Validate password
    const isValidPassword = await userModel.validatePassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      } as ApiResponse);
    }

    // Generate JWT token
    const jwtPayload = { id: user.id, email: user.email, role: user.role };
    const jwtSecret = process.env.JWT_SECRET!;
    const jwtOptions: any = { expiresIn: process.env.JWT_EXPIRES_IN || '7d' };
    const token = jwt.sign(jwtPayload, jwtSecret, jwtOptions);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      data: {
        user: userWithoutPassword,
        token
      },
      message: 'Login successful'
    } as ApiResponse);
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Get current user profile
router.get('/me', async (req: Request, res: Response) => {
  try {
    // This endpoint will be protected by auth middleware in the main server file
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      } as ApiResponse);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    const user = await userModel.findById(decoded.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      } as ApiResponse);
    }

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      data: userWithoutPassword
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

export default router;