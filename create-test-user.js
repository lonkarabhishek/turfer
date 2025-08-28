const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabase = createClient(
  'https://hwfsbpzercuoshodmnuf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo'
);

async function createTestUser() {
  try {
    console.log('🔍 Checking existing users...');
    
    const { data: users, error } = await supabase
      .from('users')
      .select('email, password_hash')
      .limit(3);
    
    if (error) {
      console.error('Error fetching users:', error);
      return;
    }
    
    console.log('Existing users:');
    users.forEach(user => {
      console.log(`  - ${user.email} (has password: ${!!user.password_hash})`);
    });
    
    // Hash password for test user
    const testPassword = 'password123';
    const hashedPassword = await bcrypt.hash(testPassword, 12);
    
    console.log(`\n🔑 Creating test user with password: ${testPassword}`);
    
    // Create or update test user
    const { data: newUser, error: upsertError } = await supabase
      .from('users')
      .upsert({
        email: 'test@tapturf.in',
        name: 'Test User',
        password_hash: hashedPassword,
        role: 'user',
        is_verified: false
      })
      .select()
      .single();
    
    if (upsertError) {
      console.error('Error creating test user:', upsertError);
    } else {
      console.log('✅ Test user created/updated:', newUser.email);
      console.log('   Password:', testPassword);
      console.log('   Role:', newUser.role);
    }
    
  } catch (error) {
    console.error('Setup error:', error);
  }
}

createTestUser();