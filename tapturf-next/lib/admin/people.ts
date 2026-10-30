import { cityInfo } from "../city";
import { linksById, type SignInLinkRow, type SignInLinks } from "./links";

/**
 * The people behind the sign-ups chart: one row from admin_people
 * turned into what the admin chart and list show, plus their cities, the
 * India-time formatting and search. Pure, so the server and the browser
 * agree (no Intl in anything rendered, which would differ between them).
 * Relative imports only (npm run test:trend).
 */

export type Method = "google" | "phone" | "email" | "unknown";

/** How a recorded city was found (lib/account/city.ts). */
export type CitySource = "picked" | "gps" | "ip" | "unknown";
export type RecordedCity = { id: string | null; source: CitySource; ipCity: string | null; atSignup: boolean; at: number | null };

export type Contacted = { turf: string; slug: string | null; kinds: string[]; n: number; at: number | null };
export type Claim = { turf: string; slug: string | null; status: string; role: string | null };

/** What we saw before they signed up (lib/analytics/visitor.ts saves it). */
export type Before = {
  source: string;
  landing: string | null;
  firstVisit: number | null;
  sessions: number | null;
  days: number | null;
  cities: string[];
  sports: string[];
  turfsOpened: number | null;
  turfOpen: number | null;
  contactClick: number | null;
  signup: number | null;
  device: string | null;
  installed: boolean;
  lang: string | null;
};

export type Person = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  role: string | null;
  /** A sign-in confirmed their email or phone (or, when that couldn't be read, the old app's flag said so). */
  verified: boolean;
  /** What their sign-ins confirmed (admin_verified); null when that couldn't be read. */
  confirmed: Confirmed | null;
  /** The verified tick players see, and which half is proved (admin_ticks); null when that couldn't be read. */
  tick: Tick | null;
  /** When they signed up: their first sign-in, even for accounts copied into users later. */
  joinedAt: number;
  /** When their users row was made, only when that was more than a minute after they signed up. */
  rowAddedAt: number | null;
  /** The joined time is shared with other accounts: a bulk import, not their real sign-up. */
  imported: boolean;
  updatedAt: number | null;
  method: Method;
  username: string | null;
  taggable: boolean | null;
  logins: number;
  lastLogin: number | null;
  loginMethods: string[];
  hosted: number;
  requests: number;
  accepted: number;
  joined: number;
  reviews: number;
  taps: number;
  contacted: Contacted[];
  asks: number;
  recentAsks: string[];
  suggestions: number;
  claims: Claim[];
  lastActive: number | null;
  before: Before | null;
  /** The city recorded by the server, if any (private.user_cities). */
  city: RecordedCity | null;
  /** A best guess from their activity, with its share of the evidence (0 to 1). */
  likely: { id: string; share: number } | null;
  /** A phone account's answer to the email ask (private.user_contact_emails), if any. */
  contact: ContactEmail | null;
  /** Google made the account (they picked it) but they never came back to finish signing in. */
  signInUnfinished: boolean;
  /** The email came from their Google account, which Google confirmed. */
  emailFromGoogle: boolean;
  /** What they added from their profile: a Google account (phone accounts), a number proved with an OTP (Google accounts). */
  links: SignInLinks | null;
  /** A Google sign-in that never came back, so no TapTurf account was made (id is the sign-in's own id). */
  noAccount: boolean;
};

/** What a sign-in confirmed: their email (by Google, or the old app's confirm link) and their phone (by a code TapTurf checked). */
export type Confirmed = { email: "google" | "link" | null; phone: boolean };

/** The verified tick (a number proved by OTP and an email proved by Google) and its two halves. */
export type Tick = { verified: boolean; phone: boolean; email: boolean };

/** One row as admin_ticks returns it. */
export type TickRow = { user_id: string; verified: boolean | null; phone_proven: boolean | null; email_proven: boolean | null };

/** admin_ticks' rows by account, or null when the read failed. */
export function ticksById(rows: readonly TickRow[] | null): Map<string, Tick> | null {
  if (!rows) return null;
  const out = new Map<string, Tick>();
  for (const r of rows) {
    if (typeof r?.user_id !== "string") continue;
    const phone = r.phone_proven === true;
    const email = r.email_proven === true;
    out.set(r.user_id, { verified: r.verified === true && phone && email, phone, email });
  }
  return out;
}

/** What the admin says about the tick: shown, or which half is missing. */
export function tickText(t: Tick | null): string {
  if (!t) return "Couldn't read";
  if (t.verified) return "Shown: phone and email proven";
  if (t.phone) return "Not yet: phone proven, email not";
  if (t.email) return "Not yet: email proven, phone not";
  return "Not yet: neither proven";
}

/** Whether someone has the tick (the people list's "Verified only"). */
export const hasTick = (p: Pick<Person, "tick">): boolean => p.tick?.verified === true;

/** ?people=verified: the admin's people list opens on the people with the tick. */
export const tickedOnly = (x: unknown): boolean => (Array.isArray(x) ? x[0] : x) === "verified";

/** One half of the tick in the people list: proved, on the account but never proved, or not there. */
export type Half = "proved" | "typed" | "none";
/**
 * The phone half can also be "old": a phone sign-up's number (it signs the
 * account in by OTP) with no OTP the tick trusts, because every one is from
 * before the sign-in log was locked on 21 Oct 2026 (44 accounts on 26 Oct).
 */
export type PhoneHalf = Half | "old";

type Words = { text: string; title: string };

/** Each chip's words and tooltip. Never the number or the address itself. */
export const HALF_TEXT: { phone: Record<PhoneHalf, Words>; email: Record<Half, Words> } = {
  phone: {
    proved: { text: "Phone ✓ proved", title: "The number on the account was proved with an OTP" },
    old: {
      text: "Phone: old OTP",
      title:
        "The number signs in to this account by OTP, but only from before the sign-in log was locked in October, so the tick doesn't count it yet. Their next phone sign-in, or an OTP from the profile, proves it",
    },
    typed: { text: "Phone typed", title: "A number is on the account, but no OTP proved it" },
    none: { text: "No phone", title: "No number on the account" },
  },
  email: {
    proved: { text: "Email ✓ Google", title: "Google confirmed the account's email" },
    typed: { text: "Email typed", title: "An email is on the account, but Google didn't confirm it" },
    none: { text: "No email", title: "No email on the account" },
  },
};

/**
 * The tick's two halves for the people list's chips: proved (admin_ticks),
 * else old for a phone sign-up's own number (signed in by OTP, but only
 * before the log could be trusted), else typed when the account has one (a
 * number; its email, the Google account added from the profile, or the
 * address a phone account typed), else none. Null when the ticks couldn't
 * be read, and for a Google sign-in that made no account: then the list
 * shows no chips.
 */
export function tickHalves(
  p: Pick<Person, "tick" | "phone" | "email" | "links" | "contact" | "noAccount" | "method">,
): { phone: PhoneHalf; email: Half } | null {
  if (!p.tick || p.noAccount) return null;
  const email = !!(p.email || p.links?.googleEmail || p.contact?.email);
  return {
    phone: p.tick.phone ? "proved" : p.phone ? (p.method === "phone" ? "old" : "typed") : "none",
    email: p.tick.email ? "proved" : email ? "typed" : "none",
  };
}

export type TickTotals = { accounts: number; verified: number; phone: number; email: number };

/** admin_ticks counted for the admin home: the accounts, those with the tick and each half proved; null when the read failed. */
export function tickTotals(rows: readonly TickRow[] | null): TickTotals | null {
  const by = ticksById(rows);
  if (!by) return null;
  const out: TickTotals = { accounts: by.size, verified: 0, phone: 0, email: 0 };
  for (const t of by.values()) {
    if (t.verified) out.verified++;
    if (t.phone) out.phone++;
    if (t.email) out.email++;
  }
  return out;
}

/** The accounts with the tick (admin_ticks); none when the read failed, so pages show no ticks. */
export function tickedIds(rows: readonly TickRow[] | null): Set<string> {
  const out = new Set<string>();
  for (const [id, t] of ticksById(rows) ?? []) if (t.verified) out.add(id.toLowerCase());
  return out;
}

/** One row as admin_verified returns it. */
export type VerifiedRow = {
  user_id: string;
  email_by_google: boolean | null;
  email_confirmed: boolean | null;
  phone_by_code: boolean | null;
};

/** admin_verified's rows by account, or null when the read failed. */
export function confirmedById(rows: readonly VerifiedRow[] | null): Map<string, Confirmed> | null {
  if (!rows) return null;
  const out = new Map<string, Confirmed>();
  for (const r of rows) {
    if (typeof r?.user_id !== "string") continue;
    out.set(r.user_id, { email: r.email_by_google === true ? "google" : r.email_confirmed === true ? "link" : null, phone: r.phone_by_code === true });
  }
  return out;
}

/** True when a sign-in confirmed something; the old app's flag only when what was confirmed couldn't be read. */
export function isVerified(confirmed: Confirmed | null, legacy: boolean | null | undefined): boolean {
  return confirmed ? confirmed.email !== null || confirmed.phone : legacy === true;
}

/** The optional email a phone account typed, or their No thanks. Not checked by anyone. */
export type ContactEmail = {
  email: string | null;
  answer: "saved" | "skipped" | "removed";
  source: "signup" | "prompt" | "profile";
  /** Another account has the same address. */
  shared: boolean;
  at: number | null;
};

/** One row as admin_contact_emails returns it. */
export type ContactEmailRow = {
  user_id: string;
  email: string | null;
  answer: string | null;
  source: string | null;
  verified?: boolean | null;
  answered_at: string | null;
  same_as_other_account: boolean | null;
};

/** One row as admin_people returns it. */
export type DetailsRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  profile_image_url: string | null;
  role: string | null;
  is_verified: boolean | null;
  created_at: string | null;
  signed_up_at?: string | null;
  updated_at: string | null;
  method: string | null;
  username: string | null;
  taggable: boolean | null;
  logins: number | null;
  last_login: string | null;
  login_methods: string[] | null;
  games_hosted: number | null;
  requests: number | null;
  requests_accepted: number | null;
  games_joined: number | null;
  reviews: number | null;
  contact_taps: number | null;
  contacted: unknown;
  asks: number | null;
  recent_asks: string[] | null;
  suggestions: number | null;
  turfs: unknown;
  last_active: string | null;
  signup: unknown;
  city?: string | null;
  city_source?: string | null;
  city_ip?: string | null;
  city_at_signup?: boolean | null;
  city_at?: string | null;
  likely_city?: string | null;
  likely_share?: number | null;
};

const time = (s: unknown): number | null => {
  if (typeof s !== "string" || !s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
};
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const strings = (v: unknown, max = 5): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, max) : []);

const METHODS: readonly Method[] = ["google", "phone", "email"];
const SOURCES: readonly CitySource[] = ["picked", "gps", "ip", "unknown"];
const CITY_ID = /^[a-z][a-z-]{1,30}$/;
const cityId = (v: unknown): string | null => (typeof v === "string" && CITY_ID.test(v) ? v : null);

function recordedCity(r: DetailsRow): RecordedCity | null {
  const source = SOURCES.find((x) => x === r.city_source);
  if (!source) return null;
  // A source that needs a city but came without a valid one reads as unknown.
  const id = source === "unknown" ? null : cityId(r.city);
  return { id, source: id ? source : "unknown", ipCity: str(r.city_ip)?.slice(0, 60) ?? null, atSignup: r.city_at_signup === true, at: time(r.city_at) };
}

/** Where someone first came from: a campaign when tagged, else the referring site. */
export function sourceOf(first: Record<string, unknown> | null): string {
  if (!first) return "Not recorded";
  const utm = obj(first.utm) ?? {};
  const ad = first.ad_click === true;
  const src = str(utm.source);
  if (src) {
    const medium = str(utm.medium);
    const campaign = str(utm.campaign);
    return `${src}${medium ? ` / ${medium}` : ""}${campaign ? ` (${campaign})` : ""}${ad ? ", from an ad" : ""}`;
  }
  const ref = str(first.ref);
  if (!ref) return ad ? "An ad" : "Typed the address, or an app";
  const host = ref.split("/")[0].toLowerCase().replace(/^www\.|^m\.|^l\.|^lm\./, "");
  const known: [RegExp, string][] = [
    [/(^|\.)google\./, "Google"],
    [/(^|\.)bing\.com$/, "Bing"],
    [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
    [/(^|\.)instagram\.com$/, "Instagram"],
    [/(^|\.)(facebook\.com|fb\.com)$/, "Facebook"],
    [/(^|\.)(whatsapp\.com|wa\.me)$/, "WhatsApp"],
    [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
    [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "X"],
    [/(^|\.)linkedin\.com$/, "LinkedIn"],
    [/(^|\.)(chatgpt\.com|openai\.com)$/, "ChatGPT"],
    [/(^|\.)perplexity\.ai$/, "Perplexity"],
    [/(^|\.)tapturf\.in$/, "TapTurf itself"],
  ];
  const name = known.find(([re]) => re.test(host))?.[1] ?? host;
  return ad ? `${name}, from an ad` : name;
}

function deviceOf(d: Record<string, unknown> | null): string | null {
  if (!d) return null;
  const type = str(d.type);
  const kind = type === "mobile" ? "phone" : type;
  const os = str(d.os);
  const browser = str(d.browser);
  const what = [os && os !== "other" ? os : null, kind].filter(Boolean).join(" ");
  return [what || null, browser && browser !== "other" ? browser : null].filter(Boolean).join(", ") || null;
}

function beforeOf(v: unknown): Before | null {
  const ctx = obj(v);
  if (!ctx) return null;
  const first = obj(ctx.first);
  const visits = obj(ctx.visits);
  const interest = obj(ctx.interest);
  const funnel = obj(ctx.funnel) ?? {};
  const device = obj(ctx.device);
  const at = obj(ctx.at);
  return {
    source: sourceOf(first),
    landing: str(first?.landing),
    firstVisit: time(funnel.first_visit) ?? time(visits?.first_at) ?? time(first?.at),
    sessions: visits && typeof visits.sessions === "number" ? visits.sessions : null,
    days: visits && typeof visits.days === "number" ? visits.days : null,
    cities: strings(interest?.cities),
    sports: strings(interest?.sports),
    turfsOpened: interest && typeof interest.turfs_opened === "number" ? interest.turfs_opened : null,
    turfOpen: time(funnel.turf_open),
    contactClick: time(funnel.contact_click),
    signup: time(funnel.signup),
    device: deviceOf(device),
    installed: device?.standalone === true,
    lang: str(at?.lang),
  };
}

function contactedOf(v: unknown): Contacted[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const o = obj(x);
    if (!o) return [];
    return [{ turf: str(o.turf) ?? "A turf", slug: str(o.slug), kinds: strings(o.kinds), n: num(o.n), at: time(o.at) }];
  });
}

function claimsOf(v: unknown): Claim[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const o = obj(x);
    if (!o) return [];
    return [{ turf: str(o.turf) ?? "A turf", slug: str(o.slug), status: str(o.status) ?? "unknown", role: str(o.role) }];
  });
}

/** Rows to people, newest first; a joined time shared by several rows is marked as an import. */
function contactOf(r: ContactEmailRow | undefined): ContactEmail | null {
  if (!r) return null;
  const answer = r.answer === "saved" || r.answer === "skipped" || r.answer === "removed" ? r.answer : null;
  const source = r.source === "signup" || r.source === "prompt" || r.source === "profile" ? r.source : null;
  if (!answer || !source) return null;
  return { email: str(r.email), answer, source, shared: r.same_as_other_account === true, at: time(r.answered_at) };
}

export function toPeople(
  rows: readonly DetailsRow[],
  contacts: readonly ContactEmailRow[] = [],
  verified: readonly VerifiedRow[] | null = null,
  links: readonly SignInLinkRow[] = [],
  ticks: readonly TickRow[] | null = null,
): Person[] {
  const byUser = new Map(contacts.filter((c) => typeof c?.user_id === "string").map((c) => [c.user_id, c]));
  const linkOf = linksById(links);
  const confirmedOf = confirmedById(verified);
  const tickOf = ticksById(ticks);
  const joined = (r: DetailsRow) => time(r.signed_up_at) ?? time(r.created_at);
  const seen = new Map<number, number>();
  for (const r of rows) {
    const t = joined(r);
    if (t !== null) seen.set(t, (seen.get(t) ?? 0) + 1);
  }
  const people = rows.flatMap((r): Person[] => {
    const joinedAt = joined(r);
    if (joinedAt === null || typeof r.id !== "string") return [];
    const method = METHODS.find((m) => m === r.method) ?? "unknown";
    const rowAt = time(r.created_at);
    const likely = cityId(r.likely_city);
    const share = typeof r.likely_share === "number" && Number.isFinite(r.likely_share) ? Math.min(1, Math.max(0, r.likely_share)) : 0;
    // An account missing from a read that worked had nothing confirmed.
    const confirmed = confirmedOf ? (confirmedOf.get(r.id) ?? { email: null, phone: false }) : null;
    return [
      {
        id: r.id,
        name: str(r.name),
        email: str(r.email),
        phone: str(r.phone),
        avatar: str(r.profile_image_url),
        role: str(r.role),
        verified: isVerified(confirmed, r.is_verified),
        confirmed,
        // An account missing from a read that worked has no tick.
        tick: tickOf ? (tickOf.get(r.id) ?? { verified: false, phone: false, email: false }) : null,
        joinedAt,
        rowAddedAt: rowAt !== null && rowAt - joinedAt > 60_000 ? rowAt : null,
        imported: (seen.get(joinedAt) ?? 0) > 1,
        updatedAt: time(r.updated_at),
        method,
        username: str(r.username),
        taggable: typeof r.taggable === "boolean" ? r.taggable : null,
        logins: num(r.logins),
        lastLogin: time(r.last_login),
        loginMethods: strings(r.login_methods),
        hosted: num(r.games_hosted),
        requests: num(r.requests),
        accepted: num(r.requests_accepted),
        joined: num(r.games_joined),
        reviews: num(r.reviews),
        taps: num(r.contact_taps),
        contacted: contactedOf(r.contacted),
        asks: num(r.asks),
        recentAsks: strings(r.recent_asks, 3),
        suggestions: num(r.suggestions),
        claims: claimsOf(r.turfs),
        lastActive: time(r.last_active),
        before: beforeOf(r.signup),
        city: recordedCity(r),
        likely: likely ? { id: likely, share } : null,
        contact: contactOf(byUser.get(r.id)),
        // admin_people counts every finished Google sign-in (the log, or auth's last sign-in), so none means none.
        signInUnfinished: method === "google" && num(r.logins) === 0 && time(r.last_login) === null,
        emailFromGoogle: method === "google" && !!str(r.email),
        links: linkOf.get(r.id.toLowerCase()) ?? null,
        noAccount: false,
      },
    ];
  });
  return people.sort((a, b) => b.joinedAt - a.joinedAt || (a.id < b.id ? -1 : 1));
}

/** People who signed up in [start, end), newest first (the input is already newest first). */
export function joinedBetween(people: readonly Person[], start: number, end: number): Person[] {
  return people.filter((p) => p.joinedAt >= start && p.joinedAt < end);
}

/**
 * Search by name, email, @username, city or any part of the phone number.
 * A number written the Indian way (+91, 0091 or a leading 0) also finds
 * the 10 digits it stands for; digits also match names and emails.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function matches(p: Person, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^@/, "");
  if (!q) return true;
  // An account id (admin's "Open in people list"): that person only.
  if (UUID.test(q)) return p.id.toLowerCase() === q;
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3 && digits.length === q.replace(/[\s+()-]/g, "").length) {
    const national = /^(?:0{0,2}91|0)[6-9]\d{9}$/.test(digits) ? digits.slice(-10) : digits.replace(/^0+(?=[6-9])/, "");
    if (national.length >= 3 && (p.phone ?? "").replace(/\D/g, "").includes(national)) return true;
  }
  const where = cityOf(p);
  return [p.name, p.email, p.links?.googleEmail ?? null, p.contact?.email ?? null, p.username, where ? cityLabel(where.id) : null].some((s) => s?.toLowerCase().includes(q));
}

/* ------------------------------------------------------------------ */
/* Cities                                                              */
/* ------------------------------------------------------------------ */

/** "Not known" in the city filter. */
export const NO_CITY = "none";

/** A city's name to show: the curated label, or the id title-cased. */
export const cityLabel = (id: string): string => cityInfo(id).label;

/** The city to count someone under: the recorded one, else the best guess from activity. */
export function cityOf(p: Person): { id: string; guessed: boolean } | null {
  if (p.city?.id) return { id: p.city.id, guessed: false };
  if (p.likely) return { id: p.likely.id, guessed: true };
  return null;
}

/** Whether someone counts under a city filter (null: every city; NO_CITY: no city at all). */
export function inCity(p: Person, city: string | null): boolean {
  if (city === null) return true;
  const c = cityOf(p);
  return city === NO_CITY ? c === null : c?.id === city;
}

/** A user's city on the Users list (/admin/users): how it was recorded, or "guess" when it is the best guess from activity. */
export type UserCity = { id: string; how: CitySource | "guess" };

/** The Users list's city for this person: the recorded one, else the best guess; null when neither. */
export function userCity(p: Person | null | undefined): UserCity | null {
  if (p?.city?.id) return { id: p.city.id, how: p.city.source };
  if (p?.likely) return { id: p.likely.id, how: "guess" };
  return null;
}

/** How the city was found, in a word, next to it on the Users list. */
export const CITY_HOW: Record<UserCity["how"], string> = { picked: "picked", gps: "GPS", ip: "internet", unknown: "", guess: "likely" };

/** The Users list's city filter from the address (?city=): a city id, NO_CITY, or null for every city. */
export function cityParam(raw: string | null | undefined): string | null {
  return raw === NO_CITY ? NO_CITY : cityId(raw);
}

/** Whether a row counts under the city filter (null: every city; NO_CITY: no city at all). */
export function rowInCity(c: UserCity | null, city: string | null): boolean {
  if (city === null) return true;
  return city === NO_CITY ? c === null : c?.id === city;
}

/** Rows per city, most first (ties by name), and how many have no city: the city filter's choices. */
export function countCities(rows: readonly { city: UserCity | null }[]): { cities: { id: string; label: string; n: number }[]; unknown: number } {
  const m = new Map<string, number>();
  let unknown = 0;
  for (const r of rows) {
    if (r.city) m.set(r.city.id, (m.get(r.city.id) ?? 0) + 1);
    else unknown++;
  }
  const cities = [...m].map(([id, n]) => ({ id, label: cityLabel(id), n }));
  cities.sort((a, b) => b.n - a.n || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  return { cities, unknown };
}

export type CityCount = { id: string; label: string; recorded: number; guessed: number; total: number };

/** People per city, most first (ties by name), and how many have no city at all. */
export function byCity(people: readonly Person[]): { cities: CityCount[]; unknown: number } {
  const m = new Map<string, CityCount>();
  let unknown = 0;
  for (const p of people) {
    const c = cityOf(p);
    if (!c) {
      unknown++;
      continue;
    }
    const row = m.get(c.id) ?? { id: c.id, label: cityLabel(c.id), recorded: 0, guessed: 0, total: 0 };
    if (c.guessed) row.guessed++;
    else row.recorded++;
    row.total++;
    m.set(c.id, row);
  }
  const cities = [...m.values()].sort((a, b) => b.total - a.total || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  return { cities, unknown };
}

/* ------------------------------------------------------------------ */
/* Safe display                                                        */
/* ------------------------------------------------------------------ */

/** A same-site path that is safe to link, else null: browser-sent text must never become an off-site link. */
export function sitePath(s: string | null): string | null {
  return s && s.length <= 300 && /^\/(?![/\\])[^\s\x00-\x1f\x7f\\]*$/.test(s) ? s : null;
}

/** The first character for an avatar, whole even when it is an emoji or another character outside the basic plane. */
export function initial(p: Pick<Person, "name" | "username" | "email">): string {
  const first = Array.from((p.name ?? p.username ?? p.email ?? "").trim())[0];
  return first ? first.toUpperCase() : "?";
}

// India time, by hand: Intl output differs between Node and browsers.
const IST = 5.5 * 3_600_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "22 Oct 2026, 16:50" in India time. */
export function istDateTime(t: number): string {
  const d = new Date(t + IST);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** A length of time in words: "40 sec", "12 min", "3 h", "5 days". */
export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} sec`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} days`;
  if (d < 60) return `${Math.round(d / 7)} weeks`;
  if (d < 730) return `${Math.round(d / 30.44)} months`;
  return `${Math.round(d / 365.25)} years`;
}

/** "just now", "12 min ago", "3 days ago"; times after now read "just now". */
export function ago(t: number, now: number): string {
  return now - t < 60_000 ? "just now" : `${duration(now - t)} ago`;
}

/** An account id from a link, or null. */
export function personId(x: unknown): string | null {
  return typeof x === "string" && UUID.test(x.toLowerCase()) ? x.toLowerCase() : null;
}

export const METHOD_NAMES: Record<Method, string> = { google: "Google", phone: "Phone", email: "Email (old app)", unknown: "Unknown" };

/** wa.me wants the number with its country code and no plus. */
export function whatsappLink(phone: string): string | null {
  const d = phone.replace(/\D/g, "");
  return d.length >= 10 ? `https://wa.me/${d.length === 10 ? `91${d}` : d}` : null;
}
