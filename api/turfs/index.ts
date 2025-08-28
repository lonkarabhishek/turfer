import type { VercelRequest, VercelResponse } from '@vercel/node';
import { TurfModel } from '../../models/TurfSupabase';

const turfModel = new TurfModel();

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
      console.log('Turfs GET request received with query:', req.query);

      const query = {
        query: req.query.query as string,
        sport: req.query.sport as string,
        priceMin: req.query.priceMin ? Number(req.query.priceMin) : undefined,
        priceMax: req.query.priceMax ? Number(req.query.priceMax) : undefined,
        rating: req.query.rating ? Number(req.query.rating) : undefined,
        amenities: req.query.amenities as string,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 10,
        sort: req.query.sort as string || 'rating',
        order: (req.query.order as 'asc' | 'desc') || 'desc'
      };

      console.log('Processed search query:', query);
      const turfs = await turfModel.search(query.query || '', {
        sport: query.sport,
        priceMin: query.priceMin,
        priceMax: query.priceMax,
        limit: query.limit
      });
      console.log('Search result:', turfs);

      res.json({
        success: true,
        data: {
          turfs: turfs,
          total: turfs.length,
          page: query.page,
          limit: query.limit,
          totalPages: Math.ceil(turfs.length / (query.limit || 10))
        }
      });
    } catch (error: any) {
      console.error('Search turfs error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search turfs'
      });
    }
  } else {
    res.status(405).json({ success: false, error: 'Method not allowed' });
  }
}