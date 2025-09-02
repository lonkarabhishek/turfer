// Game data transformation utilities
import type { GameData } from '../components/GameCard';
import { getUserLocation, calculateDistance, geocodeAddress } from './location';

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
function getTurfInfo(game: any): { name: string; address: string; coordinates?: { lat: number; lng: number } } {
  // First try to get from joined data
  if (game.turfs?.name && game.turfs?.address) {
    return {
      name: game.turfs.name,
      address: game.turfs.address,
      coordinates: game.turfs.coordinates || DEFAULT_TURFS[game.turfs.id]?.coordinates
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
async function calculateGameDistance(game: any, userLocation: any): Promise<number | undefined> {
  if (!userLocation) return undefined;
  
  const turfInfo = getTurfInfo(game);
  let turfCoordinates = turfInfo.coordinates;
  
  // If we don't have coordinates, try to geocode the address
  if (!turfCoordinates && turfInfo.address) {
    const coords = await geocodeAddress(turfInfo.address);
    if (coords) {
      turfCoordinates = { lat: coords.latitude, lng: coords.longitude };
    }
  }
  
  if (!turfCoordinates) return undefined;
  
  try {
    const distance = calculateDistance(
      { latitude: userLocation.latitude, longitude: userLocation.longitude },
      { latitude: turfCoordinates.lat, longitude: turfCoordinates.lng }
    );
    return distance;
  } catch (error) {
    console.warn('Error calculating distance:', error);
    return undefined;
  }
}

// Transform a single game from API response to GameData interface
export async function transformGameData(game: any, userLocation?: any): Promise<GameData> {
  const turfInfo = getTurfInfo(game);
  const distance = userLocation ? await calculateGameDistance(game, userLocation) : undefined;
  
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
    createdAt: game.created_at || game.createdAt || new Date().toISOString()
  };
}

// Transform multiple games from API response
export async function transformGamesData(games: any[], includeDistance: boolean = true): Promise<GameData[]> {
  let userLocation = null;
  
  if (includeDistance) {
    try {
      userLocation = await getUserLocation();
    } catch (error) {
      console.warn('Could not get user location for distance calculation:', error);
    }
  }
  
  // Transform games in parallel for better performance
  const transformPromises = games.map(game => transformGameData(game, userLocation));
  const transformedGames = await Promise.all(transformPromises);
  
  // Sort by distance if we have it, otherwise by date
  return transformedGames.sort((a, b) => {
    if (a.distanceKm !== undefined && b.distanceKm !== undefined) {
      return a.distanceKm - b.distanceKm;
    }
    // Fallback to date sorting
    return new Date(a.date).getTime() - new Date(b.date).getTime();
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