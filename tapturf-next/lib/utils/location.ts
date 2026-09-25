export interface Coords {
  lat: number;
  lng: number;
}

/**
 * Great-circle distance in km between two lat/lng points.
 * Returns NaN when either coord is missing or non-finite — callers
 * should filter with Number.isFinite before sorting so a stray null
 * doesn't poison the comparator.
 */
export function haversineKm(a: Coords, b: Coords): number {
  const aLat = Number(a?.lat);
  const aLng = Number(a?.lng);
  const bLat = Number(b?.lat);
  const bLng = Number(b?.lng);
  if (!Number.isFinite(aLat) || !Number.isFinite(aLng) || !Number.isFinite(bLat) || !Number.isFinite(bLng)) {
    return NaN;
  }
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const sin2 =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  // Clamp to [0,1] so floating-point error can't push it out of range
  // (Math.asin returns NaN when its input is even 1.0000000001).
  const clamped = Math.min(1, Math.max(0, sin2));
  return R * 2 * Math.asin(Math.sqrt(clamped));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function getUserLocation(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { timeout: 8000, maximumAge: 60000 }
    );
  });
}
