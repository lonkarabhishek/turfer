export default function handler(req, res) {
  res.status(200).json({ 
    success: true, 
    message: 'Vercel API test working',
    timestamp: new Date().toISOString()
  });
}