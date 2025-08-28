module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    success: true,
    message: 'API Root is working!',
    availableEndpoints: [
      '/api/ping',
      '/api/hello',
      '/api/auth/login',
      '/api/turfs'
    ]
  });
};