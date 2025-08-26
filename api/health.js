module.exports = function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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