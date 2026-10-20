/**
 * City model. Small enough to live in one file. Both server (SEO
 * pages, sitemap) and client (city picker, filters) consume this.
 */

/**
 * City slugs are plain strings now: the database is the source of
 * truth for which cities exist (see lib/queries/cities.ts). CITIES below
 * is the curated list with labels, states and centroids; a city that is
 * not in it yet still works with a title-cased label.
 */
export type CityId = string;
export type CityState = string;

/**
 * One list, biggest city first by active turf count (city_turf_counts,
 * 18 Oct 2026). Ties keep the earlier curated order (Noida before
 * Ahmedabad, Gurgaon before Kolkata, Coimbatore before Lucknow, Nashik
 * before Nagpur); getLiveCities() in lib/queries/cities.ts breaks its
 * ties by this index too, so the live and static orders agree until
 * the counts move. Prose lists name the first five (CITY_LIST,
 * CITY_LIST_AND) and count the rest. The id must match turfs.city in
 * the database. Adding a city here gives it a label, state and
 * centroid; routes, sitemap and pickers follow the database.
 */
export const CITIES: {
  id: CityId;
  label: string;
  labelUpper: string;
  state: CityState;
}[] = [
  { id: "hyderabad",     label: "Hyderabad",     labelUpper: "HYDERABAD",     state: "Telangana" },
  { id: "bangalore",     label: "Bangalore",     labelUpper: "BANGALORE",     state: "Karnataka" },
  { id: "mumbai",        label: "Mumbai",        labelUpper: "MUMBAI",        state: "Maharashtra" },
  { id: "pune",          label: "Pune",          labelUpper: "PUNE",          state: "Maharashtra" },
  { id: "delhi",         label: "Delhi",         labelUpper: "DELHI",         state: "Delhi" },
  { id: "chennai",       label: "Chennai",       labelUpper: "CHENNAI",       state: "Tamil Nadu" },
  { id: "noida",         label: "Noida",         labelUpper: "NOIDA",         state: "Uttar Pradesh" },
  { id: "ahmedabad",     label: "Ahmedabad",     labelUpper: "AHMEDABAD",     state: "Gujarat" },
  { id: "gurgaon",       label: "Gurgaon",       labelUpper: "GURGAON",       state: "Haryana" },
  { id: "kolkata",       label: "Kolkata",       labelUpper: "KOLKATA",       state: "West Bengal" },
  { id: "jaipur",        label: "Jaipur",        labelUpper: "JAIPUR",        state: "Rajasthan" },
  { id: "coimbatore",    label: "Coimbatore",    labelUpper: "COIMBATORE",    state: "Tamil Nadu" },
  { id: "lucknow",       label: "Lucknow",       labelUpper: "LUCKNOW",       state: "Uttar Pradesh" },
  { id: "sambhajinagar", label: "Sambhajinagar", labelUpper: "SAMBHAJINAGAR", state: "Maharashtra" },
  { id: "nashik",        label: "Nashik",        labelUpper: "NASHIK",        state: "Maharashtra" },
  { id: "nagpur",        label: "Nagpur",        labelUpper: "NAGPUR",        state: "Maharashtra" },
  { id: "indore",        label: "Indore",        labelUpper: "INDORE",        state: "Madhya Pradesh" },
  { id: "kochi",         label: "Kochi",         labelUpper: "KOCHI",         state: "Kerala" },
  { id: "surat",         label: "Surat",         labelUpper: "SURAT",         state: "Gujarat" },
  { id: "gandhinagar",   label: "Gandhinagar",   labelUpper: "GANDHINAGAR",   state: "Gujarat" },
  { id: "vadodara",      label: "Vadodara",      labelUpper: "VADODARA",      state: "Gujarat" },
  { id: "bhopal",        label: "Bhopal",        labelUpper: "BHOPAL",        state: "Madhya Pradesh" },
  { id: "ghaziabad",     label: "Ghaziabad",     labelUpper: "GHAZIABAD",     state: "Uttar Pradesh" },
  { id: "chandigarh",    label: "Chandigarh",    labelUpper: "CHANDIGARH",    state: "Chandigarh" },
  { id: "rajkot",        label: "Rajkot",        labelUpper: "RAJKOT",        state: "Gujarat" },
  { id: "kolhapur",      label: "Kolhapur",      labelUpper: "KOLHAPUR",      state: "Maharashtra" },
  { id: "jodhpur",       label: "Jodhpur",       labelUpper: "JODHPUR",       state: "Rajasthan" },
  { id: "goa",           label: "Goa",           labelUpper: "GOA",           state: "Goa" },
  { id: "sangli",        label: "Sangli",        labelUpper: "SANGLI",        state: "Maharashtra" },
  { id: "faridabad",     label: "Faridabad",     labelUpper: "FARIDABAD",     state: "Haryana" },
  { id: "solapur",       label: "Solapur",       labelUpper: "SOLAPUR",       state: "Maharashtra" },
  { id: "amravati",      label: "Amravati",      labelUpper: "AMRAVATI",      state: "Maharashtra" },
  { id: "nanded",        label: "Nanded",        labelUpper: "NANDED",        state: "Maharashtra" },
  { id: "latur",         label: "Latur",         labelUpper: "LATUR",         state: "Maharashtra" },
  { id: "mangaluru",     label: "Mangaluru",     labelUpper: "MANGALURU",     state: "Karnataka" },
  { id: "jalgaon",       label: "Jalgaon",       labelUpper: "JALGAON",       state: "Maharashtra" },
  { id: "akola",         label: "Akola",         labelUpper: "AKOLA",         state: "Maharashtra" },
  { id: "malegaon",      label: "Malegaon",      labelUpper: "MALEGAON",      state: "Maharashtra" },
  { id: "mysuru",        label: "Mysuru",        labelUpper: "MYSURU",        state: "Karnataka" },
  { id: "dhule",         label: "Dhule",         labelUpper: "DHULE",         state: "Maharashtra" },
  { id: "ahilyanagar",   label: "Ahilyanagar",   labelUpper: "AHILYANAGAR",   state: "Maharashtra" },
  { id: "udaipur",       label: "Udaipur",       labelUpper: "UDAIPUR",       state: "Rajasthan" },
  { id: "raipur",        label: "Raipur",        labelUpper: "RAIPUR",        state: "Chhattisgarh" },
  { id: "satara",        label: "Satara",        labelUpper: "SATARA",        state: "Maharashtra" },
  { id: "jabalpur",      label: "Jabalpur",      labelUpper: "JABALPUR",      state: "Madhya Pradesh" },
  { id: "jalna",         label: "Jalna",         labelUpper: "JALNA",         state: "Maharashtra" },
  { id: "belagavi",      label: "Belagavi",      labelUpper: "BELAGAVI",      state: "Karnataka" },
  { id: "chandrapur",    label: "Chandrapur",    labelUpper: "CHANDRAPUR",    state: "Maharashtra" },
  { id: "kota",          label: "Kota",          labelUpper: "KOTA",          state: "Rajasthan" },
  { id: "hubballi",      label: "Hubballi",      labelUpper: "HUBBALLI",      state: "Karnataka" },
  { id: "yavatmal",      label: "Yavatmal",      labelUpper: "YAVATMAL",      state: "Maharashtra" },
  { id: "gwalior",       label: "Gwalior",       labelUpper: "GWALIOR",       state: "Madhya Pradesh" },
  { id: "ratnagiri",     label: "Ratnagiri",     labelUpper: "RATNAGIRI",     state: "Maharashtra" },
  { id: "beed",          label: "Beed",          labelUpper: "BEED",          state: "Maharashtra" },
];

export type CityInfo = { id: CityId; label: string; labelUpper: string; state: CityState };

/** Curated entry, or a derived one for a city the database has that this file does not. */
export function cityInfo(id: string): CityInfo {
  const known = CITIES.find((c) => c.id === id);
  if (known) return known;
  const label = id
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
  return { id, label, labelUpper: label.toUpperCase(), state: "India" };
}

/**
 * Prose from a list of city labels, biggest first. Static constants
 * below use CITIES; lib/queries/cities.ts getCityCopy() feeds it the
 * live list so server pages can say the real city count.
 */
export function cityCopyFrom(labels: readonly string[]): { count: number; list: string; listAnd: string; short: string } {
  const named = labels.slice(0, 5);
  const rest = labels.length - named.length;
  const joinAnd = (xs: readonly string[], and: string) =>
    xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} ${and} ${xs.at(-1)}`;
  // <title> budget: the biggest cities that fit in about 28 characters
  // with "& more", so "Hyderabad, Bangalore & more" rather than a title
  // Google truncates or rewrites.
  const SHORT_MAX = 28;
  let short = joinAnd(labels, "&");
  if (labels.length > 3) {
    const picked: string[] = [];
    for (const l of labels.slice(0, 3)) {
      if (picked.length > 0 && `${[...picked, l].join(", ")} & more`.length > SHORT_MAX) break;
      picked.push(l);
    }
    short = `${picked.join(", ")} & more`;
  }
  return {
    count: labels.length,
    list: rest > 0 ? `${named.join(", ")} & ${rest} more` : joinAnd(named, "&"),
    listAnd: rest > 0 ? `${named.join(", ")} and ${rest} more cities` : joinAnd(named, "and"),
    short,
  };
}

const STATIC_COPY = cityCopyFrom(CITIES.map((c) => c.label));
/** Prose lists name the first five and count the rest: "Hyderabad, Bangalore, Mumbai, Pune, Delhi & 49 more". Static fallback; server code should prefer getCityCopy() in lib/queries/cities.ts for a live count. */
export const CITY_LIST = STATIC_COPY.list;
/** "Hyderabad, Bangalore, Mumbai, Pune, Delhi and 49 more cities". */
export const CITY_LIST_AND = STATIC_COPY.listAnd;
/** For <title> tags: "Hyderabad, Bangalore & more". */
export const CITY_LIST_SHORT = STATIC_COPY.short;

/** State for structured data. */
export function stateFor(id: CityId | string | null | undefined): CityState {
  return CITIES.find((c) => c.id === id)?.state ?? "India";
}

export const CITY_IDS: readonly CityId[] = CITIES.map((c) => c.id);

/** A plausible city slug: lower-case letters and hyphens. The database decides if it exists. */
export function isCity(value: string | null | undefined): value is CityId {
  return typeof value === "string" && /^[a-z][a-z-]{1,30}$/.test(value);
}

export function labelFor(id: CityId): string {
  return cityInfo(id).label;
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
  // Every other curated city by its label, biggest first, on a word
  // boundary so "Goa" does not match "goal" or "Kota" "Kotamangalam".
  for (const c of CITIES) {
    if (new RegExp(`\\b${c.label.toLowerCase()}\\b`).test(a)) return c.id;
  }
  return null;
}

// ── City cookie: one value that the proxy, the server pages and the client share ──
//
// tt_city holds the visitor's city choice, first-party, readable by JS:
//   "pune"       confirmed pick (pick screen, picker, GPS, "Make this my city")
//   "geo.pune"   detected from the IP by proxy.ts, detected again on every
//                request (a new IP city replaces it); not confirmed, so /,
//                /turfs and /games show the pick screen with Pune as the
//                one-tap answer
//   "unknown"    detection ran and found nothing; the pick screen shows
//   "all"        retired 20 Oct 2026 ("Show all of India" is gone). Still
//                parsed, never written: the proxy treats it as unconfirmed,
//                detects again and replaces it
//   missing      crawler, cookies blocked, or never seen
// Only a confirmed pick unlocks the city twins of /, /turfs and /games.
// Every value uses only [a-z.-], so it is never percent-encoded.
// This file stays import-free and pure: proxy.ts bundles it.

export const CITY_COOKIE = "tt_city";
export const CITY_COOKIE_MAX_AGE = 31536000;

/** sessionStorage: the confirmed pick the server last re-issued this session (setCityPref, CitySync). */
export const CITY_REISSUED_KEY = "tt_city_reissued";
/** sessionStorage: "<city>|<url>" of the last pick screen left for a confirmed pick (pick guard, CitySync). */
export const PICK_LEFT_KEY = "tt_pick_left";

export type CityChoice =
  | { kind: "city"; city: CityId; src: "pick" | "geo" }
  | { kind: "all" }
  | { kind: "unknown" };

/** True only for a curated city id. */
export function isKnownCity(id: string | null | undefined): id is CityId {
  return typeof id === "string" && CITY_IDS.includes(id);
}

export function parseCityCookie(raw: string | null | undefined): CityChoice | null {
  if (!raw) return null;
  const v = raw.trim();
  if (v === "all") return { kind: "all" };
  if (v === "unknown") return { kind: "unknown" };
  if (v.startsWith("geo.")) {
    const id = v.slice(4);
    return isKnownCity(id) ? { kind: "city", city: id, src: "geo" } : null;
  }
  return isKnownCity(v) ? { kind: "city", city: v, src: "pick" } : null;
}

export function serializeCityChoice(c: CityChoice): string {
  if (c.kind === "city") return c.src === "geo" ? `geo.${c.city}` : c.city;
  return c.kind;
}

/** The city a choice scopes pages to, or null for all of India. */
export function scopeOf(c: CityChoice | null): CityId | null {
  return c && c.kind === "city" ? c.city : null;
}

/** The city a person confirmed (src "pick"), or null: IP guesses, unknown and the old "all" are not confirmed. */
export function confirmedCity(c: CityChoice | null): CityId | null {
  return c && c.kind === "city" && c.src === "pick" ? c.city : null;
}

/** Common and old names a visitor (or Vercel's IP city header) may use. */
export const CITY_ALIASES: Record<string, CityId> = {
  bengaluru: "bangalore",
  gurugram: "gurgaon",
  aurangabad: "sambhajinagar",
  "chhatrapati sambhajinagar": "sambhajinagar",
  ahmednagar: "ahilyanagar",
  "navi mumbai": "mumbai",
  thane: "mumbai",
  "new delhi": "delhi",
  secunderabad: "hyderabad",
  nasik: "nashik",
  bombay: "mumbai",
  poona: "pune",
  calcutta: "kolkata",
  madras: "chennai",
  mysore: "mysuru",
  mangalore: "mangaluru",
  belgaum: "belagavi",
  hubli: "hubballi",
  baroda: "vadodara",
  cochin: "kochi",
};

// ── Distances ──────────────────────────────────────────────

// Rough centroid of each city. We only need to pick the closer one,
// exact position doesn't matter.
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
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
  yavatmal: { lat: 20.3899, lng: 78.1307 },
  ratnagiri: { lat: 16.9902, lng: 73.3120 },
  beed: { lat: 18.9891, lng: 75.7601 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  coimbatore: { lat: 11.0168, lng: 76.9558 },
  ahmedabad: { lat: 23.0225, lng: 72.5714 },
  surat: { lat: 21.1702, lng: 72.8311 },
  gandhinagar: { lat: 23.2156, lng: 72.6369 },
  vadodara: { lat: 22.3072, lng: 73.1812 },
  rajkot: { lat: 22.3039, lng: 70.8022 },
  kolkata: { lat: 22.5726, lng: 88.3639 },
  jaipur: { lat: 26.9124, lng: 75.7873 },
  jodhpur: { lat: 26.2389, lng: 73.0243 },
  udaipur: { lat: 24.5854, lng: 73.7125 },
  kota: { lat: 25.2138, lng: 75.8648 },
  lucknow: { lat: 26.8467, lng: 80.9462 },
  indore: { lat: 22.7196, lng: 75.8577 },
  bhopal: { lat: 23.2599, lng: 77.4126 },
  jabalpur: { lat: 23.1815, lng: 79.9864 },
  gwalior: { lat: 26.2183, lng: 78.1828 },
  kochi: { lat: 9.9312, lng: 76.2673 },
  chandigarh: { lat: 30.7333, lng: 76.7794 },
  goa: { lat: 15.4909, lng: 73.8278 },
  mangaluru: { lat: 12.9141, lng: 74.8560 },
  mysuru: { lat: 12.2958, lng: 76.6394 },
  belagavi: { lat: 15.8497, lng: 74.4977 },
  hubballi: { lat: 15.3647, lng: 75.1240 },
  raipur: { lat: 21.2514, lng: 81.6296 },
};

export function cityCoords(id: string): { lat: number; lng: number } | null {
  return CITY_COORDS[id] ?? null;
}

/** Haversine: km between two lat/lng points. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Rounded km between two city centroids, or null when either has none. */
export function kmBetween(a: string, b: string): number | null {
  const pa = cityCoords(a);
  const pb = cityCoords(b);
  if (!pa || !pb) return null;
  return Math.round(distanceKm(pa, pb));
}

/** The closest curated city to a point, however far. */
export function nearestCityAny(lat: number, lng: number): { id: CityId; km: number } {
  const pt = { lat, lng };
  let best: { id: CityId; km: number } = { id: CITY_IDS[0], km: Infinity };
  for (const id of Object.keys(CITY_COORDS)) {
    if (!isKnownCity(id)) continue;
    const km = distanceKm(pt, CITY_COORDS[id]);
    if (km < best.km) best = { id, km };
  }
  return { id: best.id, km: Math.round(best.km) };
}

/**
 * Guess the closest city from a lat/lng. If the point is > 200km from
 * all of them (user isn't near any city we list), return null so we don't force
 * them into a city that isn't theirs.
 */
export function nearestCity(lat: number, lng: number): CityId | null {
  const pt = { lat, lng };
  let best: { id: CityId; km: number } | null = null;
  for (const id of Object.keys(CITY_COORDS)) {
    const km = distanceKm(pt, CITY_COORDS[id]);
    if (!best || km < best.km) best = { id, km };
  }
  if (!best || best.km > 200) return null;
  return best.id;
}

/**
 * Rows ordered by distance from one city: rows with a centroid first,
 * nearest first; rows without one keep their incoming order at the end.
 */
export function byDistanceFrom<T extends { id: string }>(from: string, rows: T[]): (T & { km: number | null })[] {
  const withKm = rows.map((r, i) => ({ r: { ...r, km: kmBetween(from, r.id) }, i }));
  return withKm
    .sort((a, b) => {
      if (a.r.km == null && b.r.km == null) return a.i - b.i;
      if (a.r.km == null) return 1;
      if (b.r.km == null) return -1;
      return a.r.km - b.r.km || a.i - b.i;
    })
    .map((x) => x.r);
}

export type CityScope =
  | { kind: "city"; id: string; label: string; requested: null }
  | { kind: "city"; id: string; label: string; requested: { id: string; label: string; km: number } }
  | { kind: "india"; requested: { id: string; label: string } | null };

/**
 * What a page should show for a requested city: that city when it has
 * turfs, else the nearest live city within 200 km, else all of India.
 */
export function resolveCityScope(requested: string | null, live: { id: string; label: string }[]): CityScope {
  if (!requested) return { kind: "india", requested: null };
  const hit = live.find((c) => c.id === requested);
  if (hit) return { kind: "city", id: hit.id, label: hit.label, requested: null };
  const req = { id: requested, label: labelFor(requested) };
  const at = cityCoords(requested);
  if (at) {
    let best: { c: { id: string; label: string }; km: number } | null = null;
    for (const c of live) {
      const p = cityCoords(c.id);
      if (!p) continue;
      const km = distanceKm(at, p);
      if (!best || km < best.km) best = { c, km };
    }
    if (best && best.km <= 200) {
      return { kind: "city", id: best.c.id, label: best.c.label, requested: { ...req, km: Math.round(best.km) } };
    }
  }
  return { kind: "india", requested: req };
}

/**
 * Cities matching a typed query: label, any word of the label, id,
 * state or a known alias ("bom" finds Mumbai). Label prefix first,
 * then the bigger city.
 */
export function matchCities<T extends { id: string; label: string; state?: string; n?: number }>(q: string, list: T[]): T[] {
  const s = q.trim().toLowerCase();
  if (!s) return list;
  const aliasIds = new Set(
    Object.entries(CITY_ALIASES)
      .filter(([k]) => k.startsWith(s))
      .map(([, v]) => v),
  );
  const scored = list
    .map((c, i) => {
      const label = c.label.toLowerCase();
      const labelHit = label.startsWith(s);
      const hit =
        labelHit ||
        label.split(/[\s-]+/).some((w) => w.startsWith(s)) ||
        c.id.startsWith(s) ||
        (c.state ?? "").toLowerCase().startsWith(s) ||
        aliasIds.has(c.id);
      return { c, i, hit, labelHit };
    })
    .filter((x) => x.hit);
  scored.sort((a, b) => Number(b.labelHit) - Number(a.labelHit) || (b.c.n ?? 0) - (a.c.n ?? 0) || a.i - b.i);
  return scored.map((x) => x.c);
}

// ── Client helpers (safe to import on the server: each one no-ops there) ──

const KEY = "tapturf_city_v1";
const TS_KEY = "tapturf_city_ts";
const MIG_KEY = "tapturf_city_mig_v2";

/** Where a pick came from (GA4 city_chosen). "ask" is the city-first pick screen. */
export type CitySource = "ask" | "picker" | "gps" | "make_my_city" | "near_me" | "reset";

function rawCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${CITY_COOKIE}=([^;]*)`));
  return m ? m[1] : null;
}

/** The parsed tt_city cookie, or null when missing or malformed. */
export function readCityChoice(): CityChoice | null {
  return parseCityCookie(rawCookie());
}

/**
 * The visitor's city for send-time readers (Ask, game draft). Cookie
 * first: all and unknown mean no city. With no valid cookie at all, the
 * legacy localStorage value.
 */
export function getCityPref(): CityId | null {
  if (typeof window === "undefined") return null;
  const c = readCityChoice();
  if (c) return scopeOf(c);
  try {
    const v = localStorage.getItem(KEY);
    return isKnownCity(v) ? v : null;
  } catch {
    return null;
  }
}

// GA4 event, inlined so this file stays import-free (lib/analytics/city.ts is the shared helper).
function track(event: string, params: Record<string, string | number | boolean>) {
  try {
    const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    gtag?.("event", event, params);
  } catch {
    /* ignore */
  }
}

function writeCookie(value: string, maxAge = CITY_COOKIE_MAX_AGE) {
  document.cookie =
    `${CITY_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax` + (location.protocol === "https:" ? "; Secure" : "");
}

/** Mirrors a choice onto <html> so CSS (city line, ask, Make my city) follows it before paint. */
export function applyCityToDocument(c: CityChoice | null): void {
  if (typeof document === "undefined") return;
  const d = document.documentElement;
  d.setAttribute("data-city-state", c ? c.kind : "none");
  if (c && c.kind === "city") {
    d.setAttribute("data-city", c.city);
    d.setAttribute("data-city-src", c.src);
  } else {
    d.removeAttribute("data-city");
    d.removeAttribute("data-city-src");
  }
}

/**
 * Store a confirmed city pick. Writes the cookie and the localStorage
 * mirror, updates <html>, tells the page (tapturf:city-changed) and asks
 * the server to re-issue the cookie. Returns true when the cookie stuck
 * (false when cookies are blocked). There is no "all of India" choice any
 * more, so only a curated city id is accepted.
 */
export function setCityPref(next: CityId, opts: { source?: CitySource } = {}): boolean {
  if (typeof window === "undefined") return false;
  const value = next;
  if (!isKnownCity(value)) return false;
  const prior = readCityChoice();
  const previous = prior ? serializeCityChoice(prior) : "none";
  writeCookie(value);
  const after = readCityChoice();
  const stuck = Boolean(after && serializeCityChoice(after) === value);
  try {
    localStorage.setItem(KEY, value);
  } catch { /* ignore */ }
  try {
    localStorage.setItem(TS_KEY, String(Date.now()));
    localStorage.setItem(MIG_KEY, "1");
  } catch { /* ignore */ }
  applyCityToDocument(parseCityCookie(value));
  window.dispatchEvent(
    new CustomEvent("tapturf:city-changed", { detail: { value, source: opts.source, stuck, previous } }),
  );
  fetch("/api/city", {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ choice: value }),
  }).catch(() => {});
  // Re-issued just now: CitySync's once-per-session re-issue skips it.
  try {
    sessionStorage.setItem(CITY_REISSUED_KEY, value);
  } catch { /* ignore */ }
  track("city_chosen", { city: value, source: opts.source ?? "unknown", previous });
  return stuck;
}

/** Forget the choice entirely (cookie and mirror). */
export function clearCityPref(): void {
  if (typeof window === "undefined") return;
  writeCookie("", 0);
  try {
    localStorage.removeItem(KEY);
    localStorage.setItem(TS_KEY, String(Date.now()));
  } catch { /* ignore */ }
  applyCityToDocument(null);
  window.dispatchEvent(new CustomEvent("tapturf:city-changed", { detail: { value: null, stuck: true } }));
}

/** Opens the global city picker sheet (components/city/CityPickerSheet.tsx). */
export function openCityPicker(mode: "list" | "search" = "list"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("tapturf:open-city-picker", { detail: { mode } }));
}

export type LocateResult =
  | { city: CityId }
  | { error: "denied" | "timeout" | "unavailable" | "unsupported" }
  | { error: "far"; nearest: { id: CityId; km: number } };

/**
 * One GPS fix mapped to a city. Only ever called from a tap, so the
 * permission prompt never appears on its own. Never writes the pref.
 *
 * The API's own 7 s timeout covers the fix itself and excludes time on
 * the permission prompt. The extra hard cap (for browsers that never
 * call back) starts only once permission is granted, so a visitor who
 * reads the prompt for a while and then taps Allow still gets a result.
 * While the prompt is up it is a generous 60 s (a dismissed prompt in
 * some browsers never answers at all).
 */
export function locateCity(): Promise<LocateResult> {
  if (typeof window === "undefined" || !("geolocation" in navigator)) {
    return Promise.resolve({ error: "unsupported" });
  }
  return new Promise<LocateResult>((resolve) => {
    let done = false;
    let timer = 0;
    let status: PermissionStatus | null = null;
    const finish = (r: LocateResult) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      if (status) status.onchange = null;
      resolve(r);
    };
    const cap = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => finish({ error: "timeout" }), ms);
    };
    cap(60000);
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (perms?.query) {
      perms
        .query({ name: "geolocation" as PermissionName })
        .then((p) => {
          if (done) return;
          status = p;
          if (p.state === "granted") cap(8000);
          p.onchange = () => {
            if (p.state === "granted") cap(8000);
          };
        })
        .catch(() => cap(8000));
    } else {
      cap(8000);
    }
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          const c = nearestCity(latitude, longitude);
          finish(c ? { city: c } : { error: "far", nearest: nearestCityAny(latitude, longitude) });
        },
        (err) => finish({ error: err.code === 1 ? "denied" : err.code === 3 ? "timeout" : "unavailable" }),
        { enableHighAccuracy: false, timeout: 7000, maximumAge: 900000 },
      );
    } catch {
      finish({ error: "unavailable" });
    }
  });
}
