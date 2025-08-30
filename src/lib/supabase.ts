import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://hwfsbpzercuoshodmnuf.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 2
    }
  }
});

// Profile photo helper functions
export const profilePhotoHelpers = {
  // Upload profile photo
  async uploadProfilePhoto(userId: string, file: File): Promise<{ url: string; error?: string }> {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/profile.${fileExt}`;

      // Upload file
      const { data, error } = await supabase.storage
        .from('profile-photos')
        .upload(fileName, file, {
          upsert: true,
          contentType: file.type,
        });

      if (error) {
        throw error;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(fileName);

      return { url: publicUrl };
    } catch (error: any) {
      return { url: '', error: error.message };
    }
  },

  // Delete profile photo
  async deleteProfilePhoto(userId: string, photoUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
      const fileName = photoUrl.split('/').pop();
      if (!fileName) {
        throw new Error('Invalid photo URL');
      }

      const { error } = await supabase.storage
        .from('profile-photos')
        .remove([`${userId}/${fileName}`]);

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // Generate profile photo URL
  getProfilePhotoUrl(userId: string, fileName: string): string {
    const { data: { publicUrl } } = supabase.storage
      .from('profile-photos')
      .getPublicUrl(`${userId}/${fileName}`);
    
    return publicUrl;
  }
};

// User profile helpers
export const userHelpers = {
  // Update user profile with photo URL
  async updateProfilePhoto(userId: string, photoUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('users')
        .update({ profile_image_url: photoUrl })
        .eq('id', userId);

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // Get user profile
  async getProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, phone, role, profile_image_url, created_at, updated_at')
        .eq('id', userId)
        .single();

      if (error) {
        throw error;
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }
};

// Game helpers
export const gameHelpers = {
  // Create a new game
  async createGame(gameData: {
    turfId: string;
    date: string;
    startTime: string;
    endTime: string;
    sport: string;
    format: string;
    skillLevel: 'beginner' | 'intermediate' | 'advanced' | 'all';
    maxPlayers: number;
    costPerPerson: number;
    description?: string;
    notes?: string;
    isPrivate?: boolean;
  }) {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Ensure user exists in our users table
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();

      if (!existingUser) {
        // Create user in our users table if they don't exist
        const { error: userError } = await supabase
          .from('users')
          .insert([
            {
              id: user.id,
              name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
              email: user.email,
              passwordHash: '', // Not needed for Supabase Auth users
              phone: user.user_metadata?.phone || null,
              role: 'user',
              isVerified: user.email_confirmed_at ? true : false,
              profile_image_url: null
            }
          ]);
        
        if (userError && !userError.message.includes('duplicate key')) {
          console.error('Error creating user:', userError);
          // Continue anyway, might be RLS issue
        }
      }

      // Create the game
      const { data, error } = await supabase
        .from('games')
        .insert([
          {
            creator_id: user.id,
            turf_id: gameData.turfId,
            title: `${gameData.format} at ${gameData.date}`,
            description: gameData.description || `${gameData.format} game`,
            sport: gameData.sport,
            skill_level: gameData.skillLevel,
            max_players: gameData.maxPlayers,
            current_players: 1,
            date: gameData.date,
            start_time: gameData.startTime,
            end_time: gameData.endTime,
            price_per_player: gameData.costPerPerson,
            game_type: 'casual',
            status: 'open',
            is_active: true
          }
        ])
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Add creator as first participant
      await supabase
        .from('game_participants')
        .insert([
          {
            game_id: data.id,
            user_id: user.id
          }
        ]);

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  // Get games for a user
  async getUserGames(userId: string) {
    try {
      const { data, error } = await supabase
        .from('games')
        .select(`
          *,
          turfs:turf_id (
            id,
            name,
            address
          ),
          users:creator_id (
            id,
            name,
            phone
          )
        `)
        .eq('creator_id', userId)
        .order('date', { ascending: true });

      if (error) {
        throw error;
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  // Get available games
  async getAvailableGames(params: {
    sport?: string;
    skillLevel?: string;
    date?: string;
    limit?: number;
  } = {}) {
    try {
      let query = supabase
        .from('games')
        .select(`
          *,
          turfs:turf_id (
            id,
            name,
            address,
            price_per_hour
          ),
          users:creator_id (
            id,
            name,
            phone
          )
        `)
        .eq('status', 'open')
        .eq('is_active', true);

      if (params.sport) {
        query = query.eq('sport', params.sport);
      }

      if (params.skillLevel && params.skillLevel !== 'all') {
        query = query.eq('skill_level', params.skillLevel);
      }

      if (params.date) {
        query = query.eq('date', params.date);
      }

      if (params.limit) {
        query = query.limit(params.limit);
      }

      query = query.order('date', { ascending: true });

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }
};

// Turf helpers
export const turfHelpers = {
  // Search turfs
  async searchTurfs(params: {
    query?: string;
    sport?: string;
    priceMin?: number;
    priceMax?: number;
    rating?: number;
    limit?: number;
  } = {}) {
    try {
      let query = supabase
        .from('turfs')
        .select('*')
        .eq('is_active', true);

      if (params.query) {
        query = query.or(`name.ilike.%${params.query}%,address.ilike.%${params.query}%`);
      }

      if (params.sport) {
        query = query.contains('sports', [params.sport]);
      }

      if (params.priceMin) {
        query = query.gte('price_per_hour', params.priceMin);
      }

      if (params.priceMax) {
        query = query.lte('price_per_hour', params.priceMax);
      }

      if (params.rating) {
        query = query.gte('rating', params.rating);
      }

      if (params.limit) {
        query = query.limit(params.limit);
      }

      query = query.order('rating', { ascending: false });

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  // Get turf by ID
  async getTurfById(id: string) {
    try {
      const { data, error } = await supabase
        .from('turfs')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        throw error;
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }
};