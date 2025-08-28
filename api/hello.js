module.exports = function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Return JSON response
  res.status(200).json({
    success: true,
    message: 'Hello from JavaScript API!',
    method: req.method,
    timestamp: new Date().toISOString(),
    url: req.url
  });
};