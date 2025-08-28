module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  res.json({
    success: true,
    message: 'Hello from JavaScript API!',
    method: req.method,
    timestamp: new Date().toISOString()
  });
};