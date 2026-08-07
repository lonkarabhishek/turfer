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
