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
 * A note that reads like a booking. Careful on purpose: an owner writes
 * "open 24 hours", "we take bookings on WhatsApp" or "I manage bookings
 * here", and none of those may count. Each pattern is a request to play
 * or to book, in English or the Hinglish players type.
 */
const OWNER_BOOKING_TALK = [
  /\b(?:we|i)\s+(?:take|handle|manage|accept|get|run|do)\s+(?:all\s+)?(?:the\s+)?bookings?\b/g,
  /\bbookings?\s+(?:number|no\.?|contact|desk|manager|team|line)\b/g,
  /\bfor\s+bookings?\b/g,
];
const BOOKING_REQUESTS: RegExp[] = [
  /\b(?:want|wanna|would like|like|need|have|planning|plan|looking)\s+to\s+(?:book|reserve|play)\b/,
  /\b(?:can|could|may)\s+(?:i|we|u|you)\s+(?:book|reserve|play|get\s+(?:a\s+)?slot)\b/,
  /\bbook(?:ing)?\s+(?:a\s+|the\s+|one\s+|this\s+|your\s+)?(?:slot|ground|turf|court|box|pitch|game|match)\b/,
  /\bbook(?:ing)?\s+(?:for|on|at|from|tomorrow|today|tonight)\b/,
  /\bbook(?:ing)?\s*(?:karna|krna|karni|krni|karo|kro|kar|chahiye|chaiye|hai)\b/,
  /\bslots?\s+(?:for|at|on|from|chahiye|chaiye|milega|available|book)\b/,
  /\breserv(?:e|ation)\b/,
  // "for 2 hours", never "open 24 hours" or "for 24 hours"
  /\bfor\s+(?:[1-9]|1[0-2]|1\.5|2\.5|one|two|three|four|five|half\s+an?|an?)\s*(?:hours?|hrs?)\b/,
  /\b(?:is|are)\s+(?:it|the\s+\w+|slots?|ground|turf)\s+(?:available|free|open)\s+(?:today|tomorrow|tonight|now|this|on|at|for)\b/,
  /\b(?:available|availability)\s+(?:today|tomorrow|tonight|now|this\s+\w+)\b/,
  /\bhow\s+much\s+(?:for|per|is\s+(?:it|the)|an?\s+hour)\b/,
  /\bwhat(?:'s|\s+is|\s+are)\s+(?:the\s+)?(?:price|rate|cost|charge)s?\b/,
  /\bwe\s+are\s+\d{1,2}\s*(?:players|people|persons|boys|girls|friends|guys|ppl|log|members)\b/,
  /\b(?:team|group)\s+of\s+\d{1,2}\b/,
  /\bkhel(?:na|ne|enge)\b/,
  /\bneed\s+(?:a\s+)?(?:slot|turf|ground|court|pitch)\b/,
];

/** True when a claim's note reads like a request to book or play. */
export function bookingLikeNote(note: string | null | undefined): boolean {
  if (!note) return false;
  let s = ` ${note.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ")} `;
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
  /** Turfs opened before signing up (the sign-up context); null: not recorded. */
  turfsOpenedBeforeSignup: number | null;
};

/** Opening this many turfs before signing up counts: an owner opens their own, a player looks around. */
export const MANY_TURFS_OPENED = 3;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Each fact that points to a player, in plain words; [] when none does. */
export function playerSignals(f: ClaimFacts): string[] {
  const out: string[] = [];
  if (bookingLikeNote(f.note)) out.push("note reads like a booking");
  if (f.phoneSignIn && f.turfHasNumber === false) out.push("phone sign-in on a turf with no number");
  if (f.games > 0) out.push(`made ${plural(f.games, "game", "games")}`);
  if (f.requests > 0) out.push(`sent ${plural(f.requests, "join request", "join requests")}`);
  if (f.tappedBeforeSignup === true) out.push("tapped Call or WhatsApp before signing up");
  if (f.turfsOpenedBeforeSignup !== null && f.turfsOpenedBeforeSignup >= MANY_TURFS_OPENED) out.push(`opened ${f.turfsOpenedBeforeSignup} turfs before signing up`);
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
