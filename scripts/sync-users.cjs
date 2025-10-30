#!/usr/bin/env node

/**
 * Sync existing auth.users to public.users
 * Run this script to ensure all authenticated users have a record in public.users
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Supabase configuration
const supabaseUrl = 'https://hwfsbpzercuoshodmnuf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo';

// Service role key would be needed for this operation, but we'll try with anon key
// In production, you should use the service role key for admin operations
const supabase = createClient(supabaseUrl, supabaseKey);

async function syncUsers() {
  console.log('🔄 Starting user sync from auth.users to public.users...\n');

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'database', 'sync-existing-users.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('📄 SQL to execute:');
    console.log(sql);
    console.log('\n');

    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      console.error('❌ Error executing SQL:', error);

      // If exec_sql doesn't exist, try using Supabase's SQL editor API
      console.log('\n⚠️  exec_sql function not available. Please run this SQL manually in Supabase SQL Editor:');
      console.log('📋 Copy the SQL from: database/sync-existing-users.sql');
      console.log('\n🔗 Go to: https://supabase.com/dashboard/project/hwfsbpzercuoshodmnuf/sql');
      return;
    }

    console.log('✅ User sync completed successfully!');
    console.log('📊 Result:', data);

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    console.log('\n💡 Alternative: Run the SQL manually in Supabase Dashboard');
    console.log('📋 SQL file: database/sync-existing-users.sql');
    console.log('🔗 Dashboard: https://supabase.com/dashboard/project/hwfsbpzercuoshodmnuf/sql');
  }
}

// Run the sync
syncUsers().then(() => {
  console.log('\n✨ Script completed');
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
