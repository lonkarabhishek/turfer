/**
 * City model. Small enough to live in one file. Both server (SEO
 * pages, sitemap) and client (city picker, filters) consume this.
 */

export type CityId =
  | "nashik" | "pune" | "mumbai" | "nagpur" | "hyderabad" | "bangalore" | "sambhajinagar" | "delhi"
  | "gurgaon" | "noida" | "ghaziabad" | "jalgaon" | "faridabad" | "dhule"
  | "kolhapur" | "solapur" | "ahilyanagar" | "amravati" | "nanded" | "sangli" | "satara" | "akola" | "latur" | "malegaon" | "jalna" | "chandrapur";
export type CityState = "Maharashtra" | "Telangana" | "Karnataka" | "Delhi" | "Haryana" | "Uttar Pradesh";

/**
 * One list, in display order. The id must match turfs.city in the
 * database. Adding a city here is the only code change needed: routes,
 * sitemap, pickers, footer, Ask and structured data all read this.
 */
export const CITIES: {
  id: CityId;
  label: string;
  labelUpper: string;
  state: CityState;
}[] = [
  { id: "nashik",        label: "Nashik",        labelUpper: "NASHIK",        state: "Maharashtra" },
  { id: "pune",          label: "Pune",          labelUpper: "PUNE",          state: "Maharashtra" },
  { id: "mumbai",        label: "Mumbai",        labelUpper: "MUMBAI",        state: "Maharashtra" },
  { id: "nagpur",        label: "Nagpur",        labelUpper: "NAGPUR",        state: "Maharashtra" },
  { id: "hyderabad",     label: "Hyderabad",     labelUpper: "HYDERABAD",     state: "Telangana" },
  { id: "bangalore",     label: "Bangalore",     labelUpper: "BANGALORE",     state: "Karnataka" },
  { id: "delhi",         label: "Delhi",         labelUpper: "DELHI",         state: "Delhi" },
  { id: "gurgaon",       label: "Gurgaon",       labelUpper: "GURGAON",       state: "Haryana" },
  { id: "noida",         label: "Noida",         labelUpper: "NOIDA",         state: "Uttar Pradesh" },
  { id: "ghaziabad",     label: "Ghaziabad",     labelUpper: "GHAZIABAD",     state: "Uttar Pradesh" },
  { id: "faridabad",     label: "Faridabad",     labelUpper: "FARIDABAD",     state: "Haryana" },
  { id: "sambhajinagar", label: "Sambhajinagar", labelUpper: "SAMBHAJINAGAR", state: "Maharashtra" },
  { id: "jalgaon",       label: "Jalgaon",       labelUpper: "JALGAON",       state: "Maharashtra" },
  { id: "dhule",         label: "Dhule",         labelUpper: "DHULE",         state: "Maharashtra" },
  { id: "kolhapur",      label: "Kolhapur",      labelUpper: "KOLHAPUR",      state: "Maharashtra" },
  { id: "solapur",       label: "Solapur",       labelUpper: "SOLAPUR",       state: "Maharashtra" },
  { id: "ahilyanagar",   label: "Ahilyanagar",   labelUpper: "AHILYANAGAR",   state: "Maharashtra" },
  { id: "amravati",      label: "Amravati",      labelUpper: "AMRAVATI",      state: "Maharashtra" },
  { id: "nanded",        label: "Nanded",        labelUpper: "NANDED",        state: "Maharashtra" },
  { id: "sangli",        label: "Sangli",        labelUpper: "SANGLI",        state: "Maharashtra" },
  { id: "satara",        label: "Satara",        labelUpper: "SATARA",        state: "Maharashtra" },
  { id: "akola",         label: "Akola",         labelUpper: "AKOLA",         state: "Maharashtra" },
  { id: "latur",         label: "Latur",         labelUpper: "LATUR",         state: "Maharashtra" },
  { id: "malegaon",      label: "Malegaon",      labelUpper: "MALEGAON",      state: "Maharashtra" },
  { id: "jalna",         label: "Jalna",         labelUpper: "JALNA",         state: "Maharashtra" },
  { id: "chandrapur",    label: "Chandrapur",    labelUpper: "CHANDRAPUR",    state: "Maharashtra" },
];

const NAMED = CITIES.slice(0, 5).map((c) => c.label);
const REST = CITIES.length - NAMED.length;
/** Prose lists name the first five and count the rest: "Nashik, Pune, Mumbai, Nagpur, Hyderabad & 9 more". */
export const CITY_LIST = REST > 0 ? `${NAMED.join(", ")} & ${REST} more` : NAMED.slice(0, -1).join(", ") + " & " + NAMED.at(-1)!;
export const CITY_LIST_AND = REST > 0 ? `${NAMED.join(", ")} and ${REST} more cities` : NAMED.slice(0, -1).join(", ") + " and " + NAMED.at(-1)!;
/** For <title> tags: "Nashik, Pune, Mumbai & more". */
export const CITY_LIST_SHORT = CITIES.length > 3 ? CITIES.slice(0, 3).map((c) => c.label).join(", ") + " & more" : CITY_LIST;

/** State for structured data. */
export function stateFor(id: CityId | string | null | undefined): CityState {
  return CITIES.find((c) => c.id === id)?.state ?? "Maharashtra";
}

export const CITY_IDS: readonly CityId[] = CITIES.map((c) => c.id);

export function isCity(value: string | null | undefined): value is CityId {
  return CITIES.some((c) => c.id === value);
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
  if (a.includes("mumbai") || a.includes("bombay") || a.includes("thane") || a.includes("navi mumbai")) return "mumbai";
  if (a.includes("nagpur") || a.includes("kamptee") || a.includes("hingna")) return "nagpur";
  if (a.includes("hyderabad") || a.includes("secunderabad") || a.includes("telangana")) return "hyderabad";
  if (a.includes("bangalore") || a.includes("bengaluru")) return "bangalore";
  if (a.includes("gurgaon") || a.includes("gurugram")) return "gurgaon";
  if (a.includes("noida")) return "noida";
  if (a.includes("ghaziabad")) return "ghaziabad";
  if (a.includes("faridabad")) return "faridabad";
  if (a.includes("delhi")) return "delhi";
  if (a.includes("sambhajinagar") || a.includes("aurangabad")) return "sambhajinagar";
  if (a.includes("jalgaon")) return "jalgaon";
  if (a.includes("dhule")) return "dhule";
  if (a.includes("kolhapur")) return "kolhapur";
  if (a.includes("solapur")) return "solapur";
  if (a.includes("ahilyanagar") || a.includes("ahmednagar")) return "ahilyanagar";
  if (a.includes("amravati")) return "amravati";
  if (a.includes("nanded")) return "nanded";
  if (a.includes("sangli")) return "sangli";
  if (a.includes("satara")) return "satara";
  if (a.includes("akola")) return "akola";
  if (a.includes("latur")) return "latur";
  if (a.includes("malegaon")) return "malegaon";
  if (a.includes("jalna")) return "jalna";
  if (a.includes("chandrapur")) return "chandrapur";
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
  mumbai: { lat: 19.0760, lng: 72.8777 },
  nagpur: { lat: 21.1458, lng: 79.0882 },
  hyderabad: { lat: 17.3850, lng: 78.4867 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  delhi: { lat: 28.6139, lng: 77.2090 },
  gurgaon: { lat: 28.4595, lng: 77.0266 },
  noida: { lat: 28.5355, lng: 77.3910 },
  ghaziabad: { lat: 28.6692, lng: 77.4538 },
  faridabad: { lat: 28.4089, lng: 77.3178 },
  sambhajinagar: { lat: 19.8762, lng: 75.3433 },
  jalgaon: { lat: 21.0077, lng: 75.5626 },
  dhule: { lat: 20.9042, lng: 74.7749 },
  kolhapur: { lat: 16.7050, lng: 74.2433 },
  solapur: { lat: 17.6599, lng: 75.9064 },
  ahilyanagar: { lat: 19.0948, lng: 74.7480 },
  amravati: { lat: 20.9374, lng: 77.7796 },
  nanded: { lat: 19.1383, lng: 77.3210 },
  sangli: { lat: 16.8524, lng: 74.5815 },
  satara: { lat: 17.6805, lng: 74.0183 },
  akola: { lat: 20.7002, lng: 77.0082 },
  latur: { lat: 18.4088, lng: 76.5604 },
  malegaon: { lat: 20.5579, lng: 74.5287 },
  jalna: { lat: 19.8347, lng: 75.8816 },
  chandrapur: { lat: 19.9615, lng: 79.2961 },
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
 * all of them (user isn't near any city we list), return null so we don't force
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
