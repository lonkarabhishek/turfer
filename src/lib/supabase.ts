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

      // CRITICAL: Ensure user exists in users table to satisfy foreign key constraint
      // Due to RLS policies, we'll attempt user creation and let the game creation fail if user doesn't exist
      console.log('Ensuring user exists for game creation...', { userId: user.id, email: user.email });

      // Verify turf exists before creating game, or create default ones if needed
      let { data: turfExists } = await supabase
        .from('turfs')
        .select('id')
        .eq('id', gameData.turfId)
        .single();

      if (!turfExists) {
        console.warn(`Selected venue (${gameData.turfId}) does not exist. Checking if we need to seed default turfs...`);
        
        // Check if ANY turfs exist
        const { data: anyTurfs } = await supabase
          .from('turfs')
          .select('id')
          .limit(1);

        if (!anyTurfs || anyTurfs.length === 0) {
          console.log('No turfs exist in database. Creating default turfs...');
          // Create some default turfs to satisfy foreign key constraints
          const { data: createdTurfs } = await supabase
            .from('turfs')
            .insert([
              {
                id: '1',
                owner_id: user.id, // Use current user as owner for now
                name: 'Elite Sports Arena',
                address: 'Gangapur Road, Nashik',
                description: 'Premium sports facility with excellent amenities',
                sports: ['Football', 'Cricket'],
                amenities: ['Parking', 'Changing Rooms', 'Flood Lights'],
                price_per_hour: 800,
                price_per_hour_weekend: 1000,
                operating_hours: {
                  "monday": {"open": "06:00", "close": "22:00"},
                  "tuesday": {"open": "06:00", "close": "22:00"},
                  "wednesday": {"open": "06:00", "close": "22:00"},
                  "thursday": {"open": "06:00", "close": "22:00"},
                  "friday": {"open": "06:00", "close": "22:00"},
                  "saturday": {"open": "06:00", "close": "23:00"},
                  "sunday": {"open": "06:00", "close": "23:00"}
                },
                contact_info: {"phone": "9999999999", "email": "info@elitesportsarena.com"},
                is_active: true
              },
              {
                id: '2',
                owner_id: user.id,
                name: 'Victory Ground',
                address: 'College Road, Nashik', 
                description: 'Community sports ground with basic facilities',
                sports: ['Football', 'Cricket'],
                amenities: ['Parking', 'Rest Area'],
                price_per_hour: 600,
                price_per_hour_weekend: 800,
                operating_hours: {
                  "monday": {"open": "06:00", "close": "21:00"},
                  "tuesday": {"open": "06:00", "close": "21:00"},
                  "wednesday": {"open": "06:00", "close": "21:00"},
                  "thursday": {"open": "06:00", "close": "21:00"},
                  "friday": {"open": "06:00", "close": "21:00"},
                  "saturday": {"open": "06:00", "close": "22:00"},
                  "sunday": {"open": "06:00", "close": "22:00"}
                },
                contact_info: {"phone": "9999999998", "email": "info@victoryground.com"},
                is_active: true
              }
            ])
            .select();

          if (createdTurfs) {
            console.log('✅ Default turfs created successfully');
            // Now check if our selected turf exists
            turfExists = createdTurfs.find(t => t.id === gameData.turfId);
          }
        }

        if (!turfExists) {
          throw new Error(`Selected venue (${gameData.turfId}) is not available. Please refresh the page and try selecting a venue again.`);
        }
      }

      console.log('✅ Turf verified, proceeding with game creation...');

      // Create the game
      const { data, error } = await supabase
        .from('games')
        .insert([
          {
            host_id: user.id,
            turf_id: gameData.turfId,
            description: gameData.description || `${gameData.format} game`,
            sport: gameData.sport,
            format: gameData.format,
            skill_level: gameData.skillLevel,
            max_players: gameData.maxPlayers,
            current_players: 1,
            date: gameData.date,
            start_time: gameData.startTime,
            end_time: gameData.endTime,
            cost_per_person: gameData.costPerPerson,
            status: 'open',
            is_private: gameData.isPrivate || false,
            notes: gameData.notes || null
          }
        ])
        .select()
        .single();

      if (error) {
        console.error('Game creation error:', error);
        console.error('Full error details:', error);
        
        // Try to provide better error messages and potential solutions
        if (error.message.includes('violates foreign key constraint')) {
          if (error.message.includes('host_id')) {
            console.log('Foreign key constraint on host_id, attempting to create user...');
            
            // Try to create the user now since the constraint failed
            try {
              const { error: userCreateError } = await supabase
                .from('users')
                .insert([
                  {
                    id: user.id,
                    name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
                    email: user.email,
                    password: '', // Required by schema
                    phone: user.user_metadata?.phone || null,
                    role: 'user',
                    is_verified: user.email_confirmed_at ? true : false
                  }
                ]);

              if (userCreateError) {
                console.error('Failed to create user after FK constraint error:', userCreateError);
                throw new Error('Unable to set up user account. Please contact support.');
              }

              console.log('✅ User created after FK error, retrying game creation...');
              
              // Retry game creation
              const { data: retryData, error: retryError } = await supabase
                .from('games')
                .insert([
                  {
                    host_id: user.id,
                    turf_id: gameData.turfId,
                    description: gameData.description || `${gameData.format} game`,
                    sport: gameData.sport,
                    format: gameData.format,
                    skill_level: gameData.skillLevel,
                    max_players: gameData.maxPlayers,
                    current_players: 1,
                    date: gameData.date,
                    start_time: gameData.startTime,
                    end_time: gameData.endTime,
                    cost_per_person: gameData.costPerPerson,
                    status: 'open',
                    is_private: gameData.isPrivate || false,
                    notes: gameData.notes || null
                  }
                ])
                .select()
                .single();

              if (retryError) {
                throw new Error(`Game creation failed after user setup: ${retryError.message}`);
              }

              console.log('🎉 Game successfully created after user setup retry:', retryData);
              
              // Continue with the rest of the function
              try {
                await supabase
                  .from('game_participants')
                  .insert([
                    {
                      game_id: retryData.id,
                      user_id: user.id
                    }
                  ]);
              } catch (participantError) {
                console.warn('Could not add participant (table may not exist):', participantError);
              }

              return { data: retryData, error: null };

            } catch (retryError: any) {
              throw new Error(`User account setup failed: ${retryError.message}. Please contact support.`);
            }
          } else if (error.message.includes('turf_id')) {
            throw new Error('Selected venue is not available. Please choose a different venue.');
          } else {
            throw new Error('Database relationship error. Please try again or contact support.');
          }
        } else if (error.message.includes('relation "games" does not exist')) {
          throw new Error('Game database is not set up. Please contact support.');
        } else if (error.message.includes('permission denied') || error.message.includes('RLS')) {
          throw new Error('You do not have permission to create games. Please ensure you are logged in.');
        } else {
          throw new Error(`Failed to create game: ${error.message}`);
        }
      }

      console.log('🎉 Game successfully created in database:', data);

      // Try to add creator as first participant (optional)
      try {
        await supabase
          .from('game_participants')
          .insert([
            {
              game_id: data.id,
              user_id: user.id
            }
          ]);
      } catch (participantError) {
        console.warn('Could not add participant (table may not exist):', participantError);
        // Continue anyway - game was created successfully
      }

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
          users:host_id (
            id,
            name,
            phone
          )
        `)
        .eq('host_id', userId)
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
          users:host_id (
            id,
            name,
            phone
          )
        `)
        .eq('status', 'open');

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
        console.error('Error fetching available games:', error);
        
        // If it's a RLS/permission error, try a simpler query
        if (error.message.includes('RLS') || error.message.includes('permission')) {
          console.log('RLS error detected, trying simpler query...');
          const { data: simpleData, error: simpleError } = await supabase
            .from('games')
            .select('*')
            .eq('status', 'open')
            .or('is_private.is.null,is_private.eq.false')
            .order('date', { ascending: true });
          
          if (simpleError) {
            console.log('Simple query also failed, returning empty array');
            return { data: [], error: null };
          }
          return { data: simpleData, error: null };
        }
        
        throw error;
      }

      return { data, error: null };
    } catch (error: any) {
      console.error('Failed to fetch available games:', error);
      return { data: [], error: error.message };
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
        console.error('Turf search error:', error);
        // If turfs table doesn't exist, return mock data for development
        if (error.message.includes('relation "turfs" does not exist')) {
          console.log('Turfs table not found, returning mock data');
          return { 
            data: [
              {
                id: '1',
                name: 'Elite Sports Arena',
                address: 'Gangapur Road, Nashik',
                price_per_hour: 800,
                rating: 4.5,
                sports: ['Football', 'Cricket'],
                amenities: ['Parking', 'Changing Rooms', 'Flood Lights'],
                is_active: true
              },
              {
                id: '2', 
                name: 'Victory Ground',
                address: 'College Road, Nashik',
                price_per_hour: 600,
                rating: 4.2,
                sports: ['Football', 'Cricket'],
                amenities: ['Parking', 'Rest Area'],
                is_active: true
              }
            ], 
            error: null 
          };
        }
        throw error;
      }

      return { data, error: null };
    } catch (error: any) {
      console.error('Turf search failed:', error);
      return { data: [], error: error.message };
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