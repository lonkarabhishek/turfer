// Catch-all API route for Vercel - consolidates all endpoints into one function
const url = require('url');

// Import API handlers
const pingHandler = require('./ping.js');
const helloHandler = require('./hello.js');
const indexHandler = require('./index.js');
const loginHandler = require('./auth/login.js');
const registerHandler = require('./auth/register.js');
const firebaseLoginHandler = require('./auth/firebase-login.js');
const firebaseSignupHandler = require('./auth/firebase-signup.js');
const turfsHandler = require('./turfs/index.js');
const gamesHandler = require('./games/index.js');
const bookingsUserHandler = require('./bookings/user/[userId].js');
const sitemapHandler = require('./sitemap.xml.js');

const routes = {
  '/api/ping': pingHandler,
  '/api/hello': helloHandler,
  '/api/index': indexHandler,
  '/api': indexHandler,
  '/api/auth/login': loginHandler,
  '/api/auth/register': registerHandler,
  '/api/auth/firebase-login': firebaseLoginHandler,
  '/api/auth/firebase-signup': firebaseSignupHandler,
  '/api/turfs': turfsHandler,
  '/api/turfs/index': turfsHandler,
  '/api/games': gamesHandler,
  '/api/games/index': gamesHandler,
  '/sitemap.xml': sitemapHandler
};

// Add Express-like methods to response object
function enhanceResponse(res) {
  if (res.status && res.json) return res;

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

module.exports = async (req, res) => {
  // Enhance response object
  res = enhanceResponse(res);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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
  if (req.method === 'POST' || req.method === 'PUT') {
    if (!req.body) {
      let body = '';

      await new Promise((resolve) => {
        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', () => {
          try {
            req.body = JSON.parse(body);
          } catch (e) {
            req.body = {};
          }
          resolve();
        });
      });
    }
  } else {
    req.body = req.body || {};
  }

  req.query = parsedUrl.query;

  // Find matching route
  const handler = routes[pathname];

  if (handler) {
    try {
      await handler(req, res);
    } catch (error) {
      console.error('Handler error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  } else {
    res.status(404).json({ success: false, error: 'Not found' });
  }
};
