const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hwfsbpzercuoshodmnuf.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo'
);

// Format date in readable format
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Generate static HTML page with all games for crawlers
async function handler(req, res) {
  try {
    const baseUrl = 'https://www.tapturf.in';

    // Fetch all upcoming games
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (gamesError) {
      console.error('Error fetching games:', gamesError);
    }

    const gamesList = games || [];

    // Build HTML page
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TapTurf - Available Games | Find and Join Sports Games Near You</title>
  <meta name="description" content="Find and join ${gamesList.length}+ active sports games near you on TapTurf. Book turfs, connect with players, and play football, cricket, basketball, and more!">
  <meta name="keywords" content="sports games, turf booking, football games, cricket matches, join games, find players, sports near me">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${baseUrl}/api/games-html">

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${baseUrl}/api/games-html">
  <meta property="og:title" content="TapTurf - Available Games">
  <meta property="og:description" content="Find and join ${gamesList.length}+ active sports games near you">
  <meta property="og:site_name" content="TapTurf">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="TapTurf - Available Games">
  <meta name="twitter:description" content="Find and join ${gamesList.length}+ active sports games near you">

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #333;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      background: white;
      padding: 30px;
      border-radius: 15px;
      margin-bottom: 30px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    h1 {
      color: #667eea;
      margin-bottom: 10px;
      font-size: 2.5em;
    }
    .subtitle { color: #666; font-size: 1.1em; }
    .games-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }
    .game-card {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      border-left: 4px solid #667eea;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .game-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 6px 12px rgba(0,0,0,0.15);
    }
    .game-title {
      font-size: 1.5em;
      font-weight: bold;
      color: #2d3748;
      margin-bottom: 8px;
    }
    .game-venue {
      color: #667eea;
      font-weight: 600;
      margin-bottom: 16px;
      font-size: 1.1em;
    }
    .game-detail {
      margin: 8px 0;
      color: #4a5568;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .game-detail strong { color: #2d3748; min-width: 100px; }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 0.85em;
      font-weight: 600;
      margin-top: 12px;
    }
    .badge-success { background: #d4edda; color: #155724; }
    .badge-warning { background: #fff3cd; color: #856404; }
    .badge-danger { background: #f8d7da; color: #721c24; }
    .price {
      font-size: 1.3em;
      font-weight: bold;
      color: #16a34a;
      margin: 12px 0;
    }
    .empty-state {
      background: white;
      padding: 60px 40px;
      border-radius: 12px;
      text-align: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .empty-state h2 { color: #667eea; margin-bottom: 12px; }
    footer {
      background: white;
      padding: 30px;
      border-radius: 12px;
      text-align: center;
      margin-top: 40px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .cta-button {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 12px 32px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      margin-top: 16px;
      transition: background 0.2s;
    }
    .cta-button:hover {
      background: #5568d3;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🏆 TapTurf - Available Games</h1>
      <p class="subtitle">Find and join active sports games near you</p>
      <p class="subtitle">${gamesList.length} games available right now!</p>
    </header>

    ${gamesList.length > 0 ? `
      <div class="games-grid">
        ${gamesList.map(game => {
          const spotsLeft = game.max_players - game.current_players;
          const isFull = spotsLeft <= 0;
          const isAlmostFull = spotsLeft <= 2 && spotsLeft > 0;

          return `
            <article class="game-card" itemscope itemtype="http://schema.org/SportsEvent">
              <h2 class="game-title" itemprop="name">${game.format || 'Sports Game'}</h2>
              <div class="game-venue" itemprop="location" itemscope itemtype="http://schema.org/Place">
                <span itemprop="name">📍 ${game.turf_name || 'TBD'}</span>
              </div>

              <div class="game-detail">
                <strong>Date:</strong>
                <time itemprop="startDate" datetime="${game.date}">
                  ${formatDate(game.date)}
                </time>
              </div>

              <div class="game-detail">
                <strong>Time:</strong>
                <span>${game.time_slot || 'TBD'}</span>
              </div>

              <div class="game-detail">
                <strong>Host:</strong>
                <span itemprop="organizer" itemscope itemtype="http://schema.org/Person">
                  <span itemprop="name">${game.host_name || 'Anonymous'}</span>
                </span>
              </div>

              <div class="game-detail">
                <strong>Skill Level:</strong>
                <span>${game.skill_level || 'All levels'}</span>
              </div>

              <div class="game-detail">
                <strong>Players:</strong>
                <span itemprop="maximumAttendeeCapacity">${game.current_players}/${game.max_players}</span>
                ${isFull ? '<span class="badge badge-danger">Full</span>' :
                  isAlmostFull ? '<span class="badge badge-warning">Almost Full</span>' :
                  '<span class="badge badge-success">Spots Available</span>'}
              </div>

              <div class="price" itemprop="offers" itemscope itemtype="http://schema.org/Offer">
                <meta itemprop="priceCurrency" content="INR">
                <span itemprop="price">₹${game.cost_per_person || 0}</span>/person
              </div>

              ${game.notes ? `<div class="game-detail"><strong>Notes:</strong> ${game.notes}</div>` : ''}

              <a href="${baseUrl}/game/${game.id}" class="cta-button" itemprop="url">
                View Details & Join →
              </a>
            </article>
          `;
        }).join('')}
      </div>
    ` : `
      <div class="empty-state">
        <h2>No Games Available Right Now</h2>
        <p>Check back soon or create your own game!</p>
        <a href="${baseUrl}" class="cta-button">Go to TapTurf →</a>
      </div>
    `}

    <footer>
      <h3>About TapTurf</h3>
      <p>TapTurf is your go-to platform for finding and joining sports games in your area.</p>
      <p>Book turfs, connect with players, and play football, cricket, basketball, badminton, tennis, pickleball, and more!</p>
      <a href="${baseUrl}" class="cta-button">Visit TapTurf →</a>
    </footer>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    res.statusCode = 200;
    res.end(html);

  } catch (error) {
    console.error('Error generating games HTML:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Error generating games list');
  }
}

module.exports = handler;
