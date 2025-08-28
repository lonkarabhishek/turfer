export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  res.json({
    success: true,
    message: 'API is working!',
    method: req.method
  });
}