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
 * 26 Oct 2026: every live city, 88). Ties keep the earlier curated
 * order (Coimbatore before Lucknow, Jodhpur before Goa, Faridabad
 * before Solapur), then a newly added city goes alphabetically;
 * getLiveCities() in lib/queries/cities.ts breaks its ties by this
 * index too, so the live and static orders agree until the counts move.
 * Prose lists name the first five (CITY_LIST, CITY_LIST_AND). The id
 * must match turfs.city in the database. Adding a city here gives it a
 * label, state, centroid (CITY_COORDS, so IP and GPS detection can find
 * it) and any other names (CITY_ALIASES); routes, sitemap, pickers and
 * every city count follow the database, so a city the data team adds
 * before it is curated still shows up, with a title-cased label.
 */
export const CITIES: {
  id: CityId;
  label: string;
  labelUpper: string;
  state: CityState;
}[] = [
  { id: "hyderabad",          label: "Hyderabad",          labelUpper: "HYDERABAD",          state: "Telangana" },
  { id: "bangalore",          label: "Bangalore",          labelUpper: "BANGALORE",          state: "Karnataka" },
  { id: "pune",               label: "Pune",               labelUpper: "PUNE",               state: "Maharashtra" },
  { id: "mumbai",             label: "Mumbai",             labelUpper: "MUMBAI",             state: "Maharashtra" },
  { id: "delhi",              label: "Delhi",              labelUpper: "DELHI",              state: "Delhi" },
  { id: "thiruvananthapuram", label: "Thiruvananthapuram", labelUpper: "THIRUVANANTHAPURAM", state: "Kerala" },
  { id: "chennai",            label: "Chennai",            labelUpper: "CHENNAI",            state: "Tamil Nadu" },
  { id: "nashik",             label: "Nashik",             labelUpper: "NASHIK",             state: "Maharashtra" },
  { id: "ahmedabad",          label: "Ahmedabad",          labelUpper: "AHMEDABAD",          state: "Gujarat" },
  { id: "kolkata",            label: "Kolkata",            labelUpper: "KOLKATA",            state: "West Bengal" },
  { id: "noida",              label: "Noida",              labelUpper: "NOIDA",              state: "Uttar Pradesh" },
  { id: "gurgaon",            label: "Gurgaon",            labelUpper: "GURGAON",            state: "Haryana" },
  { id: "jaipur",             label: "Jaipur",             labelUpper: "JAIPUR",             state: "Rajasthan" },
  { id: "coimbatore",         label: "Coimbatore",         labelUpper: "COIMBATORE",         state: "Tamil Nadu" },
  { id: "lucknow",            label: "Lucknow",            labelUpper: "LUCKNOW",            state: "Uttar Pradesh" },
  { id: "sambhajinagar",      label: "Sambhajinagar",      labelUpper: "SAMBHAJINAGAR",      state: "Maharashtra" },
  { id: "nagpur",             label: "Nagpur",             labelUpper: "NAGPUR",             state: "Maharashtra" },
  { id: "indore",             label: "Indore",             labelUpper: "INDORE",             state: "Madhya Pradesh" },
  { id: "kochi",              label: "Kochi",              labelUpper: "KOCHI",              state: "Kerala" },
  { id: "surat",              label: "Surat",              labelUpper: "SURAT",              state: "Gujarat" },
  { id: "gandhinagar",        label: "Gandhinagar",        labelUpper: "GANDHINAGAR",        state: "Gujarat" },
  { id: "salem",              label: "Salem",              labelUpper: "SALEM",              state: "Tamil Nadu" },
  { id: "kozhikode",          label: "Kozhikode",          labelUpper: "KOZHIKODE",          state: "Kerala" },
  { id: "dehradun",           label: "Dehradun",           labelUpper: "DEHRADUN",           state: "Uttarakhand" },
  { id: "tiruchirappalli",    label: "Tiruchirappalli",    labelUpper: "TIRUCHIRAPPALLI",    state: "Tamil Nadu" },
  { id: "vadodara",           label: "Vadodara",           labelUpper: "VADODARA",           state: "Gujarat" },
  { id: "bhopal",             label: "Bhopal",             labelUpper: "BHOPAL",             state: "Madhya Pradesh" },
  { id: "vijayawada",         label: "Vijayawada",         labelUpper: "VIJAYAWADA",         state: "Andhra Pradesh" },
  { id: "madurai",            label: "Madurai",            labelUpper: "MADURAI",            state: "Tamil Nadu" },
  { id: "ghaziabad",          label: "Ghaziabad",          labelUpper: "GHAZIABAD",          state: "Uttar Pradesh" },
  { id: "visakhapatnam",      label: "Visakhapatnam",      labelUpper: "VISAKHAPATNAM",      state: "Andhra Pradesh" },
  { id: "chandigarh",         label: "Chandigarh",         labelUpper: "CHANDIGARH",         state: "Chandigarh" },
  { id: "rajkot",             label: "Rajkot",             labelUpper: "RAJKOT",             state: "Gujarat" },
  { id: "erode",              label: "Erode",              labelUpper: "ERODE",              state: "Tamil Nadu" },
  { id: "kolhapur",           label: "Kolhapur",           labelUpper: "KOLHAPUR",           state: "Maharashtra" },
  { id: "jodhpur",            label: "Jodhpur",            labelUpper: "JODHPUR",            state: "Rajasthan" },
  { id: "goa",                label: "Goa",                labelUpper: "GOA",                state: "Goa" },
  { id: "kanpur",             label: "Kanpur",             labelUpper: "KANPUR",             state: "Uttar Pradesh" },
  { id: "patna",              label: "Patna",              labelUpper: "PATNA",              state: "Bihar" },
  { id: "sangli",             label: "Sangli",             labelUpper: "SANGLI",             state: "Maharashtra" },
  { id: "thrissur",           label: "Thrissur",           labelUpper: "THRISSUR",           state: "Kerala" },
  { id: "faridabad",          label: "Faridabad",          labelUpper: "FARIDABAD",          state: "Haryana" },
  { id: "solapur",            label: "Solapur",            labelUpper: "SOLAPUR",            state: "Maharashtra" },
  { id: "amravati",           label: "Amravati",           labelUpper: "AMRAVATI",           state: "Maharashtra" },
  { id: "nanded",             label: "Nanded",             labelUpper: "NANDED",             state: "Maharashtra" },
  { id: "tirupati",           label: "Tirupati",           labelUpper: "TIRUPATI",           state: "Andhra Pradesh" },
  { id: "guwahati",           label: "Guwahati",           labelUpper: "GUWAHATI",           state: "Assam" },
  { id: "latur",              label: "Latur",              labelUpper: "LATUR",              state: "Maharashtra" },
  { id: "mangaluru",          label: "Mangaluru",          labelUpper: "MANGALURU",          state: "Karnataka" },
  { id: "bhubaneswar",        label: "Bhubaneswar",        labelUpper: "BHUBANESWAR",        state: "Odisha" },
  { id: "guntur",             label: "Guntur",             labelUpper: "GUNTUR",             state: "Andhra Pradesh" },
  { id: "jalgaon",            label: "Jalgaon",            labelUpper: "JALGAON",            state: "Maharashtra" },
  { id: "akola",              label: "Akola",              labelUpper: "AKOLA",              state: "Maharashtra" },
  { id: "malegaon",           label: "Malegaon",           labelUpper: "MALEGAON",           state: "Maharashtra" },
  { id: "mysuru",             label: "Mysuru",             labelUpper: "MYSURU",             state: "Karnataka" },
  { id: "agra",               label: "Agra",               labelUpper: "AGRA",               state: "Uttar Pradesh" },
  { id: "dhule",              label: "Dhule",              labelUpper: "DHULE",              state: "Maharashtra" },
  { id: "ahilyanagar",        label: "Ahilyanagar",        labelUpper: "AHILYANAGAR",        state: "Maharashtra" },
  { id: "udaipur",            label: "Udaipur",            labelUpper: "UDAIPUR",            state: "Rajasthan" },
  { id: "raipur",             label: "Raipur",             labelUpper: "RAIPUR",             state: "Chhattisgarh" },
  { id: "ranchi",             label: "Ranchi",             labelUpper: "RANCHI",             state: "Jharkhand" },
  { id: "satara",             label: "Satara",             labelUpper: "SATARA",             state: "Maharashtra" },
  { id: "kalaburagi",         label: "Kalaburagi",         labelUpper: "KALABURAGI",         state: "Karnataka" },
  { id: "jamnagar",           label: "Jamnagar",           labelUpper: "JAMNAGAR",           state: "Gujarat" },
  { id: "jabalpur",           label: "Jabalpur",           labelUpper: "JABALPUR",           state: "Madhya Pradesh" },
  { id: "kurnool",            label: "Kurnool",            labelUpper: "KURNOOL",            state: "Andhra Pradesh" },
  { id: "puducherry",         label: "Puducherry",         labelUpper: "PUDUCHERRY",         state: "Puducherry" },
  { id: "amritsar",           label: "Amritsar",           labelUpper: "AMRITSAR",           state: "Punjab" },
  { id: "prayagraj",          label: "Prayagraj",          labelUpper: "PRAYAGRAJ",          state: "Uttar Pradesh" },
  { id: "bhavnagar",          label: "Bhavnagar",          labelUpper: "BHAVNAGAR",          state: "Gujarat" },
  { id: "bikaner",            label: "Bikaner",            labelUpper: "BIKANER",            state: "Rajasthan" },
  { id: "jalna",              label: "Jalna",              labelUpper: "JALNA",              state: "Maharashtra" },
  { id: "belagavi",           label: "Belagavi",           labelUpper: "BELAGAVI",           state: "Karnataka" },
  { id: "ajmer",              label: "Ajmer",              labelUpper: "AJMER",              state: "Rajasthan" },
  { id: "ludhiana",           label: "Ludhiana",           labelUpper: "LUDHIANA",           state: "Punjab" },
  { id: "meerut",             label: "Meerut",             labelUpper: "MEERUT",             state: "Uttar Pradesh" },
  { id: "warangal",           label: "Warangal",           labelUpper: "WARANGAL",           state: "Telangana" },
  { id: "chandrapur",         label: "Chandrapur",         labelUpper: "CHANDRAPUR",         state: "Maharashtra" },
  { id: "varanasi",           label: "Varanasi",           labelUpper: "VARANASI",           state: "Uttar Pradesh" },
  { id: "kota",               label: "Kota",               labelUpper: "KOTA",               state: "Rajasthan" },
  { id: "hubballi",           label: "Hubballi",           labelUpper: "HUBBALLI",           state: "Karnataka" },
  { id: "davanagere",         label: "Davanagere",         labelUpper: "DAVANAGERE",         state: "Karnataka" },
  { id: "kannur",             label: "Kannur",             labelUpper: "KANNUR",             state: "Kerala" },
  { id: "nellore",            label: "Nellore",            labelUpper: "NELLORE",            state: "Andhra Pradesh" },
  { id: "jalandhar",          label: "Jalandhar",          labelUpper: "JALANDHAR",          state: "Punjab" },
  { id: "yavatmal",           label: "Yavatmal",           labelUpper: "YAVATMAL",           state: "Maharashtra" },
  { id: "shivamogga",         label: "Shivamogga",         labelUpper: "SHIVAMOGGA",         state: "Karnataka" },
  { id: "siliguri",           label: "Siliguri",           labelUpper: "SILIGURI",           state: "West Bengal" },
  { id: "anand",              label: "Anand",              labelUpper: "ANAND",              state: "Gujarat" },
  { id: "tirunelveli",        label: "Tirunelveli",        labelUpper: "TIRUNELVELI",        state: "Tamil Nadu" },
  { id: "gwalior",            label: "Gwalior",            labelUpper: "GWALIOR",            state: "Madhya Pradesh" },
  { id: "ujjain",             label: "Ujjain",             labelUpper: "UJJAIN",             state: "Madhya Pradesh" },
  { id: "cuttack",            label: "Cuttack",            labelUpper: "CUTTACK",            state: "Odisha" },
  { id: "ratnagiri",          label: "Ratnagiri",          labelUpper: "RATNAGIRI",          state: "Maharashtra" },
  { id: "beed",               label: "Beed",               labelUpper: "BEED",               state: "Maharashtra" },
  { id: "dhanbad",            label: "Dhanbad",            labelUpper: "DHANBAD",            state: "Jharkhand" },
];

export type CityInfo = { id: CityId; label: string; labelUpper: string; state: CityState };

/** A live city and its active turf count, as server pages hand it to the pickers (labels come from cityInfo). */
export type CityCount = { id: CityId; n: number };

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
 * Prose from a list of city labels, biggest first. lib/queries/cities.ts
 * getCityCopy() feeds it the live list so server pages can say the real
 * city count; the static constants below never count.
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
    listAnd: rest > 0 ? `${named.join(", ")} and ${rest} more ${rest === 1 ? "city" : "cities"}` : joinAnd(named, "and"),
    short,
  };
}

// The static lists name the five biggest curated cities and never state a
// count: the database adds cities without a deploy, so a number baked in
// here went stale ("& 49 more" while 87 cities were live, 26 Oct). Server
// code that can afford the cached read uses getCityCopy() for the count.
const FIRST_FIVE = CITIES.slice(0, 5).map((c) => c.label).join(", ");
/** "Hyderabad, Bangalore, Pune, Mumbai, Delhi & more". Count-free; getCityCopy() in lib/queries/cities.ts has the live count. */
export const CITY_LIST = `${FIRST_FIVE} & more`;
/** "Hyderabad, Bangalore, Pune, Mumbai, Delhi and more cities". */
export const CITY_LIST_AND = `${FIRST_FIVE} and more cities`;
/** For <title> tags: "Hyderabad, Bangalore & more". */
export const CITY_LIST_SHORT = cityCopyFrom(CITIES.map((c) => c.label)).short;

/** State for structured data, or undefined for a city not curated yet (JSON.stringify drops it: no region beats "India"). */
export function stateFor(id: CityId | string | null | undefined): CityState | undefined {
  return CITIES.find((c) => c.id === id)?.state;
}

export const CITY_IDS: readonly CityId[] = CITIES.map((c) => c.id);

/** A plausible city slug: lower-case letters and hyphens. The database decides if it exists. */
export function isCity(value: string | null | undefined): value is CityId {
  return typeof value === "string" && /^[a-z][a-z-]{1,30}$/.test(value);
}

/**
 * Slug-shaped values that are never a city: the cookie's other states,
 * the pick screen's segments, /api/city's "reset", and every top-level
 * route a /<city> URL would collide with. The pre-paint script and the
 * pick guard embed the same list (CITY_RESERVED_RE).
 */
export const RESERVED_CITY_SLUGS: readonly string[] = [
  "all", "unknown", "none", "pick", "geo", "reset",
  "admin", "api", "blog", "dashboard", "game", "games", "images", "live", "login", "my",
  "privacy", "sport", "terms", "tools", "turf", "turf-near-me", "turfs",
];
/** Source of a regex for RESERVED_CITY_SLUGS, for the inline ES5 scripts. Only [a-z-] inside. */
export const CITY_RESERVED_RE = `^(?:${RESERVED_CITY_SLUGS.join("|")})$`;

/**
 * A city a visitor may choose: slug-shaped and not reserved. Curated or
 * not, so a city the data team added after the last deploy can be
 * picked; the server decides whether it has turfs (isLiveCity in
 * lib/queries/cities.ts, /api/city, the app/c/[city] guard). The strict
 * pattern is what keeps it safe in a URL path, a cookie or a CSS selector.
 */
export function isCitySlug(value: string | null | undefined): value is CityId {
  return isCity(value) && !RESERVED_CITY_SLUGS.includes(value);
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
  if (a.includes("hyderabad") || a.includes("secunderabad")) return "hyderabad";
  if (a.includes("bangalore") || a.includes("bengaluru")) return "bangalore";
  if (a.includes("gurgaon") || a.includes("gurugram")) return "gurgaon";
  if (a.includes("noida")) return "noida";
  if (a.includes("ghaziabad")) return "ghaziabad";
  if (a.includes("faridabad")) return "faridabad";
  // Before Delhi: "Delhi Road, Meerut" is Meerut.
  if (a.includes("meerut")) return "meerut";
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
    if (!NOT_IN_TEXT.has(c.id) && new RegExp(`\\b${c.label.toLowerCase()}\\b`).test(a)) return c.id;
  }
  // Then the other names ("Davangere", "Hanamkonda", "Calicut"), after
  // every label so "Trichy Road, Coimbatore" stays Coimbatore.
  for (const [alias, id] of Object.entries(CITY_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`).test(a)) return id;
  }
  // Last: a Telangana address that named no city (Warangal ones say
  // Hanamkonda, caught above) is most likely Hyderabad.
  if (a.includes("telangana")) return "hyderabad";
  return null;
}

// ── City cookie: one value that the proxy, the server pages and the client share ──
//
// tt_city holds the visitor's city choice, first-party, readable by JS:
//   "pune"       confirmed pick (pick screen, picker, GPS, "Make this my city"):
//                any city slug (isCitySlug), curated or not, so a city the
//                data team added since the last deploy can be chosen; the
//                server pages 404 one with no turfs and CitySync forgets it
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

/**
 * True only for a curated city id: one with a label, state and centroid
 * here. Not a gate for a city choice (isCitySlug is); IP detection only
 * ever yields one of these, which is what the geo.<id> cookie and the
 * pick screen's static variants (app/c/pick/[city]) rely on.
 */
export function isKnownCity(id: string | null | undefined): id is CityId {
  return typeof id === "string" && CITY_IDS.includes(id);
}

/**
 * A pick is any city slug, so an uncurated city survives a reload; an IP
 * guess only a curated id, since detection produces nothing else and a
 * forged geo.<x> must not send the proxy to a pick screen never built.
 */
export function parseCityCookie(raw: string | null | undefined): CityChoice | null {
  if (!raw) return null;
  const v = raw.trim();
  if (v === "all") return { kind: "all" };
  if (v === "unknown") return { kind: "unknown" };
  if (v.startsWith("geo.")) {
    const id = v.slice(4);
    return isKnownCity(id) ? { kind: "city", city: id, src: "geo" } : null;
  }
  return isCitySlug(v) ? { kind: "city", city: v, src: "pick" } : null;
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
  trivandrum: "thiruvananthapuram",
  calicut: "kozhikode",
  trichur: "thrissur",
  cannanore: "kannur",
  trichy: "tiruchirappalli",
  tiruchi: "tiruchirappalli",
  vizag: "visakhapatnam",
  vishakhapatnam: "visakhapatnam",
  bezawada: "vijayawada",
  tirupathi: "tirupati",
  allahabad: "prayagraj",
  banaras: "varanasi",
  benares: "varanasi",
  gulbarga: "kalaburagi",
  kalburgi: "kalaburagi",
  shimoga: "shivamogga",
  davangere: "davanagere",
  gauhati: "guwahati",
  bhubaneshwar: "bhubaneswar",
  "dehra dun": "dehradun",
  // Part of Greater Warangal; most Warangal turf addresses say Hanamkonda.
  hanamkonda: "warangal",
  hanumakonda: "warangal",
  pondicherry: "puducherry",
  pondy: "puducherry",
  jullundur: "jalandhar",
  nellai: "tirunelveli",
};

/**
 * Cities free text never names: Anand is also a first name and an area
 * name ("Anand Vihar" in Delhi, "Anand Nagar" in many cities), and alone
 * it would beat no other city. Detection by IP or GPS and Claude's reading
 * of an Ask message still know it.
 */
export const NOT_IN_TEXT: ReadonlySet<CityId> = new Set(["anand"]);

/**
 * Every phrase that names a curated city (label, id or alias), longest
 * first, so "navi mumbai" is tried before "mumbai".
 */
const CITY_PHRASES: [string, CityId][] = [
  ...CITIES.filter((c) => !NOT_IN_TEXT.has(c.id)).flatMap((c): [string, CityId][] => [[c.label.toLowerCase(), c.id], [c.id, c.id]]),
  ...Object.entries(CITY_ALIASES),
].sort((a, b) => b[0].length - a[0].length);

const CITY_RANK = new Map(CITIES.map((c, i) => [c.id, i]));

/** A road word right after a city name (spaces, hyphens or dashes between): "Mysore Road" and "Old Madras Road" are in Bangalore, "Beed Bypass" in Sambhajinagar. */
const ROAD_AFTER = /^[\s\u2013\u2014-]+(?:road|rd|bypass|highway|hwy|expressway|marg|naka|phata)(?![a-z])/;

/**
 * The curated city free text names, on word boundaries: "goal" is not
 * Goa, "Kotak" is not Kota, "Agrasen" is not Agra. When it names more
 * than one, a name that is part of a road's name loses ("box cricket on
 * Ajmer Road Jaipur" is Jaipur, "Agra Bombay Road Indore" is Indore),
 * then the biggest city wins, as the old includes() fallback did: a
 * locality named after a smaller town sits in the bigger city ("Nanded
 * City Pune" is Pune, "Satara Parisar Sambhajinagar" is Sambhajinagar).
 * A road name alone still counts: "Nashik Road" is in Nashik.
 */
export function cityInText(text: string): CityId | null {
  const t = text.toLowerCase();
  type Hit = { at: number; end: number; id: CityId; road: boolean };
  const found: Hit[] = [];
  for (const [phrase, id] of CITY_PHRASES) {
    const re = new RegExp(`(?:^|[^a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`, "g");
    for (let m = re.exec(t); m; m = re.exec(t)) {
      const at = m.index + (m[0].length - phrase.length);
      found.push({ at, end: at + phrase.length, id, road: false });
    }
  }
  // Leftmost first, the longest at a place: "navi mumbai" keeps its "mumbai".
  found.sort((a, b) => a.at - b.at || b.end - a.end);
  const hits: Hit[] = [];
  for (const h of found) if (!hits.length || h.at >= hits[hits.length - 1].end) hits.push(h);
  // Right to left, so a chain of names before a road word ("agra bombay road") is all road.
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    const next = hits[i + 1];
    h.road = ROAD_AFTER.test(t.slice(h.end)) || (!!next && next.road && /^[\s\u2013\u2014-]+$/.test(t.slice(h.end, next.at)));
  }
  const places = hits.filter((h) => !h.road);
  const pool = places.length ? places : hits;
  // CITIES is biggest first.
  return pool.reduce<Hit | null>((best, h) => (!best || CITY_RANK.get(h.id)! < CITY_RANK.get(best.id)! ? h : best), null)?.id ?? null;
}

// ── Distances ──────────────────────────────────────────────

// Rough centroid of each curated city (every CITIES id has one, which
// test:city checks, and nothing else should). We only need to pick the
// closer one, exact position doesn't matter. IP detection (proxy.ts)
// and GPS can only answer with a city listed here, which keeps their
// answers inside the pick screen's static variants (app/c/pick/[city]).
// A new city's centroid: the median of its active turfs' lat/lng is
// within about 12 km of the city centre for every city added 26 Oct.
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
  thiruvananthapuram: { lat: 8.5241, lng: 76.9366 },
  salem: { lat: 11.6643, lng: 78.1460 },
  kozhikode: { lat: 11.2588, lng: 75.7804 },
  dehradun: { lat: 30.3165, lng: 78.0322 },
  tiruchirappalli: { lat: 10.7905, lng: 78.7047 },
  vijayawada: { lat: 16.5062, lng: 80.6480 },
  madurai: { lat: 9.9252, lng: 78.1198 },
  visakhapatnam: { lat: 17.6868, lng: 83.2185 },
  erode: { lat: 11.3410, lng: 77.7172 },
  kanpur: { lat: 26.4499, lng: 80.3319 },
  patna: { lat: 25.5941, lng: 85.1376 },
  thrissur: { lat: 10.5276, lng: 76.2144 },
  tirupati: { lat: 13.6288, lng: 79.4192 },
  guwahati: { lat: 26.1445, lng: 91.7362 },
  bhubaneswar: { lat: 20.2961, lng: 85.8245 },
  guntur: { lat: 16.3067, lng: 80.4365 },
  agra: { lat: 27.1767, lng: 78.0081 },
  ranchi: { lat: 23.3441, lng: 85.3096 },
  kalaburagi: { lat: 17.3297, lng: 76.8343 },
  kurnool: { lat: 15.8281, lng: 78.0373 },
  amritsar: { lat: 31.6340, lng: 74.8723 },
  prayagraj: { lat: 25.4358, lng: 81.8463 },
  ajmer: { lat: 26.4499, lng: 74.6399 },
  ludhiana: { lat: 30.9010, lng: 75.8573 },
  meerut: { lat: 28.9845, lng: 77.7064 },
  warangal: { lat: 17.9689, lng: 79.5941 },
  varanasi: { lat: 25.3176, lng: 82.9739 },
  davanagere: { lat: 14.4644, lng: 75.9218 },
  kannur: { lat: 11.8745, lng: 75.3704 },
  nellore: { lat: 14.4426, lng: 79.9865 },
  shivamogga: { lat: 13.9299, lng: 75.5681 },
  siliguri: { lat: 26.7271, lng: 88.3953 },
  ujjain: { lat: 23.1765, lng: 75.7885 },
  dhanbad: { lat: 23.7957, lng: 86.4304 },
  // Added 26 Oct evening; each within about 5 km of its turfs' median.
  jamnagar: { lat: 22.4707, lng: 70.0577 },
  puducherry: { lat: 11.9416, lng: 79.8083 },
  bhavnagar: { lat: 21.7645, lng: 72.1519 },
  bikaner: { lat: 28.0229, lng: 73.3119 },
  jalandhar: { lat: 31.3260, lng: 75.5762 },
  anand: { lat: 22.5645, lng: 72.9289 },
  tirunelveli: { lat: 8.7139, lng: 77.7567 },
  cuttack: { lat: 20.4625, lng: 85.8830 },
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
    const km = distanceKm(pt, CITY_COORDS[id]);
    if (km < best.km) best = { id, km };
  }
  return { id: best.id, km: Math.round(best.km) };
}

/**
 * Guess the closest city from a lat/lng. If the point is > 200km from
 * all of them (user isn't near any city we list), return null so we don't force
 * them into a city that isn't theirs. Same candidates as nearestCityAny.
 */
export function nearestCity(lat: number, lng: number): CityId | null {
  const best = nearestCityAny(lat, lng);
  return best.km > 200 ? null : best.id;
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
 * state or a known alias ("bom" finds Mumbai, "triv" Thiruvananthapuram).
 * Label prefix first, then the bigger city. The placeholder state
 * "India" (cityInfo, for an uncurated city) never matches: "ind" is
 * Indore, not every new city.
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
        (c.state !== "India" && (c.state ?? "").toLowerCase().startsWith(s)) ||
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
/**
 * localStorage: "<city>|<source>" of the last confirmed pick, so account
 * calls can tell the server a city was found by GPS rather than picked
 * (lib/account/city.ts). The cookie holds only the city.
 */
export const CITY_SRC_KEY = "tapturf_city_src";

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
    return isCitySlug(v) ? v : null;
  } catch {
    return null;
  }
}

// GA4 event, inlined so this file stays import-free (lib/analytics/city.ts is the shared helper).
// window.gtag exists only after Accept on the cookie banner (lib/analytics/ga.ts), so this is
// a no-op without consent.
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
 * (false when cookies are blocked, or for a value that is not a city
 * slug, which changes nothing: callers check isCitySlug first). There is
 * no "all of India" choice any more. Any city slug is accepted, curated
 * or not; the strict pattern matters, since the value goes raw into
 * document.cookie and into a /<city> URL. /api/city re-issues it only
 * for a curated or live city.
 */
export function setCityPref(next: CityId, opts: { source?: CitySource } = {}): boolean {
  if (typeof window === "undefined") return false;
  const value = next;
  if (!isCitySlug(value)) return false;
  const prior = readCityChoice();
  const previous = prior ? serializeCityChoice(prior) : "none";
  writeCookie(value);
  const after = readCityChoice();
  const stuck = Boolean(after && serializeCityChoice(after) === value);
  try {
    localStorage.setItem(KEY, value);
  } catch { /* ignore */ }
  try {
    if (opts.source) localStorage.setItem(CITY_SRC_KEY, `${value}|${opts.source}`);
    else localStorage.removeItem(CITY_SRC_KEY);
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
  // Re-issued just now: CitySync's once-per-session re-issue skips it. Not
  // for a city that is not curated: the page may unload before this
  // answer, and CitySync's own check on the next load is what forgets a
  // city the server no longer lists (its /, /turfs and /games would 404).
  try {
    if (isKnownCity(value)) sessionStorage.setItem(CITY_REISSUED_KEY, value);
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
