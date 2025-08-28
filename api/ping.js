module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  res.status(200).json({ 
    success: true, 
    message: 'Pong! API is working!', 
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url
  });
};