const http = require('http');
const url = require('url');
const path = require('path');

// Import API functions
const pingHandler = require('./api/ping.js');
const helloHandler = require('./api/hello.js');
const indexHandler = require('./api/index.js');
const loginHandler = require('./api/auth/login.js');
const registerHandler = require('./api/auth/register.js');
const turfsHandler = require('./api/turfs/index.js');
const gamesHandler = require('./api/games/index.js');
const bookingsUserHandler = require('./api/bookings/user/[userId].js');
const sitemapHandler = require('./api/sitemap.xml.js');

const routes = {
  '/api/ping': pingHandler,
  '/api/hello': helloHandler,
  '/api/index': indexHandler,
  '/api/': indexHandler,
  '/api/auth/login': loginHandler,
  '/api/auth/register': registerHandler,
  '/api/turfs': turfsHandler,
  '/api/turfs/index': turfsHandler,
  '/api/games': gamesHandler,
  '/api/games/index': gamesHandler,
  '/sitemap.xml': sitemapHandler
};

// Add Express-like methods to response object
function enhanceResponse(res) {
  res.status = (statusCode) => {
    res.statusCode = statusCode;
    return res;
  };
  
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  };
  
  return res;
}

const server = http.createServer(async (req, res) => {
  // Enhance response object with Express-like methods
  res = enhanceResponse(res);
  
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  console.log(`${req.method} ${pathname}`);

  // Handle dynamic bookings route
  if (pathname.match(/^\/api\/bookings\/user\/[^\/]+$/)) {
    req.query = parsedUrl.query;
    try {
      await bookingsUserHandler(req, res);
    } catch (error) {
      console.error('Bookings handler error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
    return;
  }

  // Parse request body for POST requests
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        req.body = JSON.parse(body);
      } catch (e) {
        req.body = {};
      }
      req.query = parsedUrl.query;
      
      if (routes[pathname]) {
        try {
          await routes[pathname](req, res);
        } catch (error) {
          console.error('Handler error:', error);
          res.status(500).json({ success: false, error: error.message });
        }
      } else {
        res.status(404).json({ success: false, error: 'Not found' });
      }
    });
  } else {
    // GET requests
    req.body = {};
    req.query = parsedUrl.query;
    
    if (routes[pathname]) {
      try {
        await routes[pathname](req, res);
      } catch (error) {
        console.error('Handler error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    } else {
      res.status(404).json({ success: false, error: 'Not found' });
    }
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend server running at http://localhost:${PORT}`);
  console.log('Available endpoints:');
  Object.keys(routes).forEach(route => {
    console.log(`  http://localhost:${PORT}${route}`);
  });
  console.log(`  http://localhost:${PORT}/api/bookings/user/[userId]`);
});