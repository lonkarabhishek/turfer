import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://hwfsbpzercuoshodmnuf.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  try {
    console.log('🔧 Running game_requests migration...');

    // Read the SQL file
    const sql = fs.readFileSync('database/add_requester_info_to_game_requests.sql', 'utf8');

    console.log('📝 SQL to execute:\n', sql);

    // Execute the migration
    // Note: Supabase JS client doesn't support raw SQL execution for DDL
    // We need to use the REST API or run this manually in the Supabase dashboard
    console.log('\n⚠️  Cannot execute DDL statements via Supabase JS client.');
    console.log('📋 Please run this migration manually in the Supabase SQL Editor:');
    console.log('   1. Go to https://supabase.com/dashboard/project/hwfsbpzercuoshodmnuf');
    console.log('   2. Navigate to SQL Editor');
    console.log('   3. Copy and paste the SQL from database/add_requester_info_to_game_requests.sql');
    console.log('   4. Click "Run"\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
