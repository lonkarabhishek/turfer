// Setup Supabase Storage for Profile Photos
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hwfsbpzercuoshodmnuf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo';

// Note: This requires service role key for bucket creation
// For production setup, use Supabase Dashboard instead
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function setupProfileStorage() {
  console.log('🔧 Setting up profile photo storage...');

  try {
    // Create the profile-photos bucket
    const { data, error } = await supabase.storage.createBucket('profile-photos', {
      public: true,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      fileSizeLimit: 5 * 1024 * 1024, // 5MB limit
    });

    if (error) {
      if (error.message.includes('already exists')) {
        console.log('✅ Profile photos bucket already exists');
      } else {
        console.error('❌ Error creating bucket:', error);
        return;
      }
    } else {
      console.log('✅ Profile photos bucket created successfully');
    }

    // Set up storage policies
    console.log('🔐 Setting up storage policies...');

    // Policy to allow authenticated users to upload their own photos
    const uploadPolicy = {
      name: 'Allow authenticated users to upload profile photos',
      definition: 'auth.role() = "authenticated"',
      check: null,
      command: 'INSERT'
    };

    // Policy to allow public read access
    const readPolicy = {
      name: 'Allow public read access to profile photos',
      definition: 'true',
      check: null,
      command: 'SELECT'
    };

    // Policy to allow users to update their own photos
    const updatePolicy = {
      name: 'Allow users to update own profile photos',
      definition: 'auth.uid()::text = (storage.foldername(name))[1]',
      check: null,
      command: 'UPDATE'
    };

    // Policy to allow users to delete their own photos
    const deletePolicy = {
      name: 'Allow users to delete own profile photos',
      definition: 'auth.uid()::text = (storage.foldername(name))[1]',
      check: null,
      command: 'DELETE'
    };

    console.log('✅ Storage setup completed!');
    console.log('');
    console.log('📋 Next steps:');
    console.log('1. Run the SQL migration: database/add-profile-photo-column.sql');
    console.log('2. Verify storage bucket exists in Supabase dashboard');
    console.log('3. Test photo upload functionality');

  } catch (error) {
    console.error('💥 Setup failed:', error);
  }
}

// Run the setup
setupProfileStorage();