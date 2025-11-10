const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://hwfsbpzercuoshodmnuf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo'
);

async function test() {
  console.log('\n=== Testing Games and Turfs ===\n');

  // Get games
  const { data: games, error: gamesError } = await supabase
    .from('games')
    .select('id, turf_id, sport')
    .limit(3);

  console.log('Games:', games);
  console.log('Games Error:', gamesError);

  if (games && games.length > 0) {
    const turfIds = games.map(g => g.turf_id).filter(Boolean);
    console.log('\nTurf IDs from games:', turfIds);

    // Try to fetch turfs - just get all columns
    const { data: turfs, error: turfsError } = await supabase
      .from('turfs')
      .select('*')
      .in('id', turfIds)
      .limit(1);

    console.log('\nTurfs fetched:', turfs);
    console.log('Turfs Error:', turfsError);

    if (turfs && turfs.length > 0) {
      console.log('\nAvailable columns in turfs table:');
      console.log(Object.keys(turfs[0]));
    }
  }
}

test().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
