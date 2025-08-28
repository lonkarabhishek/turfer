const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://hwfsbpzercuoshodmnuf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo'
);

async function checkSchema() {
  try {
    // Get one user and see all columns
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('Error:', error);
      return;
    }
    
    if (users && users.length > 0) {
      console.log('User columns:');
      Object.keys(users[0]).forEach(key => {
        console.log(`  - ${key}: ${typeof users[0][key]} = ${users[0][key]}`);
      });
    }
    
    // Also check turfs
    const { data: turfs, error: turfsError } = await supabase
      .from('turfs')
      .select('*')
      .limit(1);
    
    if (!turfsError && turfs && turfs.length > 0) {
      console.log('\nTurf columns:');
      Object.keys(turfs[0]).forEach(key => {
        console.log(`  - ${key}: ${typeof turfs[0][key]}`);
      });
    }
    
  } catch (error) {
    console.error('Setup error:', error);
  }
}

checkSchema();