// Relative imports only (npm run test:trend).

/**
 * On a waiting claim's card in admin: the plain facts that point to a
 * player rather than the turf's owner, computed, never guessed. From the
 * 11 real claims up to 5 Nov 2026: the ones that went nowhere were on
 * turfs with no number, signed in by phone (3 of 3), with a note asking to
 * book, or from someone who had tapped Call or WhatsApp and opened several
 * turfs before signing up. How fast someone claims after signing up, Google
 * as where they came from, and the stored name tell nothing (owners do the
 * same), so they are not here.
 */

/**
 * A note that reads like a booking. Careful on purpose: a wrong "Looks like
 * a player" on a real owner's claim costs more than a missed one (the admin
 * reads every note anyway), so an owner's own talk about bookings is taken
 * out first ("open 24 hours", "we take bookings on WhatsApp", "booking from
 * 6 am", "minimum booking 2 hours", "customers can book a slot by calling
 * us"), a note in which the writer says they own or run the turf never
 * counts, and each pattern left is a request to play or to book, in
 * English, the Hinglish players type, or Hindi.
 */
const NUM_WORD = "(?:\\d{1,2}(?:\\.\\d)?|one|two|three|four|five|half\\s+an?|an?)";
const OWNER_BOOKING_TALK: RegExp[] = [
  // "we take bookings", "I am managing booking", "we also accept reservations"
  /\b(?:we|i)\s+(?:also\s+)?(?:am\s+|are\s+)?(?:take|taking|handle|handling|manage|managing|accept|accepting|get|getting|run|running|do|doing|look\s+after|looking\s+after)\s+(?:all\s+)?(?:the\s+)?(?:bookings?|reservations?)\b/g,
  // "booking on WhatsApp", "reservation by call", "booking at the counter"; not "booking at 7" or "booking on sunday"
  /\b(?:bookings?|reservations?)\s+(?:number|no\.?|contact|desk|manager|team|line|via|by|through|are|is\s+(?:on|via|by|through|open|available)|(?:on|at)(?!\s+(?:\d|sun|mon|tue|wed|thu|fri|sat|tomorrow|today|tonight)))\b/g,
  /\bfor\s+(?:bookings?|reservations?)\b/g,
  /\bbookings?\s+for\s+(?:my|our)\s+(?:turf|ground|venue|arena|box|place|court)\b/g,
  // "we book the slot for our customers" (never "can we book", "do we book" or "want to book")
  /(?<!\b(?:can|could|may|shall|should|will|do|to)\s)\b(?:we|i)\s+(?:also\s+)?book\b(?:\s+(?:a|the|your|any|our)\s+(?:slot|turf|ground|court|box|pitch)s?\b)?/g,
  // "customers can book a slot by calling us"; never "can players book" or "can you book"
  /(?<!\b(?:can|could|may|shall|should|will|do|to)\s)\b(?:customers?|players?|people|teams?|anyone|everyone)\s+(?:can\s+)?(?:also\s+)?book\b(?:\s+(?:a|the|your|any|our)\s+(?:slot|turf|ground|court|box|pitch)s?\b)?/g,
  /\byou\s+can\s+(?:also\s+)?book\b(?:\s+(?:a|the|your|any|our)\s+(?:slot|turf|ground|court|box|pitch)s?\b)?/g,
  new RegExp(`\\b(?:minimum|min\\.?)\\s+(?:booking|slot|time)?\\s*(?:is\\s+)?(?:for\\s+|of\\s+)?${NUM_WORD}\\s*(?:hours?|hrs?)\\b`, "g"),
  /\b(?:minimum|min\.?)\s+booking\b/g,
  /\bopen(?:ed)?\s+for\b/g,
  // a slot's length and its price: "slots for 2 hours cost 1200"
  new RegExp(`\\bslots?\\s+(?:of|for)\\s+${NUM_WORD}\\s*(?:hours?|hrs?)\\s+(?=cost|price|priced|charged|rs\\b|inr\\b|₹|=|-|:|\\d{3,})`, "g"),
  /\bbooking\s+(?:from|starts?|timings?|hours?|open)\b/g,
];

/** The writer says the turf is theirs to run: their note is never a player's booking. */
const OWNER_VOICE: RegExp[] = [
  /\b(?:i\s+am|i'm|im|we\s+are|we're)\s+(?:the\s+|its\s+|a\s+)?(?:co-?)?(?:owners?|partners?)\b/,
  /\b(?:i\s+am|i'm|im|we\s+are|we're)\s+(?:the\s+|its\s+|a\s+)?(?:turf\s+|ground\s+)?(?:managers?|staff)\b(?!\s+of\s+(?:my|our|the|a)\s+(?:team|club|group|company|office))/,
  /\b(?:my|our|mera|meri|hamara|hamari)\s+(?:own\s+)?(?:turf|ground|arena|academy|venue)\b/,
  /\b(?:i|we)\s+(?:own|run|manage)\s+(?:it\b|(?:this|the)\s+(?:turf|ground|arena|place|venue|box|academy)\b)/,
];

const PEOPLE = "(?:players|people|persons|boys|girls|friends|guys|ppl|log|members)";
const BOOKING_REQUESTS: RegExp[] = [
  /\b(?:want|wanna|would like|like|need|have|planning|plan|looking)\s+to\s+(?:book|reserve|play)\b/,
  /\b(?:can|could|may)\s+(?:i|we|u|you)\s+(?:book|reserve|play|get\s+(?:a\s+)?slot)\b/,
  /\bbook(?:ing)?\s+(?:a\s+|the\s+|one\s+|this\s+|your\s+)?(?:slot|ground|turf|court|box|pitch|game|match)\b/,
  // "book for 2 hours", "booking for tomorrow", "book for my team"; not an owner's "booking for corporate events"
  /\bbook(?:ing)?\s+for\s+(?:me\b|us\b|tomorrow|today|tonight|this\s+(?:evening|morning|night|weekend|sunday|saturday)|next\s+(?:week|sunday|saturday)|kal\b|sunday|monday|tuesday|wednesday|thursday|friday|saturday|\d|(?:one|two|three|four|five|half\s+an?|an?)\s*(?:hours?|hrs?)\b|my\s+(?:team|friends|group|kids|son|daughter|office|company|birthday))/,
  /\bbook(?:ing)?\s+(?:tomorrow|today|tonight|at\s+\d)/,
  // Hinglish: "book karna hai", "booking karwani hai", "booking krwani h", "booking chahiye", "booking hogi kya"
  /\bbook(?:ing)?\s*(?:karna|krna|karni|krni|karne|krne|karo|kro|kar\s+(?:do|dijiye|dena|doge|denge)|k(?:a)?r(?:wa|va)(?:na|ni|ne|o|do|dena|dijiye)?|chahiye|chaiye|chahie|hogi|ho\s+(?:jayegi|jaegi|jaayegi|sakti|skti|jayega)|milegi|mil\s+(?:jayegi|sakti))\b/,
  /\bbook(?:ing)?\s+(?:hai|h|he)\s+kya\b/,
  /\b(?:kal|aaj|parso|parson)\s+(?:ki|ka|ke)\s+(?:booking|slot)\b/,
  // Hindi: बुकिंग करनी है, बुक करवाना, बुकिंग चाहिए (no \b: JavaScript's word edges are ASCII only)
  /(?:बुकिंग|बुक)\s*(?:कर(?!\s*सकते)|चाहिए|चाहिये|होगी|हो\s*जा)/,
  /खेल(?:ना|नी|ने|ें)/,
  // asking for a slot; not an owner's "slots available from 6 am" or "slots for weekends are 1200"
  /\bslots?\s+(?:chahiye|chaiye|milega|book)\b/,
  /\b(?:a|one|1|any)\s+slot\s+(?:for|at|on|from|tomorrow|today|tonight)\b/,
  /\bslot\s+(?:tomorrow|today|tonight)\b/,
  /\breserv(?:e|ation)\b/,
  // "for 2 hours", never "open 24 hours" or "for 24 hours"
  /\bfor\s+(?:[1-9]|1[0-2]|1\.5|2\.5|one|two|three|four|five|half\s+an?|an?)\s*(?:hours?|hrs?)\b/,
  /\b(?:is|are)\s+(?:it|the\s+\w+|slots?|ground|turf)\s+(?:available|free|open)\s+(?:today|tomorrow|tonight|now|this|on|at|for)\b/,
  /\b(?:available|availability)\s+(?:today|tomorrow|tonight|this\s+(?:evening|morning|night|weekend|sunday|saturday))\b/,
  /\bhow\s+much\s+(?:for|per|is\s+(?:it|the)|an?\s+hour)\b/,
  /\bwhat(?:'s|\s+is|\s+are)\s+(?:the\s+)?(?:price|rate|cost|charge)s?\b/,
  /\b(?:rate|price|prices|charges?)\s+(?:kya|kitna|kitne)\b/,
  // "we are 12 players"; not "we are 3 people running this turf"
  new RegExp(`\\bwe\\s+are\\s+\\d{1,2}\\s*${PEOPLE}\\b(?!\\s+(?:running|managing|owning|working|who\\s+(?:run|manage|own|work)|in\\s+charge))`),
  // "team of 10 for football"; not "a team of 5 staff" or "our team of 4 manages the turf"
  new RegExp(`\\b(?:team|group)\\s+of\\s+\\d{1,2}\\s*(?:${PEOPLE}\\s*)?(?:for|want|wants|need|needs|looking|to\\s+play|will\\s+play)\\b`),
  /\bkhel(?:na|ne|enge)\b/,
  /\bneed\s+(?:a\s+)?(?:slot|turf|ground|court|pitch)\b/,
];

/** True when a claim's note reads like a request to book or play. */
export function bookingLikeNote(note: string | null | undefined): boolean {
  if (!note) return false;
  let s = ` ${note.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ")} `;
  if (OWNER_VOICE.some((re) => re.test(s))) return false;
  for (const re of OWNER_BOOKING_TALK) s = s.replace(re, " ");
  return BOOKING_REQUESTS.some((re) => re.test(s));
}

/** The facts behind one waiting claim (admin_owner_claim_signals, and the turf's contact columns read by the admin route). */
export type ClaimFacts = {
  note: string | null;
  /** The claim was made from a phone sign-in (its key is p:). */
  phoneSignIn: boolean;
  /** The turf's page shows Call or WhatsApp (lib/utils/contact.ts hasUsableContact); null: not known. */
  turfHasNumber: boolean | null;
  /** Games the account created, anywhere. */
  games: number;
  /** Join requests the account sent. */
  requests: number;
  /** A Call or WhatsApp tap before signing up (the sign-up context); null: not recorded. */
  tappedBeforeSignup: boolean | null;
  /** Turf pages opened before signing up (the sign-up context counts each page load, not different turfs); null: not recorded. */
  turfsOpenedBeforeSignup: number | null;
};

/**
 * Opening turf pages this many times before signing up counts. The visit note counts page loads
 * (lib/analytics/visitor.ts noteInterest), not different turfs, so an owner who reloads their own
 * page a few times must stay under it; a player looking around goes past it.
 */
export const MANY_TURFS_OPENED = 5;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Each fact that points to a player, in plain words; [] when none does. */
export function playerSignals(f: ClaimFacts): string[] {
  const out: string[] = [];
  if (bookingLikeNote(f.note)) out.push("note reads like a booking");
  if (f.phoneSignIn && f.turfHasNumber === false) out.push("phone sign-in on a turf with no number");
  if (f.games > 0) out.push(`made ${plural(f.games, "game", "games")}`);
  if (f.requests > 0) out.push(`sent ${plural(f.requests, "join request", "join requests")}`);
  if (f.tappedBeforeSignup === true) out.push("tapped Call or WhatsApp before signing up");
  if (f.turfsOpenedBeforeSignup !== null && f.turfsOpenedBeforeSignup >= MANY_TURFS_OPENED) out.push(`opened turf pages ${f.turfsOpenedBeforeSignup} times before signing up`);
  return out;
}

/** The card's one line, or null when nothing points to a player. */
export function playerSignalLine(signals: readonly string[]): string | null {
  return signals.length ? `Looks like a player: ${signals.join(", ")}.` : null;
}

/** One row of admin_owner_claim_signals, plus the route's turf_has_number; anything malformed reads as unknown. */
export type RawSignals = {
  games?: unknown;
  requests?: unknown;
  pre_contact_tap?: unknown;
  pre_turfs_opened?: unknown;
  turf_has_number?: unknown;
};

const count = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.round(x) : 0);

/** A waiting claim's facts from its key, note and signals row; null when the signals were not read (an older database). */
export function claimFacts(c: { userKey: string; note: string | null }, raw: RawSignals | null | undefined): ClaimFacts | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    note: c.note,
    phoneSignIn: c.userKey.startsWith("p:"),
    turfHasNumber: typeof raw.turf_has_number === "boolean" ? raw.turf_has_number : null,
    games: count(raw.games),
    requests: count(raw.requests),
    tappedBeforeSignup: typeof raw.pre_contact_tap === "boolean" ? raw.pre_contact_tap : null,
    turfsOpenedBeforeSignup: typeof raw.pre_turfs_opened === "number" && Number.isFinite(raw.pre_turfs_opened) ? Math.max(0, Math.round(raw.pre_turfs_opened)) : null,
  };
}

const keyOf = (turfId: unknown, userKey: unknown) => (typeof turfId === "string" && typeof userKey === "string" ? `${turfId} ${userKey}` : null);

/** admin_owner_claim_signals' rows by claim (turf id and sign-in key); anything malformed, or an error answer, gives none. */
export function signalsByClaim(data: unknown): Map<string, RawSignals> {
  const out = new Map<string, RawSignals>();
  if (!Array.isArray(data)) return out;
  for (const x of data) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const k = keyOf(r.turf_id, r.user_key);
    if (k) out.set(k, { games: r.games, requests: r.requests, pre_contact_tap: r.pre_contact_tap, pre_turfs_opened: r.pre_turfs_opened });
  }
  return out;
}

/**
 * The admin route's answer: each waiting claim from admin_owner_claims gets
 * its signals row, with whether its turf's page shows Call or WhatsApp
 * (turfHasNumber, by turf id, from the page's own rule). Other claims, and
 * waiting ones with no signals row (an older database), are as they came.
 */
export function withSignals(claims: readonly unknown[], signals: Map<string, RawSignals>, turfHasNumber: Map<string, boolean>): unknown[] {
  return claims.map((x) => {
    if (!x || typeof x !== "object") return x;
    const r = x as Record<string, unknown>;
    const k = r.status === "pending" ? keyOf(r.turf_id, r.user_key) : null;
    const s = k ? signals.get(k) : undefined;
    if (!s) return x;
    const has = typeof r.turf_id === "string" ? turfHasNumber.get(r.turf_id) : undefined;
    return { ...r, signals: { ...s, turf_has_number: has ?? null } };
  });
}
