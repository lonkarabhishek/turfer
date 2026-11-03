import { CITIES, CITY_ALIASES, cityInText, isCity } from "../city";

/**
 * "Other venue": the place a host types when the turf is not on TapTurf
 * (the site owner: "if the turf is not on tapturf give them an option to
 * type other and ask address"). A game then has no TapTurf turf, only
 * these words: games.venue_name, venue_address, venue_area, venue_city
 * and venue_maps_url (supabase/migrations/20261103_game_other_venue.sql,
 * whose private.game_venue_text, game_venue_digits, game_venue_text_ok and
 * game_venue_maps_ok hold the same rules; both are checked against otherVenue.cases.json by
 * npm run test:games and scripts/sql-tests/game_other_venue.check.mjs).
 * Nothing is added to the turfs list. Pure; relative imports only.
 */

export const VENUE_KEYS = ["venue_name", "venue_address", "venue_area", "venue_city", "venue_maps_url"] as const;
export type VenueKey = (typeof VENUE_KEYS)[number];

/** Characters, once spaces are collapsed: [least, most]. The area and the map link may be left out. */
export const VENUE_LENGTH: Record<VenueKey, readonly [number, number]> = {
  venue_name: [2, 80],
  venue_address: [5, 200],
  venue_area: [1, 60],
  venue_city: [2, 60],
  venue_maps_url: [1, 300],
};

/** What a game stores for a typed venue. */
export type OtherVenue = {
  venue_name: string;
  venue_address: string;
  venue_area: string | null;
  /** A city id ("pune") when it is a known one, else the host's words ("Wai"). */
  venue_city: string;
  venue_maps_url: string | null;
};

/** Why a typed field is not taken. */
export type VenueTextProblem = "missing" | "short" | "long" | "phone" | "link" | "email" | "chars";

// Spaces, tabs, line breaks and no-break spaces: one space each run (the
// SQL's '[ \t\n\r\f\v ]+'), then the ends trimmed of spaces only.
const SPACES = /[ \t\n\r\f\v ]+/g;
const CONTROL = /[\u0001-\u001f\u007f]/;
// Digits in India's scripts (Arabic-Indic, Devanagari, Bengali, Gurmukhi,
// Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam) and full-width ones,
// each script's zero; read as 0 to 9 before the phone rule (the SQL's
// private.game_venue_digits translates the same 120 characters).
const DIGIT_ZEROS = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0xff10];
const OTHER_DIGITS = new RegExp(`[${DIGIT_ZEROS.map((z) => `${String.fromCodePoint(z)}-${String.fromCodePoint(z + 9)}`).join("")}]`, "g");
// A phone number: 7 or more digits in a row once the marks people put
// between a number's parts are taken out: spaces, dots, commas, brackets,
// a plus, underscores, dashes, and a slash before 4 or more digits
// ("98220/12345"; a survey number's "1234/567" keeps its slash). Two
// numbers of an address are their own first: a door number of the
// Hyderabad kind ("16-11-740", ward, block, house) and a PIN code after a
// comma ("..., 411045").
const DOOR_NO = /(?<![0-9-])[0-9]{1,2}-[0-9]{1,2}-[0-9]{1,4}(?![0-9-])/g;
const PIN_AFTER_COMMA = /, ?[1-9][0-9]{5}(?![0-9])/g;
const PHONE_GAPS = /[ .,()+_‐-―-]|\/(?=[0-9]{4})/g;
const PHONE = /[0-9]{7,}/;
// A link: a scheme, www., or a name ending in a common domain ("kingsturf.in").
// ".in" with a space and a word after it is a sentence ("bus stand.In front of").
const LINK = /(https?:|www\.|[a-z0-9-]+\.(com|net|org|io|app|gl|ly|me|info|xyz|online|site|page|link|biz)(?![a-z0-9_])|[a-z0-9-]+\.in(?![a-z0-9_])(?! [a-z]))/i;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+/i;
// Only https links to Google Maps (what its Share, Copy link gives), with
// no dot segment ("/maps/../url" opens another Google page), plain or encoded.
const MAPS_HOST = /^https:\/\/(maps\.app\.goo\.gl\/|goo\.gl\/maps(\/|$)|(www\.)?google\.com\/maps([/?#]|$)|maps\.google\.com([/?#]|$))/i;
const DOT_SEGMENT = /\.\.|%2e/i;
const URL_CHARS = /^[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+$/;

/** Every digit read as 0 to 9 (private.game_venue_digits). */
export function asciiDigits(s: string): string {
  return s.replace(OTHER_DIGITS, (d) => {
    const cp = d.codePointAt(0) ?? 0;
    const zero = DIGIT_ZEROS.find((z) => cp >= z && cp <= z + 9) ?? cp;
    return String(cp - zero);
  });
}

/** A phone number in these (collapsed) words, by the rule above. */
function hasPhone(s: string): boolean {
  const t = asciiDigits(s).replace(DOOR_NO, " x ").replace(PIN_AFTER_COMMA, ", x ");
  return PHONE.test(t.replace(PHONE_GAPS, ""));
}

/** Characters as the database counts them (code points, not UTF-16 units). */
const chars = (s: string) => [...s].length;

/** Spaces collapsed, ends trimmed (private.game_venue_text). */
export function venueText(s: string): string {
  return s.replace(SPACES, " ").replace(/^ +| +$/g, "");
}

/**
 * Why these words can't be a venue's name, address, area or city, or
 * null when they can: between `min` and `max` characters once spaces are
 * collapsed, and no phone number, link, email or control character
 * (players reach the host through TapTurf, never a number in the name).
 */
export function venueTextProblem(raw: string, min: number, max: number): VenueTextProblem | null {
  const s = venueText(raw);
  if (!s) return "missing";
  if (chars(s) < min) return "short";
  if (chars(s) > max) return "long";
  if (CONTROL.test(s)) return "chars";
  if (hasPhone(s)) return "phone";
  if (EMAIL.test(s)) return "email";
  if (LINK.test(s)) return "link";
  return null;
}

/** A Google Maps link the page may open: https, a Google Maps host, no dot segment, at most 300 characters, URL characters only (private.game_venue_maps_ok). */
export function isMapsUrl(raw: string | null | undefined): boolean {
  if (typeof raw !== "string") return false;
  const s = venueText(raw);
  return s.length > 0 && chars(s) <= VENUE_LENGTH.venue_maps_url[1] && MAPS_HOST.test(s) && !DOT_SEGMENT.test(s) && URL_CHARS.test(s);
}

/**
 * One field of a body as the database checks it (private.game_field_problem's
 * venue cases): the name, address and city a string the rules take; the
 * area and the map link may also be null or empty. True when it is fine.
 */
export function venueFieldOk(key: VenueKey, v: unknown): boolean {
  const [min, max] = VENUE_LENGTH[key];
  if (key === "venue_area" || key === "venue_maps_url") {
    if (v === null) return true;
    if (typeof v !== "string") return false;
    if (venueText(v) === "") return true;
    return key === "venue_area" ? venueTextProblem(v, min, max) === null : isMapsUrl(v);
  }
  return typeof v === "string" && venueTextProblem(v, min, max) === null;
}

/** Any of the typed venue's fields in the body (a body has a turf or these, never both). */
export function hasVenueKeys(b: Record<string, unknown>): boolean {
  return VENUE_KEYS.some((k) => k in b);
}

/**
 * The typed venue's fields as stored: words collapsed and trimmed, the
 * empty optional ones null, the city as an id when it is a known one.
 * Call after the fields passed venueFieldOk.
 */
export function venueOf(b: Record<string, unknown>): OtherVenue {
  const text = (k: VenueKey) => (typeof b[k] === "string" ? venueText(b[k] as string) : "");
  return {
    venue_name: text("venue_name"),
    venue_address: text("venue_address"),
    venue_area: text("venue_area") || null,
    venue_city: venueCityValue(text("venue_city")),
    venue_maps_url: text("venue_maps_url") || null,
  };
}

/**
 * The city id typed words name: a curated city's id or label ("Pune",
 * "pune"), one of its other names ("Bengaluru"), a live city's id
 * (`live`, for a city the data team added since), or else a curated city
 * the words name among others ("Pune, Maharashtra", "Pune city",
 * "Bangalore Urban"; lib/city.ts cityInText, on word boundaries and with
 * no guess from a state, so "Karimnagar, Telangana" is no city). Null for
 * any other place ("Wai"): it stays the host's words. Only the city box
 * is read, never the address: addresses name roads after other cities
 * ("Mumbai Pune Highway, Lonavala").
 */
export function venueCityId(raw: string | null | undefined, live: readonly string[] = []): string | null {
  const s = venueText(String(raw ?? "")).toLowerCase();
  if (!s) return null;
  const known = CITIES.find((c) => c.id === s || c.label.toLowerCase() === s);
  if (known) return known.id;
  if (CITY_ALIASES[s]) return CITY_ALIASES[s];
  const slug = s.replace(/ +/g, "-");
  if (live.includes(slug)) return slug;
  return cityInText(s);
}

/** What to store as the venue's city: the id when it names one, else the words as typed. */
export function venueCityValue(raw: string, live: readonly string[] = []): string {
  return venueCityId(raw, live) ?? venueText(raw);
}

/**
 * The city a stored venue_city is in, for city lists and filters: a
 * slug-shaped value is an id (the create flow stores ids); other words
 * are matched as venueCityId does. Null when it is no city TapTurf knows.
 */
export function storedVenueCity(v: string | null | undefined): string | null {
  if (!v) return null;
  return isCity(v) ? v : venueCityId(v);
}

/** The page's words for each problem, field by field (the create flow's form and the routes' refusals). */
export function venueProblemText(key: VenueKey, p: VenueTextProblem | "maps"): string {
  const what = { venue_name: "the venue's name", venue_address: "the address", venue_area: "the area", venue_city: "the city", venue_maps_url: "the link" }[key];
  const [min, max] = VENUE_LENGTH[key];
  switch (p) {
    case "missing":
      return key === "venue_name" ? "Add the venue's name." : key === "venue_address" ? "Add the address, so players can find it." : key === "venue_city" ? "Add the city." : `Add ${what}.`;
    case "short":
      return key === "venue_address" ? "Add a bit more: street, landmark or area." : `That's short for ${what}: at least ${min} characters.`;
    case "long":
      return `Keep ${what} to ${max} characters.`;
    case "phone":
      return "Leave out phone numbers: players reach you through TapTurf. A PIN code is fine after a comma.";
    case "link":
      return key === "venue_name" || key === "venue_area" || key === "venue_city" ? "Leave out links. A Google Maps link goes in its own box below." : "Leave out links. Paste a Google Maps link in its own box below.";
    case "email":
      return "Leave out email addresses.";
    case "chars":
      return `Use plain letters and numbers in ${what}.`;
    case "maps":
      return "Paste the link Google Maps gives you (Share, then Copy link). It starts with https://maps.app.goo.gl/.";
  }
}

/** Every problem in a typed venue (the form's), field by field; empty when it can be used. */
export function venueFormProblems(f: { name: string; address: string; area: string; city: string; mapsUrl: string }): Partial<Record<VenueKey, string>> {
  const out: Partial<Record<VenueKey, string>> = {};
  const check = (key: VenueKey, raw: string, optional: boolean) => {
    if (optional && venueText(raw) === "") return;
    const [min, max] = VENUE_LENGTH[key];
    const p = venueTextProblem(raw, min, max);
    if (p) out[key] = venueProblemText(key, p);
  };
  check("venue_name", f.name, false);
  check("venue_address", f.address, false);
  check("venue_area", f.area, true);
  check("venue_city", f.city, false);
  if (venueText(f.mapsUrl) !== "" && !isMapsUrl(f.mapsUrl)) out.venue_maps_url = venueProblemText("venue_maps_url", "maps");
  return out;
}

/**
 * A Google Maps search for a typed venue ("Open in Maps" when the host
 * gave no link): its name, address and city, in that order.
 */
export function venueSearchUrl(v: { name?: string | null; address?: string | null; city?: string | null }): string | null {
  const text = (x: string | null | undefined) => (typeof x === "string" ? venueText(x) : "");
  const words = (s: string) => ` ${s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
  const [name, address, city] = [text(v.name), text(v.address), text(v.city)];
  // The address often ends with the city already: then it is said once.
  const cityToo = city && !words(address).includes(words(city));
  const parts = [name, address, cityToo ? city : ""].filter(Boolean);
  return parts.length ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(", "))}` : null;
}

/**
 * Columns 20261103_game_other_venue.sql adds to games. Until it is
 * applied a read that names one fails (42703, "column games.venue_name
 * does not exist"), and the reader asks again without them.
 */
export const VENUE_COLUMNS = VENUE_KEYS.join(", ");

/** The database has no venue columns yet (the read named one). */
export function missingVenueColumn(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  return !!error && (error.code === "42703" || error.code === "PGRST204" || error.code === "PGRST200") && /venue_/.test(error.message ?? "");
}
