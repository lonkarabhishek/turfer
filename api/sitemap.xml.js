const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hwfsbpzercuoshodmnuf.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo'
);

// Generate sitemap.xml dynamically with all turfs and games
async function handler(req, res) {
  try {
    const baseUrl = 'https://www.tapturf.in';
    const currentDate = new Date().toISOString();

    // Fetch all turfs
    const { data: turfs, error: turfsError } = await supabase
      .from('turfs')
      .select('id, updated_at')
      .order('updated_at', { ascending: false });

    if (turfsError) {
      console.error('Error fetching turfs for sitemap:', turfsError);
    }

    // Fetch all upcoming games
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('id, updated_at, date')
      .gte('date', new Date().toISOString().split('T')[0])
      .order('updated_at', { ascending: false });

    if (gamesError) {
      console.error('Error fetching games for sitemap:', gamesError);
    }

    // Build XML sitemap
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:mobile="http://www.google.com/schemas/sitemap-mobile/1.0"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">

  <!-- Main Pages -->
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>

  <url>
    <loc>${baseUrl}/find-turfs</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>

  <url>
    <loc>${baseUrl}/join-game</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>

  <url>
    <loc>${baseUrl}/create-game</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;

    // Add sport pages
    const sports = ['football', 'basketball', 'cricket', 'badminton', 'tennis', 'pickleball'];
    sports.forEach(sport => {
      sitemap += `  <url>
    <loc>${baseUrl}/sport/${sport}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
`;
    });

    // Add all turf detail pages
    if (turfs && turfs.length > 0) {
      turfs.forEach(turf => {
        sitemap += `  <url>
    <loc>${baseUrl}/turf/${turf.id}</loc>
    <lastmod>${turf.updated_at || currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>
`;
      });
    }

    // Add all game detail pages
    if (games && games.length > 0) {
      games.forEach(game => {
        sitemap += `  <url>
    <loc>${baseUrl}/game/${game.id}</loc>
    <lastmod>${game.updated_at || currentDate}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.8</priority>
  </url>
`;
      });
    }

    sitemap += `</urlset>`;

    // Set headers for XML response
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.statusCode = 200;
    res.end(sitemap);

  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Error generating sitemap');
  }
}

module.exports = handler;
