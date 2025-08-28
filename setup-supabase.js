const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Supabase configuration
const supabaseUrl = 'https://hwfsbpzercuoshodmnuf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupDatabase() {
  try {
    console.log('🔍 Checking existing tables...');
    
    // Check if tables exist
    const { data: tables, error: tablesError } = await supabase
      .from('users')
      .select('count', { count: 'exact', head: true });
    
    if (!tablesError) {
      console.log('✅ Tables already exist! Checking data...');
      
      // Check turfs data
      const { data: turfs, error: turfsError } = await supabase
        .from('turfs')
        .select('*')
        .limit(5);
      
      if (!turfsError && turfs && turfs.length > 0) {
        console.log(`✅ Found ${turfs.length} turfs in database:`);
        turfs.forEach(turf => {
          console.log(`   - ${turf.name} (${turf.address})`);
        });
      } else {
        console.log('⚠️  No turfs found, but tables exist');
      }
      
      // Check users data  
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('email, role')
        .limit(5);
        
      if (!usersError && users && users.length > 0) {
        console.log(`✅ Found ${users.length} users in database:`);
        users.forEach(user => {
          console.log(`   - ${user.email} (${user.role})`);
        });
      } else {
        console.log('⚠️  No users found, but tables exist');
      }
      
    } else {
      console.log('❌ Tables do not exist or cannot access them');
      console.log('Error:', tablesError.message);
      console.log('Note: You may need to run the SQL schema manually in Supabase dashboard');
    }
    
    console.log('\n🎯 Database setup check completed!');
    console.log('If tables don\'t exist, copy and run the SQL from supabase-schema.sql in your Supabase dashboard');
    
  } catch (error) {
    console.error('❌ Setup error:', error);
  }
}

setupDatabase();