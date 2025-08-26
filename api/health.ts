import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.json({
      success: true,
      message: 'TapTurf API is running on Vercel',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'production',
      version: '2.0.0'
    });
  }
  
  return res.status(405).json({ success: false, error: 'Method not allowed' });
}