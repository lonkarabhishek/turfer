export default function handler(req, res) {
  res.status(200).json({ 
    success: true, 
    message: 'Pong!', 
    timestamp: new Date().toISOString() 
  });
}