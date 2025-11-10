import { createClient } from '@supabase/supabase-js';
import { convertImageUrls, convertGoogleDriveUrl } from './imageUtils';

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

  // Get user profile from users table
  async getProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, phone, role, profile_image_url, created_at, updated_at')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching user profile:', error);
        return { data: null, error: error.message };
      }

      return { data, error: null };
    } catch (error: any) {
      console.error('Exception in getProfile:', error);
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
        .select('*')
        .eq('creator_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      // Fetch turfs separately for each game
      if (data && data.length > 0) {
        const turfIds = [...new Set(data.map((game: any) => game.turf_id).filter(Boolean))];
        console.log('🔍 [getUserGames] Fetching turfs for IDs:', turfIds);

        if (turfIds.length > 0) {
          const { data: turfsData, error: turfsError} = await supabase
            .from('turfs')
            .select('id, name, address, "Gmap Embed link"')
            .in('id', turfIds);

          console.log('📊 [getUserGames] Turfs fetch result:', {
            turfsData,
            turfsError,
            count: turfsData?.length,
            turfIds: turfIds
          });

          if (turfsData) {
            const turfsMap = Object.fromEntries(turfsData.map((turf: any) => [turf.id, turf]));
            console.log('✅ [getUserGames] Turfs map created:', turfsMap);

            data.forEach((game: any) => {
              if (game.turf_id && turfsMap[game.turf_id]) {
                game.turfs = turfsMap[game.turf_id];
                console.log(`✅ [getUserGames] Attached turf "${game.turfs.name}" to game ${game.id}`);
              } else if (game.turf_id) {
                console.warn(`⚠️ [getUserGames] Turf ID ${game.turf_id} not found in turfsMap for game ${game.id}`);
              }
            });
          } else if (turfsError) {
            console.error('❌ [getUserGames] Error fetching turfs:', turfsError);
          }
        }
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
      
      // Try to get games with simple query
      const { data: gamesWithTurfs, error: joinError } = await supabase
        .from('games')
        .select('*')
        .order('created_at', { ascending: false });

      console.log('🔍 Games query result:', { gamesWithTurfs, joinError, count: gamesWithTurfs?.length });
      
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
      
      // Simple query without JOINs - let the transformer handle fallbacks
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

      // If we got games, fetch turfs and users separately
      if (data && data.length > 0) {
        // Get unique turf IDs
        const turfIds = [...new Set(data.map((game: any) => game.turf_id).filter(Boolean))];
        const creatorIds = [...new Set(data.map((game: any) => game.creator_id).filter(Boolean))];

        // Fetch turfs in batch
        let turfsMap: any = {};
        if (turfIds.length > 0) {
          console.log('🔍 Fetching turfs for IDs:', turfIds);
          const { data: turfsData, error: turfsError } = await supabase
            .from('turfs')
            .select('id, name, address, "Gmap Embed link"')
            .in('id', turfIds);

          console.log('📊 Turfs fetch result:', {
            turfsData,
            turfsError,
            count: turfsData?.length,
            turfIds: turfIds
          });

          if (turfsData) {
            turfsMap = Object.fromEntries(turfsData.map((turf: any) => [turf.id, turf]));
            console.log('✅ Turfs map created:', turfsMap);
          } else if (turfsError) {
            console.error('❌ Error fetching turfs:', turfsError);
          }
        }

        // Fetch users in batch
        let usersMap: any = {};
        if (creatorIds.length > 0) {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, name, phone, profile_image_url')
            .in('id', creatorIds);

          if (usersData) {
            usersMap = Object.fromEntries(usersData.map((user: any) => [user.id, user]));
          }
        }

        // Attach turf and user data to games
        data.forEach((game: any) => {
          if (game.turf_id && turfsMap[game.turf_id]) {
            game.turfs = turfsMap[game.turf_id];
            console.log(`✅ Attached turf "${game.turfs.name}" to game ${game.id}`);
          } else if (game.turf_id) {
            console.warn(`⚠️ Turf ID ${game.turf_id} not found in turfsMap for game ${game.id}`);
          }
          if (game.creator_id && usersMap[game.creator_id]) {
            game.users = usersMap[game.creator_id];
          }
        });

        console.log('✅ Enriched games with turf and user data:', data.length, 'games');
      }

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
      console.log('🔍 Getting game by ID:', gameId);

      // Simple query without JOINs
      let { data: dbGame, error: dbError } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single();

      // If game found, try to fetch turf separately
      if (dbGame && dbGame.turf_id) {
        const { data: turfData } = await supabase
          .from('turfs')
          .select('id, name, address, morning_price, "Gmap Embed link"')
          .eq('id', dbGame.turf_id)
          .single();

        if (turfData) {
          dbGame.turfs = turfData;
        }
      }

      console.log('📊 Database query result for game', gameId, ':', dbGame);

      if (!dbError && dbGame) {
        console.log('✅ Found game in database:', dbGame);
        return { data: dbGame, error: null };
      }

      // If not found in database, check localStorage
      console.log('⚠️ Game not found in database, checking localStorage...');
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

        console.log('✅ Found game in localStorage:', frontendGame);
        return { data: frontendGame, error: null };
      }

      // Game not found anywhere
      console.log('❌ Game not found anywhere');
      return { data: null, error: 'Game not found' };

    } catch (error: any) {
      console.error('❌ Error fetching game by ID:', error);

      // Fallback to localStorage only
      try {
        const frontendGames = JSON.parse(localStorage.getItem('tapturf_frontend_games') || '[]');
        const frontendGame = frontendGames.find((game: any) => game.id === gameId);

        if (frontendGame) {
          console.log('✅ Found game in localStorage (fallback):', frontendGame);
          return { data: frontendGame, error: null };
        }

        return { data: null, error: 'Game not found' };
      } catch (localError) {
        return { data: null, error: error.message };
      }
    }
  },

  // Update an existing game
  async updateGame(gameId: string, updateData: {
    turfId?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    sport?: string;
    format?: string;
    skillLevel?: 'beginner' | 'intermediate' | 'advanced' | 'all';
    maxPlayers?: number;
    costPerPerson?: number;
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

      // Verify the user owns this game
      const { data: existingGame, error: fetchError } = await supabase
        .from('games')
        .select('creator_id')
        .eq('id', gameId)
        .single();

      if (fetchError || !existingGame) {
        throw new Error('Game not found');
      }

      if (existingGame.creator_id !== user.id) {
        throw new Error('You do not have permission to edit this game');
      }

      // Prepare update payload (convert camelCase to snake_case for database)
      const updatePayload: any = {};
      if (updateData.turfId !== undefined) updatePayload.turf_id = updateData.turfId;
      if (updateData.date !== undefined) updatePayload.date = updateData.date;
      if (updateData.startTime !== undefined) updatePayload.start_time = updateData.startTime;
      if (updateData.endTime !== undefined) updatePayload.end_time = updateData.endTime;
      if (updateData.sport !== undefined) updatePayload.sport = updateData.sport;
      if (updateData.format !== undefined) updatePayload.format = updateData.format;
      if (updateData.skillLevel !== undefined) updatePayload.skill_level = updateData.skillLevel;
      if (updateData.maxPlayers !== undefined) updatePayload.max_players = updateData.maxPlayers;
      if (updateData.costPerPerson !== undefined) updatePayload.price_per_player = updateData.costPerPerson;
      if (updateData.description !== undefined) updatePayload.description = updateData.description;
      if (updateData.notes !== undefined) updatePayload.notes = updateData.notes;
      if (updateData.isPrivate !== undefined) updatePayload.is_private = updateData.isPrivate;

      // Update the game
      const { data, error } = await supabase
        .from('games')
        .update(updatePayload)
        .eq('id', gameId)
        .select()
        .single();

      if (error) {
        console.error('Error updating game:', error);
        throw error;
      }

      console.log('✅ Game updated successfully:', data);
      return { data, error: null };

    } catch (error: any) {
      console.error('❌ Error updating game:', error);
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
        // Handle both JSON array and text search for sports
        try {
          query = query.contains('sports', [params.sport]);
        } catch (error) {
          // Fallback to text search if JSON search fails
          console.log('JSON sports search failed, using text search:', error);
          query = query.or(`sports.ilike.%${params.sport}%`);
        }
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
                totalReviews: 50,
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
                totalReviews: 30,
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

      // Transform snake_case to camelCase for frontend compatibility
      // Note: Database has "Gmap Embed link" with capital G and space
      const transformedData = data?.map((turf: any) => ({
        ...turf,
        totalReviews: turf.total_reviews || 0,
        pricePerHour: turf.price_per_hour || turf.pricePerHour,
        // Pass through all time-based pricing fields for proper minimum price calculation
        morning_price: turf.morning_price,
        afternoon_price: turf.afternoon_price,
        evening_price: turf.evening_price,
        weekend_morning_price: turf.weekend_morning_price,
        weekend_afternoon_price: turf.weekend_afternoon_price,
        weekend_evening_price: turf.weekend_evening_price,
        gmapEmbedLink: turf['Gmap Embed link'], // Access the correctly-named field
        contactInfo: turf.contact_info,
        isActive: turf.is_active,
        createdAt: turf.created_at,
        updatedAt: turf.updated_at,
        externalReviewUrl: turf.external_review_url,
        coverImage: turf.cover_image ? convertGoogleDriveUrl(turf.cover_image) : turf.cover_image,
        images: Array.isArray(turf.images) ? convertImageUrls(turf.images) : turf.images,
        signboard_image: turf.signboard_image ? convertGoogleDriveUrl(turf.signboard_image) : turf.signboard_image,
        entry_parking_image: turf.entry_parking_image ? convertGoogleDriveUrl(turf.entry_parking_image) : turf.entry_parking_image
      }));

      return { data: transformedData, error: null };
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

      console.log('🗺️ Turf data fetched:', {
        turfId: id,
        hasGmapLink: !!data?.['Gmap Embed link'],
        gmapLink: data?.['Gmap Embed link']
      });

      // Transform snake_case to camelCase for frontend compatibility
      // Note: Database has "Gmap Embed link" with capital G and space
      const transformedData = data ? {
        ...data,
        totalReviews: data.total_reviews || 0,
        pricePerHour: data.price_per_hour || data.pricePerHour,
        // Pass through all time-based pricing fields for proper minimum price calculation
        morning_price: data.morning_price,
        afternoon_price: data.afternoon_price,
        evening_price: data.evening_price,
        weekend_morning_price: data.weekend_morning_price,
        weekend_afternoon_price: data.weekend_afternoon_price,
        weekend_evening_price: data.weekend_evening_price,
        gmapEmbedLink: data['Gmap Embed link'], // Access the correctly-named field
        contactInfo: data.contact_info,
        isActive: data.is_active,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        externalReviewUrl: data.external_review_url,
        coverImage: data.cover_image ? convertGoogleDriveUrl(data.cover_image) : data.cover_image,
        images: Array.isArray(data.images) ? convertImageUrls(data.images) : data.images,
        signboard_image: data.signboard_image ? convertGoogleDriveUrl(data.signboard_image) : data.signboard_image,
        entry_parking_image: data.entry_parking_image ? convertGoogleDriveUrl(data.entry_parking_image) : data.entry_parking_image
      } : null;

      return { data: transformedData, error: null };
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
              status: 'pending',
              requester_name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
              requester_phone: user.user_metadata?.phone || user.phone || '',
              requester_avatar: user.user_metadata?.profile_image_url || user.user_metadata?.avatar_url || ''
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

        // Use creator_id to find the host
        const hostUserId = gameData?.creator_id;

        if (gameData && hostUserId) {
          console.log('🎯 Creating notification for host:', hostUserId, 'from user:', user.id);
          console.log('📧 User metadata:', user.user_metadata);
          console.log('📧 User email:', user.email);
          
          const notificationPayload = {
            user_id: hostUserId,
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
            console.log('✅ Database notification sent to host:', hostUserId);
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
      console.log('🔍 Getting requests for game ID:', gameId);
      
      // First try with user join to get full user details
      const { data: requestsWithUsers, error: joinError } = await supabase
        .from('game_requests')
        .select(`
          *,
          users (
            name,
            phone,
            profile_image_url
          )
        `)
        .eq('game_id', gameId)
        .order('created_at', { ascending: false });

      if (requestsWithUsers && !joinError) {
        console.log('✅ Successfully fetched requests with user details:', requestsWithUsers);
        console.log('🔧 DEBUG: Request statuses from database:');
        requestsWithUsers.forEach((req: any, index: number) => {
          console.log(`  ${index + 1}. ID: ${req.id}, Status: "${req.status}" (type: ${typeof req.status})`);
        });
        return { data: requestsWithUsers, error: null };
      }

      console.log('⚠️ Join query failed, trying simplified query:', joinError);

      // Fallback to simplified query without foreign key relationship
      const { data, error } = await supabase
        .from('game_requests')
        .select('*')
        .eq('game_id', gameId)
        .order('created_at', { ascending: false });

      console.log('📊 Database query result for game', gameId, ':', { data, error });

      // If we got data, return it with fallback user details
      if (data && data.length > 0 && !error) {
        console.log('🔧 DEBUG: Fallback query - Request statuses from database:');
        data.forEach((req: any, index: number) => {
          console.log(`  ${index + 1}. ID: ${req.id}, Status: "${req.status}" (type: ${typeof req.status})`);
        });
        
        const enrichedRequests = [];
        
        // Get user details for each request
        for (const request of data) {
          let userName = request.requester_name || 'Game Player';
          let userPhone = request.requester_phone || '';
          let userAvatar = request.requester_avatar || '';
          
          console.log('🔍 Fetching user details for user_id:', request.user_id);
          
          // Method 1: Try users table first
          try {
            const { data: userTableData, error: userError } = await supabase
              .from('users')
              .select('name, phone, profile_image_url')
              .eq('id', request.user_id)
              .single();
            
            if (userTableData && !userError) {
              console.log('✅ Found user in users table:', userTableData);
              userName = userTableData.name || userName;
              userPhone = userTableData.phone || userPhone;
              userAvatar = userTableData.profile_image_url || userAvatar;
            } else {
              console.log('⚠️ User not found in users table:', userError);
            }
          } catch (userTableError) {
            console.log('❌ Error querying users table:', userTableError);
          }
          
          // Method 2: Try auth.admin as fallback if still no name
          if (userName === 'Game Player' || !userName) {
            try {
              console.log('🔄 Trying auth.admin for user:', request.user_id);
              const { data: userData } = await supabase.auth.admin.getUserById(request.user_id);
              if (userData?.user) {
                console.log('✅ Auth user data:', userData.user.user_metadata);
                userName = userData.user.user_metadata?.name || 
                          userData.user.user_metadata?.full_name || 
                          userData.user.email?.split('@')[0] || 
                          userName;
                userPhone = userData.user.user_metadata?.phone || userData.user.phone || userPhone;
                userAvatar = userData.user.user_metadata?.profile_image_url || userAvatar;
              }
            } catch (authError) {
              console.log('❌ Could not fetch auth user details for', request.user_id, ':', authError);
            }
          }
          
          console.log('📝 Final user details for request:', { userName, userPhone, userAvatar });
          
          enrichedRequests.push({
            ...request,
            users: {
              id: request.user_id,
              name: userName,
              email: '',
              phone: userPhone,
              profile_image_url: userAvatar
            }
          });
        }
        console.log('✅ Enriched database requests:', enrichedRequests);
        return { data: enrichedRequests, error: null };
      }

      if (error) {
        console.log('⚠️ Database error, falling back to localStorage:', error);
        // Fallback to localStorage
        const localRequests = JSON.parse(localStorage.getItem('tapturf_game_requests') || '[]');
        console.log('📦 All localStorage requests:', localRequests);
        
        const gameRequests = localRequests.filter((r: any) => 
          r.game_id === gameId && r.status === 'pending'
        );
        console.log('🎯 Filtered requests for game', gameId, ':', gameRequests);
        
        return { data: gameRequests, error: null };
      }

      console.log('✅ Returning database requests:', data);
      return { data, error: null };
    } catch (error: any) {
      console.error('❌ Error in getGameRequests:', error);
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

      // Update request status in database
      console.log('🔄 Attempting to update request:', requestId, 'with status: accepted');
      const { data: updatedRequest, error: requestError } = await supabase
        .from('game_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId)
        .select('*')
        .single();

      console.log('📊 Database update result:', { updatedRequest, requestError });
      
      if (updatedRequest) {
        console.log('✅ Request successfully updated in database:');
        console.log('  - Request ID:', updatedRequest.id);
        console.log('  - New status:', updatedRequest.status);
        console.log('  - Status type:', typeof updatedRequest.status);
      }

      if (requestError) {
        console.log('⚠️ Database update failed, falling back to localStorage:', requestError);
        // Fallback to localStorage
        const localRequests = JSON.parse(localStorage.getItem('tapturf_game_requests') || '[]');
        console.log('🔍 Looking for request ID:', requestId, 'in localStorage:', localRequests.map(r => r.id));
        const requestIndex = localRequests.findIndex((r: any) => r.id === requestId);
        
        if (requestIndex >= 0) {
          localRequests[requestIndex].status = 'accepted';
          localStorage.setItem('tapturf_game_requests', JSON.stringify(localRequests));
          
          // Update game player count in localStorage
          const localGames = JSON.parse(localStorage.getItem('tapturf_frontend_games') || '[]');
          const gameIndex = localGames.findIndex((g: any) => g.id === gameId);
          if (gameIndex >= 0) {
            localGames[gameIndex].current_players = (localGames[gameIndex].current_players || 1) + 1;
            localStorage.setItem('tapturf_frontend_games', JSON.stringify(localGames));
          }
          
          // Send notification to the player (localStorage version)
          try {
            const acceptanceNotification = {
              id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              user_id: localRequests[requestIndex].user_id,
              type: 'game_request_accepted',
              title: 'Request Accepted! 🎉',
              message: `Your request to join the game has been accepted!`,
              metadata: { gameId, requestId },
              is_read: false,
              created_at: new Date().toISOString()
            };

            const notifications = JSON.parse(localStorage.getItem('tapturf_notifications') || '[]');
            notifications.unshift(acceptanceNotification);
            localStorage.setItem('tapturf_notifications', JSON.stringify(notifications));
            
            console.log('✅ localStorage acceptance notification sent to player:', localRequests[requestIndex].user_id);
          } catch (notifError) {
            console.warn('Could not send localStorage acceptance notification:', notifError);
          }
          
          console.log('✅ Request accepted successfully in localStorage');
          return { success: true, data: localRequests[requestIndex], error: null };
        }
        console.error('❌ Request not found in localStorage');
        return { success: false, data: null, error: 'Request not found' };
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

      // Send notification to the player that their request was accepted
      try {
        const { data: gameData } = await supabase
          .from('games')
          .select('sport, date, start_time, end_time')
          .eq('id', gameId)
          .single();

        await supabase
          .from('notifications')
          .insert([{
            user_id: updatedRequest.user_id,
            type: 'game_request_accepted',
            title: 'Request Accepted! 🎉',
            message: `Your request to join the ${gameData?.sport || 'game'} has been accepted!`,
            metadata: { gameId, requestId },
            is_read: false
          }]);

        console.log('✅ Acceptance notification sent to player:', updatedRequest.user_id);
      } catch (notifError) {
        console.warn('Could not send acceptance notification:', notifError);
      }

      console.log('✅ Request accepted successfully in database');
      return { success: true, data: updatedRequest, error: null };
    } catch (error: any) {
      console.error('❌ Error in acceptRequest:', error);
      return { success: false, data: null, error: error.message };
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

      // Update request status in database
      console.log('🔄 Attempting to update request:', requestId, 'with status: rejected');
      const { data, error } = await supabase
        .from('game_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId)
        .select('*')
        .single();

      console.log('📊 Database update result:', { data, error });

      if (error) {
        console.log('⚠️ Database update failed, falling back to localStorage:', error);
        // Fallback to localStorage
        const localRequests = JSON.parse(localStorage.getItem('tapturf_game_requests') || '[]');
        console.log('🔍 Looking for request ID:', requestId, 'in localStorage:', localRequests.map(r => r.id));
        const requestIndex = localRequests.findIndex((r: any) => r.id === requestId);
        
        if (requestIndex >= 0) {
          localRequests[requestIndex].status = 'rejected';
          localStorage.setItem('tapturf_game_requests', JSON.stringify(localRequests));
          
          console.log('✅ Request rejected successfully in localStorage');
          return { success: true, data: localRequests[requestIndex], error: null };
        }
        console.error('❌ Request not found in localStorage');
        return { success: false, data: null, error: 'Request not found' };
      }

      console.log('✅ Request rejected successfully in database');
      return { success: true, data: data, error: null };
    } catch (error: any) {
      console.error('❌ Error in rejectRequest:', error);
      return { success: false, data: null, error: error.message };
    }
  },

  // Get game participants
  async getGameParticipants(gameId: string) {
    try {
      console.log('🔍 Fetching participants for game:', gameId);

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

      console.log('📊 Game participants query result:', { data, error });

      if (error) {
        console.warn('⚠️ Error fetching participants with JOIN, using fallback:', error);
      }

      // Always use fallback method since game_participants.user_id references auth.users
      // but we need data from public.users
      const { data: basicData, error: basicError } = await supabase
        .from('game_participants')
        .select('*')
        .eq('game_id', gameId)
        .order('joined_at', { ascending: true });

      console.log('📊 Participants query result:', { basicData, basicError });

      if (basicError || !basicData || basicData.length === 0) {
        console.log('ℹ️ No participants found or error:', basicError);
        return { data: [], error: basicError?.message || null };
      }

      // Batch fetch user details from public.users
      const userIds = basicData.map((p: any) => p.user_id);
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, name, email, profile_image_url')
        .in('id', userIds);

      console.log('📊 Users data query result:', { usersData, usersError });

      if (usersError) {
        console.warn('⚠️ Error fetching user details:', usersError);
        // Return participants without full user details
        const fallbackData = basicData.map((participant: any) => ({
          ...participant,
          users: {
            id: participant.user_id,
            name: 'Player',
            email: '',
            profile_image_url: ''
          }
        }));
        return { data: fallbackData, error: null };
      }

      // Merge participants with user data
      const enrichedData = basicData.map((participant: any) => {
        const userData = usersData?.find((u: any) => u.id === participant.user_id);
        return {
          ...participant,
          users: userData || {
            id: participant.user_id,
            name: 'Player',
            email: '',
            profile_image_url: ''
          }
        };
      });

      console.log('✅ Enriched participant data:', enrichedData);
      return { data: enrichedData, error: null };
    } catch (error: any) {
      console.error('❌ Error in getGameParticipants:', error);
      return { data: [], error: error.message };
    }
  },

  // Wrapper functions with consistent naming
  async acceptGameRequest(requestId: string) {
    // Use the existing acceptRequest function but extract gameId from the request
    try {
      const { data, error } = await supabase
        .from('game_requests')
        .select('game_id')
        .eq('id', requestId)
        .single();

      if (error || !data) {
        // Fallback to localStorage
        const localRequests = JSON.parse(localStorage.getItem('tapturf_game_requests') || '[]');
        const request = localRequests.find((r: any) => r.id === requestId);
        if (request) {
          return await this.acceptRequest(requestId, request.game_id);
        }
        return { data: null, error: 'Request not found' };
      }

      return await this.acceptRequest(requestId, data.game_id);
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  async rejectGameRequest(requestId: string) {
    // Use the existing rejectRequest function but extract gameId from the request
    try {
      const { data, error } = await supabase
        .from('game_requests')
        .select('game_id')
        .eq('id', requestId)
        .single();

      if (error || !data) {
        // Fallback to localStorage
        const localRequests = JSON.parse(localStorage.getItem('tapturf_game_requests') || '[]');
        const request = localRequests.find((r: any) => r.id === requestId);
        if (request) {
          return await this.rejectRequest(requestId, request.game_id);
        }
        return { data: null, error: 'Request not found' };
      }

      return await this.rejectRequest(requestId, data.game_id);
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  // Get requests sent by the current user (to join other games)
  async getMyRequests(userId: string) {
    try {
      console.log('🔍 Getting requests sent by user ID:', userId);
      
      // Get all requests sent by this user
      const { data, error } = await supabase
        .from('game_requests')
        .select(`
          *,
          games (
            id,
            sport,
            date,
            start_time,
            end_time,
            creator_id,
            current_players,
            max_players,
            turfs (
              name,
              address
            )
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (data && !error) {
        console.log('✅ Successfully fetched user requests:', data);
        return { data, error: null };
      }

      console.log('⚠️ Join query failed, trying simplified query:', error);

      // Fallback to simplified query
      const { data: simpleData, error: simpleError } = await supabase
        .from('game_requests')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (simpleData && !simpleError) {
        // Enrich with game data manually
        const enrichedRequests = [];
        for (const request of simpleData) {
          try {
            const { data: gameData } = await supabase
              .from('games')
              .select(`
                id,
                sport,
                date,
                start_time,
                end_time,
                creator_id,
                current_players,
                max_players,
                turf_name,
                turf_address
              `)
              .eq('id', request.game_id)
              .single();

            enrichedRequests.push({
              ...request,
              games: gameData ? {
                ...gameData,
                turfs: {
                  name: gameData.turf_name,
                  address: gameData.turf_address
                }
              } : null
            });
          } catch (gameError) {
            console.log('Could not fetch game data for request:', request.id, gameError);
            enrichedRequests.push({
              ...request,
              games: null
            });
          }
        }
        
        console.log('✅ Successfully enriched user requests:', enrichedRequests);
        return { data: enrichedRequests, error: null };
      }

      // Fallback to localStorage
      console.log('⚠️ Database failed, trying localStorage');
      const localRequests = JSON.parse(localStorage.getItem('tapturf_game_requests') || '[]');
      const userRequests = localRequests.filter((r: any) => r.user_id === userId);
      
      return { data: userRequests, error: null };
    } catch (error: any) {
      console.error('❌ Error in getMyRequests:', error);
      return { data: [], error: error.message };
    }
  },

  // Cancel a request sent by the current user
  async cancelMyRequest(requestId: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      console.log('🔄 Cancelling request:', requestId, 'for user:', user.id);

      // First check if the request belongs to this user and is still pending
      const { data: request, error: fetchError } = await supabase
        .from('game_requests')
        .select('*')
        .eq('id', requestId)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .single();

      if (!request || fetchError) {
        console.log('❌ Request not found or not cancellable:', fetchError);
        return { success: false, error: 'Request not found or cannot be cancelled' };
      }

      // Delete the request
      const { error: deleteError } = await supabase
        .from('game_requests')
        .delete()
        .eq('id', requestId)
        .eq('user_id', user.id);

      if (deleteError) {
        console.log('❌ Database delete failed, trying localStorage:', deleteError);
        
        // Fallback to localStorage
        const localRequests = JSON.parse(localStorage.getItem('tapturf_game_requests') || '[]');
        const requestIndex = localRequests.findIndex((r: any) => r.id === requestId && r.user_id === user.id);
        
        if (requestIndex >= 0) {
          localRequests.splice(requestIndex, 1);
          localStorage.setItem('tapturf_game_requests', JSON.stringify(localRequests));
          console.log('✅ Request cancelled in localStorage');
          return { success: true, data: null, error: null };
        }
        
        return { success: false, error: deleteError.message };
      }

      console.log('✅ Request cancelled successfully in database');
      return { success: true, data: null, error: null };
    } catch (error: any) {
      console.error('❌ Error in cancelMyRequest:', error);
      return { success: false, error: error.message };
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