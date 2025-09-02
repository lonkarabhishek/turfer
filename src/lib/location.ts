// Location utilities for distance calculation and geolocation

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface LocationData extends Coordinates {
  accuracy?: number;
  timestamp?: number;
}

// Calculate distance between two coordinates using Haversine formula
export function calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(coord2.latitude - coord1.latitude);
  const dLon = toRadians(coord2.longitude - coord1.longitude);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(coord1.latitude)) *
    Math.cos(toRadians(coord2.latitude)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 10) / 10; // Round to 1 decimal place
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

// Get user's current location
export function getCurrentLocation(): Promise<LocationData> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported'));
      return;
    }

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000 // Cache for 5 minutes
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        });
      },
      (error) => {
        let message = 'Location access denied';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = 'Location access denied by user';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'Location information unavailable';
            break;
          case error.TIMEOUT:
            message = 'Location request timed out';
            break;
        }
        reject(new Error(message));
      },
      options
    );
  });
}

// Get user's location from cache or request new
export async function getUserLocation(): Promise<LocationData | null> {
  try {
    // Check if we have a cached location
    const cached = localStorage.getItem('user_location');
    const cacheExpiry = localStorage.getItem('user_location_expiry');
    
    if (cached && cacheExpiry) {
      const expiry = parseInt(cacheExpiry);
      if (Date.now() < expiry) {
        return JSON.parse(cached);
      }
    }

    // Get fresh location
    const location = await getCurrentLocation();
    
    // Cache for 5 minutes
    localStorage.setItem('user_location', JSON.stringify(location));
    localStorage.setItem('user_location_expiry', (Date.now() + 5 * 60 * 1000).toString());
    
    return location;
  } catch (error) {
    console.warn('Could not get user location:', error);
    return null;
  }
}

// Clear cached location
export function clearLocationCache(): void {
  localStorage.removeItem('user_location');
  localStorage.removeItem('user_location_expiry');
}

// Get coordinates from address (using Google Geocoding API)
export async function geocodeAddress(address: string): Promise<Coordinates | null> {
  try {
    // For demo purposes, return approximate coordinates for common addresses
    // In production, you would use a real geocoding service
    const addressLower = address.toLowerCase();
    
    if (addressLower.includes('nashik') || addressLower.includes('gangapur road')) {
      return { latitude: 20.0059, longitude: 73.7976 };
    }
    if (addressLower.includes('college road')) {
      return { latitude: 20.0134, longitude: 73.7901 };
    }
    if (addressLower.includes('mumbai naka')) {
      return { latitude: 19.9974, longitude: 73.7898 };
    }
    if (addressLower.includes('satpur')) {
      return { latitude: 20.0514, longitude: 73.7843 };
    }
    if (addressLower.includes('cidco')) {
      return { latitude: 20.0023, longitude: 73.7762 };
    }
    
    // Default to Nashik city center
    return { latitude: 20.0059, longitude: 73.7976 };
  } catch (error) {
    console.warn('Could not geocode address:', address, error);
    return null;
  }
}

// Check if location permission is granted
export function checkLocationPermission(): Promise<PermissionState> {
  return new Promise((resolve) => {
    if (!navigator.permissions || !navigator.permissions.query) {
      resolve('prompt');
      return;
    }

    navigator.permissions.query({ name: 'geolocation' })
      .then((permission) => resolve(permission.state))
      .catch(() => resolve('prompt'));
  });
}

// Format distance for display
export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m away`;
  }
  return `${distanceKm}km away`;
}

// Get city from coordinates (simplified version)
export function getCityFromCoordinates(coords: Coordinates): string {
  // For demo purposes, return city based on coordinates
  // In production, you would use reverse geocoding
  const { latitude, longitude } = coords;
  
  if (latitude >= 19.9 && latitude <= 20.2 && longitude >= 73.7 && longitude <= 73.9) {
    return 'Nashik';
  }
  if (latitude >= 19.0 && latitude <= 19.3 && longitude >= 72.7 && longitude <= 73.1) {
    return 'Mumbai';
  }
  if (latitude >= 18.4 && latitude <= 18.7 && longitude >= 73.7 && longitude <= 74.0) {
    return 'Pune';
  }
  
  return 'Unknown City';
}