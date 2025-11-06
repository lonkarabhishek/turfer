// Game data transformation utilities
import type { GameData } from '../components/GameCard';
import { getUserLocation as getLocation, calculateDistance as calcDistance, extractCoordinatesFromMapUrl } from './geolocation';

// Helper functions for data transformation
export const formatDate = (dateStr: string) => {
  const today = new Date();
  const gameDate = new Date(dateStr);
  const diffDays = Math.ceil((gameDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return gameDate.toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'short', 
    day: 'numeric' 
  });
  return gameDate.toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
};

// Convert 24-hour time to 12-hour format
export const formatTime = (timeStr: string) => {
  if (!timeStr || timeStr === '00:00') return '12:00 AM';
  
  const [hours, minutes] = timeStr.split(':');
  const hour24 = parseInt(hours, 10);
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  const ampm = hour24 < 12 ? 'AM' : 'PM';
  
  return `${hour12}:${minutes} ${ampm}`;
};

// Format time slot to 12-hour format
export const formatTimeSlot = (startTime: string, endTime: string) => {
  const formattedStart = formatTime(startTime);
  const formattedEnd = formatTime(endTime);
  return `${formattedStart} - ${formattedEnd}`;
};

export const capitalizeSkillLevel = (level: string | null | undefined): GameData['skillLevel'] => {
  if (!level || typeof level !== 'string') {
    return 'All levels';
  }
  
  const levelMap: { [key: string]: GameData['skillLevel'] } = {
    'beginner': 'Beginner',
    'intermediate': 'Intermediate', 
    'advanced': 'Advanced',
    'all': 'All levels'
  };
  return levelMap[level.toLowerCase()] || 'All levels';
};

// Default turf data for common IDs (fallback when database doesn't have proper joins)
const DEFAULT_TURFS: { [key: string]: { name: string; address: string; coordinates: { lat: number; lng: number } } } = {
  '1': {
    name: 'Elite Sports Arena',
    address: 'Gangapur Road, Nashik',
    coordinates: { lat: 20.0059, lng: 73.7976 }
  },
  '2': {
    name: 'Victory Ground',
    address: 'College Road, Nashik',
    coordinates: { lat: 20.0134, lng: 73.7901 }
  },
  '3': {
    name: 'Sports Hub',
    address: 'Mumbai Naka, Nashik',
    coordinates: { lat: 19.9974, lng: 73.7898 }
  },
  '4': {
    name: 'Champions Arena',
    address: 'Satpur, Nashik',
    coordinates: { lat: 20.0514, lng: 73.7843 }
  },
  '5': {
    name: 'Play Zone',
    address: 'CIDCO, Nashik',
    coordinates: { lat: 20.0023, lng: 73.7762 }
  },
  'default': {
    name: 'TapTurf Arena',
    address: 'Nashik, Maharashtra',
    coordinates: { lat: 20.0059, lng: 73.7976 }
  }
};

// Get turf information with fallback
function getTurfInfo(game: any): { name: string; address: string; coordinates?: { lat: number; lng: number }; gmapLink?: string } {
  // First try to get from joined data
  if (game.turfs?.name && game.turfs?.address) {
    const gmapLink = game.turfs.gmap_embed_link || game.turfs['Gmap Embed link'];
    const extractedCoords = gmapLink ? extractCoordinatesFromMapUrl(gmapLink) : null;

    return {
      name: game.turfs.name,
      address: game.turfs.address,
      coordinates: extractedCoords || game.turfs.coordinates || DEFAULT_TURFS[game.turfs.id]?.coordinates,
      gmapLink: gmapLink
    };
  }

  // Try flat structure
  if (game.turf_name && game.turf_address) {
    return {
      name: game.turf_name,
      address: game.turf_address,
      coordinates: DEFAULT_TURFS[game.turf_id || game.turfId]?.coordinates
    };
  }

  // Try direct properties
  if (game.turfName && game.turfAddress) {
    return {
      name: game.turfName,
      address: game.turfAddress,
      coordinates: DEFAULT_TURFS[game.turf_id || game.turfId]?.coordinates
    };
  }

  // Fallback to default data if we have turf_id
  const turfId = game.turf_id || game.turfId || 'default';
  if (turfId && DEFAULT_TURFS[turfId]) {
    return DEFAULT_TURFS[turfId];
  }

  // Try a few more fallback patterns based on common IDs
  if (turfId && turfId.length > 0) {
    const firstChar = turfId.toString().charAt(0);
    if (DEFAULT_TURFS[firstChar]) {
      return DEFAULT_TURFS[firstChar];
    }
  }

  // Last resort - return default arena instead of unknown
  return DEFAULT_TURFS['default'];
}

// Calculate distance for a game
function calculateGameDistance(game: any, userLocation: any): number | undefined {
  if (!userLocation) return undefined;

  const turfInfo = getTurfInfo(game);
  const turfCoordinates = turfInfo.coordinates;

  if (!turfCoordinates) {
    console.warn('No coordinates available for turf:', turfInfo.name);
    return undefined;
  }

  try {
    const distance = calcDistance(
      { lat: userLocation.lat, lng: userLocation.lng },
      { lat: turfCoordinates.lat, lng: turfCoordinates.lng }
    );
    console.log(`📍 Distance to game at ${turfInfo.name}:`, distance, 'km');
    return distance;
  } catch (error) {
    console.warn('Error calculating distance:', error);
    return undefined;
  }
}

// Transform a single game from API response to GameData interface
export function transformGameData(game: any, userLocation?: any): GameData {
  const turfInfo = getTurfInfo(game);
  const distance = userLocation ? calculateGameDistance(game, userLocation) : undefined;
  
  // Handle both database structure (game.users.name) and flat structure (game.host_name)
  const hostName = game.users?.name || game.host_name || game.hostName || "Unknown Host";
  const hostPhone = game.users?.phone || game.host_phone || game.hostPhone || "9999999999";
  
  // Handle time slots - could be start_time/end_time or startTime/endTime
  const startTime = game.start_time || game.startTime || "00:00";
  const endTime = game.end_time || game.endTime || "00:00";
  
  return {
    id: game.id,
    hostName: hostName,
    hostAvatar: game.users?.profile_image_url || game.host_profile_image_url || game.host_avatar || game.hostAvatar || "",
    turfId: game.turfs?.id || game.turf_id || game.turfId || undefined,
    turfName: turfInfo.name,
    turfAddress: turfInfo.address,
    date: formatDate(game.date),
    timeSlot: formatTimeSlot(startTime, endTime),
    format: game.sport || game.format || "Game",
    skillLevel: capitalizeSkillLevel(game.skill_level || game.skillLevel),
    currentPlayers: game.current_players || game.currentPlayers || 1,
    maxPlayers: game.max_players || game.maxPlayers || 2,
    costPerPerson: game.price_per_player || game.cost_per_person || game.costPerPerson || 0,
    notes: game.notes,
    hostPhone: hostPhone,
    distanceKm: distance,
    isUrgent: false, // Can be calculated based on date/time
    createdAt: game.created_at || game.createdAt || new Date().toISOString(),
    creatorId: game.creator_id || game.creatorId,
    isTurfBooked: game.turf_booked || game.turfBooked || false,
    turfBookingStatus: game.turf_booking_status || game.turfBookingStatus || (game.turf_booked || game.turfBooked ? 'confirmed' : undefined)
  };
}

// Transform multiple games from API response
export async function transformGamesData(games: any[], includeDistance: boolean = true): Promise<GameData[]> {
  let userLocation = null;

  if (includeDistance) {
    try {
      userLocation = await getLocation();
      console.log('📍 User location for game distances:', userLocation);
    } catch (error) {
      console.warn('Could not get user location for distance calculation:', error);
    }
  }

  // Transform games synchronously now since distance calculation is sync
  const transformedGames = games.map(game => transformGameData(game, userLocation));

  // Sort games by: 1) spots left (fewer spots = higher priority), 2) distance (closer = higher), 3) time (sooner = higher)
  return transformedGames.sort((a, b) => {
    // Calculate spots left for each game
    const aSpotsLeft = a.maxPlayers - a.currentPlayers;
    const bSpotsLeft = b.maxPlayers - b.currentPlayers;

    // First: Sort by spots left (increasing order - fewer spots left means game is filling up fast)
    if (aSpotsLeft !== bSpotsLeft) {
      return aSpotsLeft - bSpotsLeft; // Games with fewer spots left come first
    }

    // Second: Sort by distance (closer games first)
    if (a.distanceKm !== undefined && b.distanceKm !== undefined) {
      if (a.distanceKm !== b.distanceKm) {
        return a.distanceKm - b.distanceKm;
      }
    }

    // Third: Sort by game time (sooner games first)
    // Parse the date from the formatted date string
    const parseGameDate = (dateStr: string): Date => {
      // dateStr could be "Today", "Tomorrow", "Monday, Nov 1", etc.
      if (dateStr === "Today") {
        return new Date();
      } else if (dateStr === "Tomorrow") {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
      } else {
        // Try to parse the date string
        return new Date(dateStr);
      }
    };

    const aDate = parseGameDate(a.date);
    const bDate = parseGameDate(b.date);

    return aDate.getTime() - bDate.getTime(); // Sooner games first
  });
}

// Filter games by location (for the location filter functionality)
export function filterGamesByLocation(games: GameData[], locationQuery: string): GameData[] {
  if (!locationQuery) return games;
  
  const query = locationQuery.toLowerCase();
  return games.filter(game => {
    return (
      game.turfAddress.toLowerCase().includes(query) ||
      game.turfName.toLowerCase().includes(query)
    );
  });
}

// Get unique locations from games for filter dropdown
export function getUniqueLocations(games: GameData[]): string[] {
  const locations = games.map(game => {
    // Extract area name from address (e.g., "Nashik Road" from full address)
    const addressParts = game.turfAddress.split(',');
    return addressParts[0]?.trim() || game.turfAddress;
  });
  
  return Array.from(new Set(locations)).filter(Boolean).sort();
}

// Get unique sports from games for filter dropdown
export function getUniqueSports(games: GameData[]): string[] {
  return Array.from(new Set(games.map(game => game.format))).filter(Boolean).sort();
}