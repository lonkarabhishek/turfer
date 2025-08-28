import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BookingModel } from '../../models/BookingSupabase';

const bookingModel = new BookingModel();

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
      // This would typically get user bookings
      // For now, return empty array
      res.json({
        success: true,
        data: []
      });
    } catch (error: any) {
      console.error('Get bookings error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get bookings'
      });
    }
  } else {
    res.status(405).json({ success: false, error: 'Method not allowed' });
  }
}