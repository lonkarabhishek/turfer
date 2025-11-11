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

// Convert 24-hour time to 12-hour format
function formatTime(timeStr) {
  if (!timeStr || timeStr === '00:00') return '12:00 AM';

  const [hours, minutes] = timeStr.split(':');
  const hour24 = parseInt(hours, 10);
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  const ampm = hour24 < 12 ? 'AM' : 'PM';

  return `${hour12}:${minutes} ${ampm}`;
}

// Format time slot to 12-hour format with en-dash
function formatTimeSlot(startTime, endTime) {
  if (!startTime || !endTime) return 'TBD';
  const formattedStart = formatTime(startTime);
  const formattedEnd = formatTime(endTime);
  // Use en-dash (–) instead of hyphen (-)
  return `${formattedStart} – ${formattedEnd}`;
}

// Convert date and time to ISO 8601 format with timezone (IST = UTC+5:30)
function toISO8601(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;

  // Parse the date and time
  const date = new Date(dateStr);
  const [hours, minutes] = timeStr.split(':');

  // Set the time
  date.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

  // Format as ISO 8601 with IST timezone (+05:30)
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hour}:${minute}:00+05:30`;
}

// Get turf info from joined data or fallback
function getTurfInfo(game) {
  // Try joined turfs data first
  if (game.turfs?.name) {
    return {
      name: game.turfs.name,
      address: game.turfs.address || 'Address not available'
    };
  }
  // Fallback to flat structure
  return {
    name: game.turf_name || 'TapTurf Arena',
    address: game.turf_address || 'Nashik, India'
  };
}

// Generate JSON-LD structured data for a game
function generateGameJsonLd(game, baseUrl) {
  const startDateTime = toISO8601(game.date, game.start_time);
  const endDateTime = toISO8601(game.date, game.end_time);

  if (!startDateTime || !endDateTime) return '';

  const turfInfo = getTurfInfo(game);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "name": `${game.format || 'Sports Game'} at ${turfInfo.name}`,
    "sport": game.sport || game.format || 'Sports',
    "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
    "eventStatus": "https://schema.org/EventScheduled",
    "startDate": startDateTime,
    "endDate": endDateTime,
    "location": {
      "@type": "Place",
      "name": turfInfo.name,
      "address": turfInfo.address
    },
    "organizer": {
      "@type": "Person",
      "name": game.host_name || 'TapTurf Host'
    },
    "offers": {
      "@type": "Offer",
      "price": (game.price_per_person || game.cost_per_person || 0).toString(),
      "priceCurrency": "INR",
      "availability": "https://schema.org/InStock",
      "url": `${baseUrl}/game/${game.id}`
    },
    "maximumAttendeeCapacity": game.max_players || 0,
    "remainingAttendeeCapacity": Math.max(0, (game.max_players || 0) - (game.current_players || 0))
  };

  return `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`;
}

// Generate static HTML page with all games for crawlers
async function handler(req, res) {
  try {
    const baseUrl = 'https://www.tapturf.in';

    // Fetch all upcoming games with turf details
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select(`
        *,
        turfs (
          id,
          name,
          address
        )
      `)
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (gamesError) {
      console.error('Error fetching games:', gamesError);
    }

    const gamesList = games || [];

    // Extract unique sports and locations for meta tags
    const uniqueSports = [...new Set(gamesList.map(g => g.sport || g.format).filter(Boolean))];
    const uniqueLocations = [...new Set(gamesList.map(g => {
      const turfInfo = getTurfInfo(g);
      const addr = turfInfo.address || '';
      return addr.split(',')[0]?.trim();
    }).filter(Boolean))];

    const sportsText = uniqueSports.slice(0, 5).join(', ') || 'Sports';
    const locationsText = uniqueLocations.slice(0, 3).join(', ') || 'Near You';

    // Build HTML page
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TapTurf - ${gamesList.length} ${sportsText} Games in ${locationsText} | Join Now</title>
  <meta name="description" content="Find and join ${gamesList.length}+ live ${sportsText} games in ${locationsText}. Book turfs, connect with players. Upcoming matches for football, cricket, basketball, badminton, and more!">
  <meta name="keywords" content="sports games near me, ${sportsText.toLowerCase()}, turf booking ${locationsText}, join games, find players, sports matches today, ${uniqueSports.map(s => `${s} games`).join(', ')}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${baseUrl}/api/games-html">
  <meta name="geo.region" content="IN-MH">
  <meta name="geo.placename" content="${locationsText}">

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${baseUrl}/api/games-html">
  <meta property="og:title" content="TapTurf - ${gamesList.length} ${sportsText} Games in ${locationsText}">
  <meta property="og:description" content="Join ${gamesList.length}+ live ${sportsText} games. Book turfs, connect with players for football, cricket, basketball, and more sports!">
  <meta property="og:site_name" content="TapTurf">
  <meta property="og:locale" content="en_IN">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${gamesList.length} ${sportsText} Games in ${locationsText} | TapTurf">
  <meta name="twitter:description" content="Join ${gamesList.length}+ live sports games. ${sportsText} matches available now!">
  <meta name="twitter:site" content="@TapTurf">

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
          const startDateTime = toISO8601(game.date, game.start_time);
          const endDateTime = toISO8601(game.date, game.end_time);
          const turfInfo = getTurfInfo(game);

          return `
            ${generateGameJsonLd(game, baseUrl)}
            <article class="game-card" itemscope itemtype="http://schema.org/SportsEvent">
              <h2 class="game-title" itemprop="name">${game.format || 'Sports Game'} at ${turfInfo.name}</h2>
              <div class="game-venue" itemprop="location" itemscope itemtype="http://schema.org/Place">
                <span itemprop="name">📍 ${turfInfo.name}</span>
                <br>
                <span class="text-sm text-gray-600">${turfInfo.address}</span>
              </div>

              ${game.sport ? `
              <div class="game-detail">
                <strong>Sport:</strong>
                <span itemprop="sport">${game.sport}</span>
              </div>
              ` : ''}

              <div class="game-detail">
                <strong>Date:</strong>
                <time itemprop="startDate" datetime="${startDateTime || game.date}">
                  ${formatDate(game.date)}
                </time>
              </div>

              <div class="game-detail">
                <strong>Time:</strong>
                <time itemprop="endDate" datetime="${endDateTime || ''}">
                  ${formatTimeSlot(game.start_time, game.end_time)}
                </time>
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

              ${game.price_per_person ? `
              <div class="price" itemprop="offers" itemscope itemtype="http://schema.org/Offer">
                <meta itemprop="priceCurrency" content="INR">
                <span itemprop="price">₹${game.price_per_person}</span>/person
              </div>
              ` : game.cost_per_person ? `
              <div class="price" itemprop="offers" itemscope itemtype="http://schema.org/Offer">
                <meta itemprop="priceCurrency" content="INR">
                <span itemprop="price">₹${game.cost_per_person}</span>/person
              </div>
              ` : ''}

              ${game.notes ? `<div class="game-detail"><strong>Notes:</strong> ${game.notes}</div>` : ''}
              ${game.description ? `<div class="game-detail"><strong>Description:</strong> ${game.description}</div>` : ''}

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
