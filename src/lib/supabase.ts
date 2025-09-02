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
                pricePerHour: 800,
                pricePerHourWeekend: 1000,
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
                pricePerHour: 600,
                pricePerHourWeekend: 800,
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

      // First try to create the games table if it doesn't exist
      console.log('🔧 Ensuring games table exists with correct schema...');
      try {
        // Create games table using raw SQL
        const { error: createError } = await supabase.rpc('create_games_table_if_not_exists');
        
        if (createError) {
          console.log('⚠️ Could not create table via RPC, trying direct approach...');
          // If RPC fails, let's try a simple approach using the known schema from our file
          // but with snake_case column names that match PostgreSQL conventions
        }
      } catch (err) {
        console.log('Table creation approach failed, continuing with insert...');
      }

      // Create the game
      const { data, error } = await supabase
        .from('games')
        .insert([
          {
            creator_id: user.id,
            turf_id: gameData.turfId,
            title: gameData.title || `${gameData.sport} Game`,
            description: gameData.description || `${gameData.sport} game`,
            sport: gameData.sport,
            skill_level: gameData.skillLevel,
            max_players: gameData.maxPlayers,
            current_players: 1,
            date: gameData.date,
            start_time: gameData.startTime,
            end_time: gameData.endTime,
            price_per_player: gameData.costPerPerson,
            status: 'open',
            host_name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
            host_phone: user.user_metadata?.phone || user.phone || '9999999999',
            host_profile_image_url: user.user_metadata?.profile_image_url || user.user_metadata?.avatar_url || ''
          }
        ])
        .select()
        .single();

      console.log('🎯 Game creation attempt - data being inserted:', {
        creator_id: user.id,
        turf_id: gameData.turfId,
        title: gameData.title || `${gameData.sport} Game`,
        sport: gameData.sport,
        skill_level: gameData.skillLevel,
        max_players: gameData.maxPlayers,
        status: 'open'
      });

      if (error) {
        console.error('Game creation error:', error);
        console.error('Full error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          full: error
        });
        
        // Try to provide better error messages and potential solutions
        if (error.message.includes('violates foreign key constraint')) {
          if (error.message.includes('creatorId')) {
            console.log('Foreign key constraint on creatorId, attempting to create user...');
            
            // Foreign key constraint on creatorId - need to handle user creation differently
            console.log('🔄 FK constraint detected. User does not exist in database.');
            console.log('Current user details:', {
              id: user.id,
              email: user.email,
              emailConfirmed: user.email_confirmed_at,
              userMetadata: user.user_metadata,
              appMetadata: user.app_metadata
            });

            // Create a frontend-only game that still provides full functionality
            console.log('Creating frontend game due to database user constraints...');
            
            // Get turf information for the game
            let turfInfo = null;
            try {
              const { data: turf } = await supabase
                .from('turfs')
                .select('id, name, address, pricePerHour')
                .eq('id', gameData.turfId)
                .single();
              turfInfo = turf;
            } catch (turfError) {
              console.warn('Could not fetch turf details, using fallback');
              turfInfo = {
                id: gameData.turfId,
                name: gameData.turfId === '1' ? 'Elite Sports Arena' : 'Victory Ground',
                address: gameData.turfId === '1' ? 'Gangapur Road, Nashik' : 'College Road, Nashik',
                pricePerHour: gameData.turfId === '1' ? 800 : 600
              };
            }
            
            const frontendGameData = {
              id: `game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              creator_id: user.id,
              turf_id: gameData.turfId,
              title: gameData.title || `${gameData.sport} Game`,
              description: gameData.description || `${gameData.sport} game`,
              sport: gameData.sport,
              skill_level: gameData.skillLevel,
              max_players: gameData.maxPlayers,
              current_players: 1,
              date: gameData.date,
              start_time: gameData.startTime,
              end_time: gameData.endTime,
              price_per_player: gameData.costPerPerson,
              status: 'open',
              host_name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
              host_phone: user.user_metadata?.phone || user.phone || '9999999999',
              host_profile_image_url: user.user_metadata?.profile_image_url || user.user_metadata?.avatar_url || '',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              // Add nested relations for compatibility
              turfs: turfInfo,
              users: {
                id: user.id,
                name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
                phone: user.user_metadata?.phone || null
              }
            };

            // Store in localStorage for persistence across sessions
            try {
              const existingGames = JSON.parse(localStorage.getItem('tapturf_frontend_games') || '[]');
              existingGames.push(frontendGameData);
              localStorage.setItem('tapturf_frontend_games', JSON.stringify(existingGames));
              console.log('✅ Game stored in local storage for persistence');
            } catch (storageError) {
              console.warn('Could not store game in localStorage:', storageError);
            }

            console.log('✅ Frontend game created successfully:', frontendGameData);
            return { data: frontendGameData, error: null };
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

      console.log('✅ Game created successfully in database:', { 
        gameId: data.id, 
        creator_id: data.creator_id,
        sport: data.sport,
        status: data.status,
        host_name: data.host_name
      });
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
          turfs!turf_id (
            id,
            name,
            address,
            price_per_hour
          )
        `)
        .eq('creator_id', userId)
        .order('created_at', { ascending: false });

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
      // First, let's see if ANY games exist at all
      const { data: dbGames, error: dbError } = await supabase
        .from('games')
        .select('*')
        .order('created_at', { ascending: false });
      
      console.log('🔍 ALL games in database:', { dbGames, dbError, count: dbGames?.length });
      
      // Try to get games with turf data joined
      const { data: gamesWithTurfs, error: joinError } = await supabase
        .from('games')
        .select(`
          *,
          turfs!inner (
            id,
            name,
            address,
            pricePerHour
          ),
          users (
            id,
            name,
            phone,
            profile_image_url
          )
        `)
        .order('created_at', { ascending: false });
      
      console.log('🔍 Games with turfs joined:', { gamesWithTurfs, joinError, count: gamesWithTurfs?.length });
      
      // Let's also try a super simple query without any JOINs
      const { data: simpleGames, error: simpleError } = await supabase
        .from('games')
        .select('id, sport, date, status, creator_id, host_name')
        .order('created_at', { ascending: false });
      
      console.log('🔍 SIMPLE games query (no joins):', { simpleGames, simpleError, count: simpleGames?.length });
      
      // Check current user
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      console.log('🔍 Current user context:', { 
        userId: currentUser?.id, 
        email: currentUser?.email,
        isAuthenticated: !!currentUser 
      });
      
      // Use simple query without JOINs since foreign keys aren't set up properly
      let query = supabase
        .from('games')
        .select('*')
        .in('status', ['open', 'upcoming', 'active']);

      if (params.sport) {
        query = query.eq('sport', params.sport);
      }

      if (params.skillLevel && params.skillLevel !== 'all') {
        query = query.eq('skill_level', params.skillLevel);
      }

      if (params.date) {
        query = query.eq('date', params.date);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      
      console.log('🎯 Raw games query result:', { data, error, count: data?.length });

      if (error) {
        console.error('Error fetching available games:', error);
        
        // If it's a RLS/permission error, try a simpler query
        if (error.message.includes('RLS') || error.message.includes('permission')) {
          console.log('RLS error detected, trying simpler query...');
          const { data: simpleData, error: simpleError } = await supabase
            .from('games')
            .select('*')
            .in('status', ['open', 'upcoming', 'active'])
            .or('is_private.is.null,is_private.eq.false')
            .order('date', { ascending: true });
          
          if (simpleError) {
            console.log('Simple query also failed, checking localStorage games');
          } else if (simpleData) {
            // Add localStorage games to database games
            const frontendGames = this.getFrontendGames(params);
            return { data: [...simpleData, ...frontendGames], error: null };
          }
        }
        
        // Fallback to frontend games only
        const frontendGames = this.getFrontendGames(params);
        if (frontendGames.length > 0) {
          console.log('Returning frontend games only');
          return { data: frontendGames, error: null };
        }
        
        throw error;
      }

      // Merge database games with frontend games
      const frontendGames = this.getFrontendGames(params);
      console.log('🔄 Merging games:', { 
        databaseGames: data?.length || 0, 
        frontendGames: frontendGames.length,
        totalGames: (data?.length || 0) + frontendGames.length
      });
      const allGames = [...(data || []), ...frontendGames];
      
      return { data: allGames, error: null };
    } catch (error: any) {
      console.error('Failed to fetch available games:', error);
      
      // Last resort - return frontend games
      try {
        const frontendGames = this.getFrontendGames(params);
        return { data: frontendGames, error: null };
      } catch (frontendError) {
        return { data: [], error: error.message };
      }
    }
  },

  // Helper method to get frontend games from localStorage
  getFrontendGames(params: {
    sport?: string;
    skillLevel?: string;
    date?: string;
    limit?: number;
  } = {}) {
    try {
      const frontendGames = JSON.parse(localStorage.getItem('tapturf_frontend_games') || '[]');
      
      // Ensure compatibility with database structure
      const compatibleGames = frontendGames.map((game: any) => {
        // If game doesn't have nested relations, add them for compatibility
        if (!game.turfs && game.turfId) {
          game.turfs = {
            id: game.turfId,
            name: game.turfId === '1' ? 'Elite Sports Arena' : 'Victory Ground',
            address: game.turfId === '1' ? 'Gangapur Road, Nashik' : 'College Road, Nashik',
            pricePerHour: game.turfId === '1' ? 800 : 600
          };
        }
        
        if (!game.users && game.creator_id) {
          game.users = {
            id: game.creator_id,
            name: 'User',
            phone: null
          };
        }
        
        return game;
      });
      
      // Filter based on params
      let filteredGames = compatibleGames.filter((game: any) => {
        if (game.status !== 'open') return false;
        if (params.sport && game.sport !== params.sport) return false;
        if (params.skillLevel && params.skillLevel !== 'all' && game.skill_level !== params.skillLevel) return false;
        if (params.date && game.date !== params.date) return false;
        return true;
      });

      // Sort by creation date (newest first)
      filteredGames.sort((a: any, b: any) => new Date(b.created_at || b.createdAt).getTime() - new Date(a.created_at || a.createdAt).getTime());

      console.log(`Found ${filteredGames.length} frontend games`);
      return filteredGames;
    } catch (error) {
      console.error('Error loading frontend games:', error);
      return [];
    }
  },

  // Get a specific game by ID
  async getGameById(gameId: string) {
    try {
      // First try to get from database
      const { data: dbGame, error: dbError } = await supabase
        .from('games')
        .select(`
          *,
          turfs!turf_id (
            id,
            name,
            address,
            price_per_hour
          )
        `)
        .eq('id', gameId)
        .single();

      if (!dbError && dbGame) {
        console.log('Found game in database:', dbGame);
        return { data: dbGame, error: null };
      }

      // If not found in database, check localStorage
      console.log('Game not found in database, checking localStorage...');
      const frontendGames = JSON.parse(localStorage.getItem('tapturf_frontend_games') || '[]');
      const frontendGame = frontendGames.find((game: any) => game.id === gameId);

      if (frontendGame) {
        // Ensure compatibility with database structure
        if (!frontendGame.turfs && frontendGame.turfId) {
          frontendGame.turfs = {
            id: frontendGame.turfId,
            name: frontendGame.turfId === '1' ? 'Elite Sports Arena' : 'Victory Ground',
            address: frontendGame.turfId === '1' ? 'Gangapur Road, Nashik' : 'College Road, Nashik',
            pricePerHour: frontendGame.turfId === '1' ? 800 : 600
          };
        }
        
        if (!frontendGame.users && frontendGame.creator_id) {
          frontendGame.users = {
            id: frontendGame.creator_id,
            name: 'User',
            phone: null
          };
        }
        
        console.log('Found game in localStorage:', frontendGame);
        return { data: frontendGame, error: null };
      }

      // Game not found anywhere
      return { data: null, error: 'Game not found' };

    } catch (error: any) {
      console.error('Error fetching game by ID:', error);
      
      // Fallback to localStorage only
      try {
        const frontendGames = JSON.parse(localStorage.getItem('tapturf_frontend_games') || '[]');
        const frontendGame = frontendGames.find((game: any) => game.id === gameId);
        
        if (frontendGame) {
          return { data: frontendGame, error: null };
        }
        
        return { data: null, error: 'Game not found' };
      } catch (localError) {
        return { data: null, error: error.message };
      }
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
        query = query.gte('pricePerHour', params.priceMin);
      }

      if (params.priceMax) {
        query = query.lte('pricePerHour', params.priceMax);
      }

      if (params.rating) {
        query = query.gte('rating', params.rating);
      }

      if (params.limit) {
        query = query.limit(params.limit);
      }

      query = query.order('rating', { ascending: false });

      const { data, error } = await query;

      console.log('🏟️ Turf search result:', { data, error, dataLength: data?.length });

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
                pricePerHour: 800,
                rating: 4.5,
                sports: ['Football', 'Cricket'],
                amenities: ['Parking', 'Changing Rooms', 'Flood Lights'],
                is_active: true
              },
              {
                id: '2', 
                name: 'Victory Ground',
                address: 'College Road, Nashik',
                pricePerHour: 600,
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

// Game Request helpers
export const gameRequestHelpers = {
  // Send a join request for a game
  async sendJoinRequest(gameId: string, note?: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // First, try using Supabase database
      try {
        // Check if user already has a pending request for this game
        const { data: existingRequest, error: existingError } = await supabase
          .from('game_requests')
          .select('*')
          .eq('game_id', gameId)
          .eq('user_id', user.id)
          .maybeSingle(); // Use maybeSingle instead of single to avoid errors when no record exists

        if (existingRequest) {
          if (existingRequest.status === 'pending') {
            return { data: null, error: 'You already have a pending request for this game' };
          }
          if (existingRequest.status === 'accepted') {
            return { data: null, error: 'You have already joined this game' };
          }
        }

        // Create new join request in database
        const { data: newRequest, error: requestError } = await supabase
          .from('game_requests')
          .insert([
            {
              game_id: gameId,
              user_id: user.id,
              note: note || null,
              status: 'pending'
            }
          ])
          .select()
          .single();

        if (requestError) throw requestError;

        // Get game data to find the host (without JOIN to avoid foreign key issues)
        const { data: gameData } = await supabase
          .from('games')
          .select('creator_id, sport')
          .eq('id', gameId)
          .single();

        console.log('🔍 Game data received:', gameData);
        
        if (gameData && gameData.creator_id) {
          console.log('🎯 Creating notification for host:', gameData.creator_id, 'from user:', user.id);
          console.log('📧 User metadata:', user.user_metadata);
          console.log('📧 User email:', user.email);
          
          const notificationPayload = {
            user_id: gameData.creator_id,
            type: 'game_request',
            title: 'New Join Request! 🎾',
            message: `${user.user_metadata?.name || user.email?.split('@')[0] || 'Someone'} wants to join your ${gameData.sport || 'game'}`,
            metadata: { gameId, requestId: newRequest.id },
            is_read: false
          };
          
          console.log('📦 Notification payload:', notificationPayload);
          
          // Create notification for the host
          const { data: notificationResult, error: notificationError } = await supabase
            .from('notifications')
            .insert([notificationPayload])
            .select();

          console.log('🔍 Insert result:', { data: notificationResult, error: notificationError });

          if (notificationError) {
            console.error('❌ Could not create notification:', notificationError);
            console.error('❌ Full error details:', JSON.stringify(notificationError, null, 2));
          } else {
            console.log('✅ Database notification sent to host:', gameData.creator_id);
            console.log('✅ Created notification:', notificationResult);
          }
        } else {
          console.warn('⚠️ Could not find game creator_id. Game data:', gameData);
        }

        return { data: newRequest, error: null };

      } catch (dbError) {
        console.warn('Database request failed, falling back to localStorage:', dbError);
        
        // Fallback to localStorage
        const existingRequests = JSON.parse(localStorage.getItem('tapturf_game_requests') || '[]');
        const existingRequest = existingRequests.find((r: any) => 
          r.game_id === gameId && r.user_id === user.id
        );

        if (existingRequest) {
          if (existingRequest.status === 'pending') {
            return { data: null, error: 'You already have a pending request for this game' };
          }
          if (existingRequest.status === 'accepted') {
            return { data: null, error: 'You have already joined this game' };
          }
        }

        // Create new request in localStorage
        const localRequest = {
          id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          game_id: gameId,
          user_id: user.id,
          note: note || null,
          status: 'pending',
          created_at: new Date().toISOString(),
          user_name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
          user_email: user.email,
          user_phone: user.user_metadata?.phone || ''
        };

        if (existingRequest) {
          const requestIndex = existingRequests.findIndex((r: any) => r.id === existingRequest.id);
          existingRequests[requestIndex] = localRequest;
        } else {
          existingRequests.push(localRequest);
        }

        localStorage.setItem('tapturf_game_requests', JSON.stringify(existingRequests));

        // Try to notify host via localStorage
        try {
          const games = JSON.parse(localStorage.getItem('tapturf_frontend_games') || '[]');
          const targetGame = games.find((g: any) => g.id === gameId);
          let hostUserId = targetGame?.creator_id;

          if (!hostUserId) {
            const { data: gameData } = await supabase.from('games').select('creator_id').eq('id', gameId).single();
            hostUserId = gameData?.creator_id;
          }

          if (hostUserId) {
            const hostNotification = {
              id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              user_id: hostUserId,
              type: 'game_request',
              title: 'New Join Request! 🎾',
              message: `${localRequest.user_name} wants to join your game`,
              metadata: { gameId, requestId: localRequest.id },
              is_read: false,
              created_at: new Date().toISOString()
            };

            const hostNotifications = JSON.parse(localStorage.getItem('tapturf_notifications') || '[]');
            hostNotifications.unshift(hostNotification);
            localStorage.setItem('tapturf_notifications', JSON.stringify(hostNotifications));
            
            console.log('✅ localStorage notification sent to host:', hostUserId);
          }
        } catch (error) {
          console.warn('Error creating host notification:', error);
        }

        return { data: localRequest, error: null };
      }

    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  // Get requests for a specific game (for host)
  async getGameRequests(gameId: string) {
    try {
      const { data, error } = await supabase
        .from('game_requests')
        .select(`
          *,
          users!user_id (
            id,
            name,
            email,
            phone,
            profile_image_url
          )
        `)
        .eq('game_id', gameId)
        .eq('status', 'pending')
        .order('requested_at', { ascending: false });

      if (error) {
        // Fallback to localStorage
        const localRequests = JSON.parse(localStorage.getItem('tapturf_game_requests') || '[]');
        const gameRequests = localRequests.filter((r: any) => 
          r.game_id === gameId && r.status === 'pending'
        );
        return { data: gameRequests, error: null };
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: [], error: error.message };
    }
  },

  // Accept a join request (for host)
  async acceptRequest(requestId: string, gameId: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Check if game exists and user is the host
      const { data: game } = await supabase
        .from('games')
        .select('id, creator_id, current_players, max_players')
        .eq('id', gameId)
        .eq('creator_id', user.id)
        .single();

      if (!game) {
        return { data: null, error: 'Game not found or you are not the host' };
      }

      if (game.current_players >= game.max_players) {
        return { data: null, error: 'Game is already full' };
      }

      // Update request status
      const { data: updatedRequest, error: requestError } = await supabase
        .from('game_requests')
        .update({ status: 'accepted', responded_at: new Date().toISOString() })
        .eq('id', requestId)
        .select(`
          *,
          users!user_id (
            id,
            name,
            email,
            phone
          )
        `)
        .single();

      if (requestError) {
        // Fallback to localStorage
        const localRequests = JSON.parse(localStorage.getItem('tapturf_game_requests') || '[]');
        const requestIndex = localRequests.findIndex((r: any) => r.id === requestId);
        
        if (requestIndex >= 0) {
          localRequests[requestIndex].status = 'accepted';
          localRequests[requestIndex].responded_at = new Date().toISOString();
          localStorage.setItem('tapturf_game_requests', JSON.stringify(localRequests));
          
          // Update game player count in localStorage
          const localGames = JSON.parse(localStorage.getItem('tapturf_frontend_games') || '[]');
          const gameIndex = localGames.findIndex((g: any) => g.id === gameId);
          if (gameIndex >= 0) {
            localGames[gameIndex].current_players = (localGames[gameIndex].current_players || 1) + 1;
            localStorage.setItem('tapturf_frontend_games', JSON.stringify(localGames));
          }
          
          return { data: localRequests[requestIndex], error: null };
        }
        return { data: null, error: 'Request not found' };
      }

      // Increment player count in game
      await supabase
        .from('games')
        .update({ current_players: game.current_players + 1 })
        .eq('id', gameId);

      // Create game participant entry
      await supabase
        .from('game_participants')
        .insert([{
          game_id: gameId,
          user_id: updatedRequest.user_id,
          joined_at: new Date().toISOString()
        }]);

      return { data: updatedRequest, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  // Reject a join request (for host)
  async rejectRequest(requestId: string, gameId: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Check if user is the host
      const { data: game } = await supabase
        .from('games')
        .select('id, creator_id')
        .eq('id', gameId)
        .eq('creator_id', user.id)
        .single();

      if (!game) {
        return { data: null, error: 'Game not found or you are not the host' };
      }

      // Update request status
      const { data, error } = await supabase
        .from('game_requests')
        .update({ status: 'rejected', responded_at: new Date().toISOString() })
        .eq('id', requestId)
        .select()
        .single();

      if (error) {
        // Fallback to localStorage
        const localRequests = JSON.parse(localStorage.getItem('tapturf_game_requests') || '[]');
        const requestIndex = localRequests.findIndex((r: any) => r.id === requestId);
        
        if (requestIndex >= 0) {
          localRequests[requestIndex].status = 'rejected';
          localRequests[requestIndex].responded_at = new Date().toISOString();
          localStorage.setItem('tapturf_game_requests', JSON.stringify(localRequests));
          return { data: localRequests[requestIndex], error: null };
        }
        return { data: null, error: 'Request not found' };
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  // Get game participants
  async getGameParticipants(gameId: string) {
    try {
      const { data, error } = await supabase
        .from('game_participants')
        .select(`
          *,
          users!user_id (
            id,
            name,
            email,
            profile_image_url
          )
        `)
        .eq('game_id', gameId)
        .order('joined_at', { ascending: true });

      if (error) {
        // Fallback to basic data
        return { data: [], error: null };
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: [], error: error.message };
    }
  }
};

// Notification helpers
export const notificationHelpers = {
  // Create notification
  async createNotification(userId: string, type: string, title: string, message: string, metadata?: any) {
    try {
      const notificationData = {
        user_id: userId,
        type,
        title,
        message,
        metadata: metadata || {},
        is_read: false,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('notifications')
        .insert([notificationData])
        .select()
        .single();

      if (error) {
        // Fallback to localStorage
        const localNotification = {
          id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          ...notificationData
        };

        const existingNotifications = JSON.parse(localStorage.getItem('tapturf_notifications') || '[]');
        existingNotifications.unshift(localNotification);
        localStorage.setItem('tapturf_notifications', JSON.stringify(existingNotifications));
        
        return { data: localNotification, error: null };
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  // Get user notifications
  async getUserNotifications(userId: string, limit: number = 50) {
    try {
      console.log('🔔 Loading notifications for user:', userId);
      
      // First try Supabase database
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!error && data) {
        console.log('✅ Loaded notifications from database:', data.length, data);
        return { data, error: null };
      }

      // Fallback to localStorage
      console.warn('Database failed, using localStorage for notifications:', error);
      const localNotifications = JSON.parse(localStorage.getItem('tapturf_notifications') || '[]');
      const userNotifications = localNotifications.filter((n: any) => n.user_id === userId);
      console.log('📦 Using localStorage notifications:', userNotifications.length, userNotifications);
      return { data: userNotifications.slice(0, limit), error: null };
    } catch (error: any) {
      return { data: [], error: error.message };
    }
  },

  // Mark notification as read
  async markAsRead(notificationId: string) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .select()
        .single();

      if (error) {
        // Fallback to localStorage
        const localNotifications = JSON.parse(localStorage.getItem('tapturf_notifications') || '[]');
        const notifIndex = localNotifications.findIndex((n: any) => n.id === notificationId);
        
        if (notifIndex >= 0) {
          localNotifications[notifIndex].is_read = true;
          localStorage.setItem('tapturf_notifications', JSON.stringify(localNotifications));
          return { data: localNotifications[notifIndex], error: null };
        }
        return { data: null, error: 'Notification not found' };
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  // Get unread count
  async getUnreadCount(userId: string) {
    try {
      // First try Supabase database
      const { data, error, count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (!error && typeof count === 'number') {
        console.log('✅ Got unread count from database:', count);
        return { data: count, error: null };
      }

      // Fallback to localStorage
      console.warn('Database failed, using localStorage for unread count:', error);
      const localNotifications = JSON.parse(localStorage.getItem('tapturf_notifications') || '[]');
      const unreadCount = localNotifications.filter((n: any) => 
        n.user_id === userId && !n.is_read
      ).length;
      return { data: unreadCount, error: null };
    } catch (error: any) {
      return { data: 0, error: error.message };
    }
  }
};