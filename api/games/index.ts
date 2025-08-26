import { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';
import { GameModel } from '../../lib/models/GameSupabase';

const gameModel = new GameModel();

// Simple auth helper for Vercel functions
function getAuthenticatedUser(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    return { id: decoded.id, email: decoded.email, role: decoded.role };
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      const {
        sport,
        skillLevel,
        date,
        turfId,
        page = '1',
        limit = '10'
      } = req.query;

      const searchParams = {
        sport: sport as string,
        skillLevel: skillLevel as string,
        date: date as string,
        turfId: turfId as string,
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      };

      const games = await gameModel.search(searchParams);

      res.json({
        success: true,
        data: games
      });
    } catch (error: any) {
      console.error('Get games error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  } else if (req.method === 'POST') {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const gameData = {
        ...req.body,
        hostId: user.id
      };

      const game = await gameModel.create(gameData);

      res.status(201).json({
        success: true,
        data: game,
        message: 'Game created successfully'
      });
    } catch (error: any) {
      console.error('Create game error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  } else {
    res.status(405).json({ success: false, error: 'Method not allowed' });
  }
}