const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://hwfsbpzercuoshodmnuf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjA2MzE4MywiZXhwIjoyMDcxNjM5MTgzfQ.pSKXwx5gZ0dZVjJbk_IzLjEKM9Mx8xbIvCKQO9xXyzk'; // Service role key

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  try {
    console.log('Reading migration file...');
    const sql = fs.readFileSync('database/add-firebase-auth-support.sql', 'utf8');

    console.log('Executing migration...');

    // Split into individual statements and execute them one by one
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      console.log(`Executing: ${statement.substring(0, 60)}...`);
      const { error } = await supabase.rpc('exec_sql', { sql_string: statement });

      if (error) {
        console.error('Error:', error);
      } else {
        console.log('✅ Success');
      }
    }

    console.log('\n🎉 Migration completed!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
