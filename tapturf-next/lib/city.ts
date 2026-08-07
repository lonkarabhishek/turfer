/**
 * City model. Small enough to live in one file. Both server (SEO
 * pages, sitemap) and client (city picker, filters) consume this.
 */

export type CityId = "nashik" | "pune";

export const CITIES: {
  id: CityId;
  label: string;
  labelUpper: string;
}[] = [
  { id: "nashik", label: "Nashik", labelUpper: "NASHIK" },
  { id: "pune",   label: "Pune",   labelUpper: "PUNE" },
];

export const CITY_IDS: readonly CityId[] = CITIES.map((c) => c.id);

export function isCity(value: string | null | undefined): value is CityId {
  return value === "nashik" || value === "pune";
}

export function labelFor(id: CityId): string {
  return CITIES.find((c) => c.id === id)?.label ?? id;
}

/**
 * Guess a city from an address string. Used as fallback for turfs
 * that somehow slip through without a `city` value set.
 */
export function guessCityFromAddress(address: string | null | undefined): CityId | null {
  if (!address) return null;
  const a = address.toLowerCase();
  if (a.includes("nashik") || a.includes("nasik")) return "nashik";
  if (a.includes("pune")) return "pune";
  return null;
}

// ── Client-only preference storage ─────────────────────────

const KEY = "tapturf_city_v1";
const AUTODETECT_TRIED_KEY = "tapturf_city_autodetect_v1";

export function getCityPref(): CityId | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(KEY);
    return isCity(v) ? v : null;
  } catch { return null; }
}

export function setCityPref(city: CityId | null): void {
  if (typeof window === "undefined") return;
  try {
    if (city) localStorage.setItem(KEY, city);
    else localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

// ── Auto-detect from geolocation ───────────────────────────

// Rough centroid of each city. We only need to pick the closer one,
// exact position doesn't matter.
const CITY_COORDS: Record<CityId, { lat: number; lng: number }> = {
  nashik: { lat: 19.9975, lng: 73.7898 },
  pune:   { lat: 18.5204, lng: 73.8567 },
};

// Haversine — km between two lat/lng points.
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Guess the closest city from a lat/lng. If the point is > 200km from
 * either (user isn't in Maharashtra), return null so we don't force
 * them into a city that isn't theirs.
 */
export function nearestCity(lat: number, lng: number): CityId | null {
  const pt = { lat, lng };
  let best: { id: CityId; km: number } | null = null;
  for (const id of CITY_IDS) {
    const km = distanceKm(pt, CITY_COORDS[id]);
    if (!best || km < best.km) best = { id, km };
  }
  if (!best || best.km > 200) return null;
  return best.id;
}

/**
 * Ask the browser for a one-shot position and, if we're near a
 * supported city, set the preference. Silently no-ops if the user
 * denies, if the browser doesn't support geolocation, or if we've
 * already tried once (so we don't nag).
 */
export async function autoDetectCity(): Promise<CityId | null> {
  if (typeof window === "undefined") return null;
  if (!("geolocation" in navigator)) return null;
  try {
    if (localStorage.getItem(AUTODETECT_TRIED_KEY) === "1") return null;
    localStorage.setItem(AUTODETECT_TRIED_KEY, "1");
  } catch { /* ignore */ }

  return new Promise<CityId | null>((resolve) => {
    const finish = (v: CityId | null) => resolve(v);
    // 8s cap so this never hangs the UI
    const timer = window.setTimeout(() => finish(null), 8000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        const c = nearestCity(pos.coords.latitude, pos.coords.longitude);
        if (c) setCityPref(c);
        finish(c);
      },
      () => {
        window.clearTimeout(timer);
        finish(null);
      },
      // Reduce battery hit — low accuracy is fine to pick city
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 15 * 60 * 1000 }
    );
  });
}
