const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = 'https://hwfsbpzercuoshodmnuf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function debugSignup() {
  try {
    console.log('🔍 Testing database insert with sample user data...');
    
    // Test data that matches what signup would send
    const testUser = {
      id: '12345678-1234-1234-1234-123456789012', // UUID format
      email: 'test@example.com',
      name: 'Test User',
      phone: '+91 9876543210',
      role: 'player', // Using mapped role
      password: '', // Empty string as placeholder
      is_verified: true, // Use correct snake_case column name
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    console.log('📝 Test user data:', testUser);
    
    // Try to insert
    const { data, error } = await supabase
      .from('users')
      .insert([testUser]);
    
    if (error) {
      console.error('❌ Insert error:', error);
      console.error('   Code:', error.code);
      console.error('   Message:', error.message);
      console.error('   Details:', error.details);
    } else {
      console.log('✅ Insert successful:', data);
      
      // Clean up - delete the test user
      await supabase
        .from('users')
        .delete()
        .eq('id', testUser.id);
      console.log('🗑️ Cleaned up test user');
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

// Also test table structure
async function checkTableStructure() {
  try {
    console.log('🔍 Checking users table structure...');
    
    // Try to get column information
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('❌ Table access error:', error);
    } else {
      console.log('✅ Table accessible, sample data keys:', data?.[0] ? Object.keys(data[0]) : 'No existing users');
    }
    
  } catch (error) {
    console.error('❌ Table structure check error:', error.message);
  }
}

// Run both tests
async function runTests() {
  await checkTableStructure();
  await debugSignup();
}

runTests();