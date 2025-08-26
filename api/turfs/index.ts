import { VercelRequest, VercelResponse } from '@vercel/node';
import { TurfModel } from '../../lib/models/TurfSupabase';

const turfModel = new TurfModel();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const {
      query,
      sport,
      priceMin,
      priceMax,
      rating,
      amenities,
      page = '1',
      limit = '10',
      sort = 'rating',
      order = 'desc'
    } = req.query;

    const searchParams = {
      query: query as string,
      sport: sport as string,
      priceMin: priceMin ? parseFloat(priceMin as string) : undefined,
      priceMax: priceMax ? parseFloat(priceMax as string) : undefined,
      rating: rating ? parseFloat(rating as string) : undefined,
      amenities: amenities ? (amenities as string).split(',') : undefined,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      sort: sort as string,
      order: order as 'asc' | 'desc'
    };

    const result = await turfModel.search(searchParams);

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('Search turfs error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}