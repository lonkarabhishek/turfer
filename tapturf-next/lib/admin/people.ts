/**
 * The people behind the sign-ups chart: one row from admin_user_details
 * turned into what the admin list shows, plus the India-time formatting
 * and search it uses. Pure, so the server and the browser agree (no Intl
 * in anything rendered, which would differ between them).
 */

export type Method = "google" | "phone" | "email" | "unknown";

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
  verified: boolean;
  joinedAt: number;
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
};

/** One row as admin_user_details returns it. */
export type DetailsRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  profile_image_url: string | null;
  role: string | null;
  is_verified: boolean | null;
  created_at: string | null;
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
export function toPeople(rows: readonly DetailsRow[]): Person[] {
  const seen = new Map<string, number>();
  for (const r of rows) if (r.created_at) seen.set(r.created_at, (seen.get(r.created_at) ?? 0) + 1);
  const people = rows.flatMap((r): Person[] => {
    const joinedAt = time(r.created_at);
    if (joinedAt === null || typeof r.id !== "string") return [];
    const method = METHODS.find((m) => m === r.method) ?? "unknown";
    return [
      {
        id: r.id,
        name: str(r.name),
        email: str(r.email),
        phone: str(r.phone),
        avatar: str(r.profile_image_url),
        role: str(r.role),
        verified: r.is_verified === true,
        joinedAt,
        imported: (seen.get(r.created_at as string) ?? 0) > 1,
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
      },
    ];
  });
  return people.sort((a, b) => b.joinedAt - a.joinedAt || (a.id < b.id ? -1 : 1));
}

/** People who signed up in [start, end), newest first (the input is already newest first). */
export function joinedBetween(people: readonly Person[], start: number, end: number): Person[] {
  return people.filter((p) => p.joinedAt >= start && p.joinedAt < end);
}

/** Search by name, email, @username or any part of the phone number. */
export function matches(p: Person, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^@/, "");
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3 && digits.length === q.replace(/[\s+()-]/g, "").length) {
    return (p.phone ?? "").replace(/\D/g, "").includes(digits);
  }
  return [p.name, p.email, p.username].some((s) => s?.toLowerCase().includes(q));
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

export const METHOD_NAMES: Record<Method, string> = { google: "Google", phone: "Phone", email: "Email (old app)", unknown: "Unknown" };

/** wa.me wants the number with its country code and no plus. */
export function whatsappLink(phone: string): string | null {
  const d = phone.replace(/\D/g, "");
  return d.length >= 10 ? `https://wa.me/${d.length === 10 ? `91${d}` : d}` : null;
}
