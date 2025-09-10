const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Supabase configuration
const supabaseUrl = 'https://hwfsbpzercuoshodmnuf.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjA2MzE4MywiZXhwIjoyMDcxNjM5MTgzfQ.0WGKfMVqSu5TpnHgUVVTSfNHEJGC8IrIHNUKPR8fVTo'; // Service role key for admin operations

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  try {
    console.log('🔧 Running database migration to fix signup constraints...');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'supabase', 'migrations', '003_fix_signup_constraints.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', { 
      sql: migrationSQL 
    });
    
    if (error) {
      // Try alternative approach - execute individual statements
      console.log('⚠️ RPC approach failed, trying direct execution...');
      console.error('RPC Error:', error);
      
      // Split migration into individual statements and execute them
      const statements = migrationSQL
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
      
      for (const statement of statements) {
        try {
          console.log('📝 Executing:', statement.substring(0, 100) + '...');
          const result = await supabase.rpc('exec_sql', { sql: statement });
          if (result.error) {
            console.error('❌ Statement failed:', statement);
            console.error('Error:', result.error);
          } else {
            console.log('✅ Statement executed successfully');
          }
        } catch (err) {
          console.error('❌ Statement execution error:', err.message);
        }
      }
    } else {
      console.log('✅ Migration executed successfully!');
      console.log('Result:', data);
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  }
}

// Run the migration
runMigration();