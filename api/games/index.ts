import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GameModel } from '../../models/GameSupabase';

const gameModel = new GameModel();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      const params = {
        sport: req.query.sport as string,
        skillLevel: req.query.skillLevel as string,
        date: req.query.date as string,
        lat: req.query.lat ? Number(req.query.lat) : undefined,
        lng: req.query.lng ? Number(req.query.lng) : undefined,
        radius: req.query.radius ? Number(req.query.radius) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 10
      };

      const games = await gameModel.getAvailable(params);

      res.json({
        success: true,
        data: games
      });
    } catch (error: any) {
      console.error('Get games error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get games'
      });
    }
  } else {
    res.status(405).json({ success: false, error: 'Method not allowed' });
  }
}