// Geolocation and distance calculation utilities

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Extract coordinates from Google Maps embed URL
 * Example URL: https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3749.4595932940274!2d73.76532071080757!3d19.989216581335054!...
 * The format: !3d{latitude}!2d{longitude}
 */
export function extractCoordinatesFromMapUrl(mapUrl: string | null): Coordinates | null {
  if (!mapUrl) return null;

  try {
    // Extract from iframe HTML if needed
    let url = mapUrl;
    if (mapUrl.includes('<iframe')) {
      const srcMatch = mapUrl.match(/src=["']([^"']+)["']/);
      if (srcMatch) {
        url = srcMatch[1];
      }
    }

    // Method 1: Extract from pb parameter (most accurate)
    // Format: !3d{lat}!2d{lng} or !2d{lng}!3d{lat}
    const latMatch = url.match(/!3d(-?\d+\.\d+)/);
    const lngMatch = url.match(/!2d(-?\d+\.\d+)/);

    if (latMatch && lngMatch) {
      return {
        lat: parseFloat(latMatch[1]),
        lng: parseFloat(lngMatch[1])
      };
    }

    // Method 2: Extract from @lat,lng format
    const coordMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (coordMatch) {
      return {
        lat: parseFloat(coordMatch[1]),
        lng: parseFloat(coordMatch[2])
      };
    }

    // Method 3: Extract from ll parameter
    const llMatch = url.match(/ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (llMatch) {
      return {
        lat: parseFloat(llMatch[1]),
        lng: parseFloat(llMatch[2])
      };
    }

    console.warn('Could not extract coordinates from map URL:', url.substring(0, 100));
    return null;
  } catch (error) {
    console.error('Error extracting coordinates:', error);
    return null;
  }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
  const R = 6371; // Earth's radius in kilometers

  const dLat = toRadians(coord2.lat - coord1.lat);
  const dLng = toRadians(coord2.lng - coord1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(coord1.lat)) *
    Math.cos(toRadians(coord2.lat)) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 10) / 10; // Round to 1 decimal place
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Get user's current location using browser geolocation API
 */
export function getUserLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        let errorMessage = 'Unable to retrieve your location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out';
            break;
        }
        reject(new Error(errorMessage));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // Cache location for 5 minutes
      }
    );
  });
}

/**
 * Format distance for display
 */
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  return `${km.toFixed(1)}km`;
}
