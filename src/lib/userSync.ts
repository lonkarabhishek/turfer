import { supabase } from './supabase';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  password?: string; // Required by current DB schema (placeholder for Supabase Auth)
  phone?: string;
  role: 'user' | 'owner' | 'admin';
  profile_image_url?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Ensure user exists in the users table
 * This is called after authentication to sync auth.users data to our users table
 */
export async function ensureUserExists(): Promise<{ success: boolean; error?: string; user?: UserProfile }> {
  try {
    console.log('🔄 Ensuring user exists in users table...');

    // First check for our custom JWT auth (phone/PIN users)
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser.id) {
          console.log('✅ User already authenticated via phone/PIN:', parsedUser.name);
          // Phone/PIN users are already in the users table (created during signup)
          return {
            success: true,
            user: {
              id: parsedUser.id,
              name: parsedUser.name,
              email: parsedUser.email,
              phone: parsedUser.phone,
              role: parsedUser.role || 'user',
              profile_image_url: parsedUser.profile_image_url
            }
          };
        }
      } catch (e) {
        console.log('Could not parse stored user, trying Supabase Auth...');
      }
    }

    // Fall back to Supabase Auth (for email/password or OAuth users)
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

    if (authError || !authUser) {
      console.log('❌ No authenticated user found (neither custom JWT nor Supabase Auth)');
      return { success: false, error: 'Not authenticated' };
    }

    console.log('👤 Auth user:', authUser);

    // Check if user already exists in users table by ID (match auth.users.id)
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    if (existingUser) {
      console.log('✅ User already exists in users table:', existingUser);
      return { success: true, user: existingUser };
    }

    console.log('➕ Creating new user record...');

    // Extract user information from auth user
    const userData = {
      id: authUser.id, // CRITICAL: Use the same ID from auth.users
      email: authUser.email || '',
      password: 'supabase_auth', // Placeholder since Supabase Auth handles authentication
      name: authUser.user_metadata?.name ||
            authUser.user_metadata?.full_name ||
            authUser.user_metadata?.display_name ||
            authUser.email?.split('@')[0] ||
            'User',
      phone: authUser.user_metadata?.phone || authUser.phone || null,
      role: 'user' as const, // Use 'user' to match database constraint (default role)
      profile_image_url: authUser.user_metadata?.profile_image_url ||
                        authUser.user_metadata?.avatar_url ||
                        authUser.user_metadata?.picture ||
                        null
    };

    console.log('📝 User data to insert:', userData);

    // Insert user into users table with explicit ID
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([userData])
      .select()
      .single();

    if (insertError) {
      console.error('❌ Error creating user:', insertError);
      return { success: false, error: insertError.message };
    }

    console.log('✅ User created successfully:', newUser);
    return { success: true, user: newUser };

  } catch (error: any) {
    console.error('❌ Unexpected error in ensureUserExists:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update user profile in the users table
 */
export async function updateUserProfile(updates: Partial<Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>>): Promise<{ success: boolean; error?: string; user?: UserProfile }> {
  try {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    
    if (!authUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', authUser.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating user profile:', error);
      return { success: false, error: error.message };
    }

    return { success: true, user: updatedUser };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get user profile by ID
 */
export async function getUserById(userId: string): Promise<{ success: boolean; error?: string; user?: UserProfile }> {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching user by ID:', error);
      return { success: false, error: error.message };
    }

    return { success: true, user };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Sync all existing auth users to the users table (one-time migration)
 */
export async function syncAllUsersFromAuth(): Promise<{ success: boolean; error?: string; syncedCount?: number }> {
  try {
    console.log('🔄 Starting bulk user sync from auth.users...');
    
    // Note: This requires admin privileges, typically run from backend or Supabase dashboard
    // For client-side, we'll just ensure the current user exists
    const result = await ensureUserExists();
    
    if (result.success) {
      return { success: true, syncedCount: 1 };
    } else {
      return { success: false, error: result.error };
    }
    
  } catch (error: any) {
    console.error('❌ Error in bulk user sync:', error);
    return { success: false, error: error.message };
  }
}