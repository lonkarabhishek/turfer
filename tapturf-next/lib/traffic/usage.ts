import { TRAFFIC_KINDS, TRAFFIC_SOURCES, type TrafficKind, type TrafficSource } from "./traffic";

/**
 * The admin's view of the traffic counts (admin_traffic,
 * supabase/migrations/20261104_traffic.sql): today, yesterday, the last 7
 * full India days against the 7 before them, the last 30 full days, every
 * one of those 30 days and today, and for today, the 7 and the 30 days:
 * visits and views by source and by kind, the top pages and the other
 * sites and apps. Read defensively: a field that is missing or not a
 * number is 0, a row with an unknown source or kind is left out; an answer
 * that isn't one at all is null. The answer names nobody. Pure, relative
 * imports only (npm run test:traffic).
 */

export type TrafficCounts = { views: number; visits: number; signedViews: number };
export type TrafficDay = TrafficCounts & { day: string };
export type SourceRow = { source: TrafficSource; visits: number; views: number };
export type KindRow = { kind: TrafficKind; views: number; visits: number };
export type PageRow = { path: string; kind: TrafficKind; views: number; visits: number };
/** Another site (its host name) or, app true, another app (its package name). */
export type SiteRow = { host: string; visits: number; app: boolean };
/** A window's top rows and how many there were in all. */
export type TopList<T> = { rows: T[]; total: number };
/** today, the last 7 full days (yesterday back) and the last 30 full days. */
export type TrafficWindow = "today" | "d7" | "d30";

export type TrafficUsage = {
  /** India's day the numbers were read on ("2026-11-04"). */
  today: string;
  /** The first day anything was counted; null before the first. */
  since: string | null;
  totals: { today: TrafficCounts; yesterday: TrafficCounts; d7: TrafficCounts; prev7: TrafficCounts; d30: TrafficCounts };
  /** The last 30 full days (the d30 window), oldest first, then today, the last; a day with none as 0. */
  daily: TrafficDay[];
  bySource: Record<TrafficWindow, SourceRow[]>;
  byKind: Record<TrafficWindow, KindRow[]>;
  /** The most viewed pages, and how many pages had a view. */
  pages: Record<TrafficWindow, TopList<PageRow>>;
  /** The other sites and apps by visits, and how many there were. */
  sites: Record<TrafficWindow, TopList<SiteRow>>;
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const num = (x: unknown): number => {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() ? Number(x) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};
const str = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x : null);
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

function counts(x: unknown): TrafficCounts {
  const o = obj(x);
  const views = num(o.views);
  return { views, visits: Math.min(num(o.visits), views), signedViews: Math.min(num(o.signed_views), views) };
}

const isSource = (x: unknown): x is TrafficSource => TRAFFIC_SOURCES.includes(x as TrafficSource);
const isKind = (x: unknown): x is TrafficKind => TRAFFIC_KINDS.includes(x as TrafficKind);

function sources(x: unknown): SourceRow[] {
  return arr(x)
    .map((r) => obj(r))
    .filter((o) => isSource(o.source))
    .map((o) => ({ source: o.source as TrafficSource, visits: num(o.visits), views: num(o.views) }))
    .sort((a, b) => b.visits - a.visits || b.views - a.views || (a.source < b.source ? -1 : 1));
}

function kinds(x: unknown): KindRow[] {
  return arr(x)
    .map((r) => obj(r))
    .filter((o) => isKind(o.kind))
    .map((o) => ({ kind: o.kind as TrafficKind, views: num(o.views), visits: num(o.visits) }))
    .sort((a, b) => b.views - a.views || b.visits - a.visits || (a.kind < b.kind ? -1 : 1));
}

/** admin_traffic's answer, or null when it isn't one. */
export function toTrafficUsage(data: unknown): TrafficUsage | null {
  const d = obj(data);
  const today = str(d.today);
  if (!today || !DAY_RE.test(today) || !d.totals || typeof d.totals !== "object") return null;
  const t = obj(d.totals);
  const daily = arr(d.daily)
    .map((x) => {
      const o = obj(x);
      const day = str(o.day);
      return day && DAY_RE.test(day) ? { day, ...counts(o) } : null;
    })
    .filter((x): x is TrafficDay => x !== null)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const bs = obj(d.by_source);
  const bk = obj(d.by_kind);
  const pg = obj(d.pages);
  const st = obj(d.sites);
  const since = str(d.since);
  const per = <T>(f: (w: TrafficWindow) => T) => ({ today: f("today"), d7: f("d7"), d30: f("d30") });
  return {
    today,
    since: since && DAY_RE.test(since) ? since : null,
    totals: { today: counts(t.today), yesterday: counts(t.yesterday), d7: counts(t.d7), prev7: counts(t.prev7), d30: counts(t.d30) },
    daily,
    bySource: per((w) => sources(bs[w])),
    byKind: per((w) => kinds(bk[w])),
    pages: per((w) => topPages(pg[w])),
    sites: per((w) => topSites(st[w])),
  };
}

function topPages(x: unknown): TopList<PageRow> {
  const o = obj(x);
  const rows = arr(o.rows)
    .map((r) => {
      const p = obj(r);
      const path = str(p.path);
      return path ? { path, kind: isKind(p.kind) ? (p.kind as TrafficKind) : "other", views: num(p.views), visits: num(p.visits) } : null;
    })
    .filter((r): r is PageRow => r !== null);
  return { rows, total: Math.max(num(o.total), rows.length) };
}

function topSites(x: unknown): TopList<SiteRow> {
  const o = obj(x);
  const rows = arr(o.rows)
    .map((r) => {
      const s = obj(r);
      const host = str(s.host);
      return host ? { host, visits: num(s.visits), app: s.app === true } : null;
    })
    .filter((r): r is SiteRow => r !== null);
  return { rows, total: Math.max(num(o.total), rows.length) };
}

// ---------------------------------------------------------------------------
// Words and numbers for the admin

/** Where visits come from, as the admin says it. */
export const SOURCE_LABEL: Record<TrafficSource, string> = {
  google: "Google",
  search_other: "Other search engines",
  ai: "AI chat (ChatGPT and others)",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  x: "X (Twitter)",
  other_site: "Other websites",
  app: "Other apps",
  direct: "Direct or not known",
  internal: "Reloads, Back and in-site page loads",
};

/** What people open, as the admin says it. */
export const KIND_LABEL: Record<TrafficKind, string> = {
  home: "Home",
  city: "City pages",
  city_sport: "City + sport pages",
  turf: "Turf pages",
  sport: "Sport pages",
  near_me: "Near me pages",
  turfs_list: "All turfs list",
  games: "Games list",
  game: "Game pages",
  game_create: "Create a game",
  tools: "Free tools",
  blog: "Blog",
  map: "Map",
  live: "Live scores",
  tournament: "Tournaments",
  profile: "Player profiles",
  dashboard: "Me tab",
  my: "myTapturf (owners)",
  other: "Other pages",
};

const n = (x: number) => x.toLocaleString("en-IN");
const count = (x: number, one: string, many = `${one}s`) => `${n(x)} ${x === 1 ? one : many}`;

/**
 * The change from one stretch to the one before, in whole percent:
 * "+12%", "−5%", "±0%"; "new" when there was nothing before; null when
 * there is nothing either side.
 */
export function changeText(now: number, before: number): string | null {
  if (before <= 0) return now > 0 ? "new" : null;
  const pct = Math.round(((now - before) / before) * 100);
  return pct > 0 ? `+${n(pct)}%` : pct < 0 ? `−${n(-pct)}%` : "±0%";
}

/** A part of a whole in whole percent ("45%"), "<1%" for a part too small to round up; "0%" for none. */
export function shareText(part: number, whole: number): string {
  if (whole <= 0 || part <= 0) return "0%";
  const pct = (part / whole) * 100;
  return pct < 1 ? "<1%" : `${Math.round(pct)}%`;
}

// ---------------------------------------------------------------------------
// The first days: windows that counting hasn't filled yet

const DAY_MS = 86_400_000;
/** Whole days from one day to another ("2026-11-01" to "2026-11-04" is 3). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}
/** The day n days after another. */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * How many of a window's `days` full days (yesterday back) were counted:
 * all of them once counting is old enough, fewer in its first days, 0 on
 * the day counting started (that day is today, not a full day yet).
 */
export function fullDaysCounted(u: TrafficUsage, days: number): number {
  if (!u.since) return 0;
  return Math.max(0, Math.min(days, daysBetween(u.since, u.today)));
}

/** The 7 days' change against the 7 before, only once both were counted in full (else it would compare with days before counting began). */
export function weekChange(u: TrafficUsage, k: "visits" | "views"): string | null {
  return fullDaysCounted(u, 14) === 14 ? changeText(u.totals.d7[k], u.totals.prev7[k]) : null;
}

/** The day the 7 days' change first shows: 14 full days after counting started. */
export function changeFrom(u: TrafficUsage): string | null {
  return u.since ? addDays(u.since, 14) : null;
}

/** What a window covers, said plainly, its first days included. */
export function windowNote(u: TrafficUsage, w: TrafficWindow): string {
  if (w === "today") return "Today so far.";
  const days = w === "d7" ? 7 : 30;
  const full = fullDaysCounted(u, days);
  if (full === days) return `Yesterday and the ${days - 1} days before.`;
  if (full === 0) return "Counting started today: these days fill in from tomorrow, one full day at a time.";
  if (full === 1) return "Yesterday, the first full day counted.";
  return `The ${full} full days counted so far: ${dayLabel(u.since!)} to yesterday.`;
}

/** The 7-day figure's words after its number ("in 7 days (+17%)", "in the last 3 days", "yesterday"); null before the first full day. */
export function weekWords(u: TrafficUsage, o: { brackets?: boolean } = {}): string | null {
  const full = fullDaysCounted(u, 7);
  if (full === 0) return null;
  if (full === 1) return "yesterday";
  if (full < 7) return `in the last ${full} days`;
  const change = weekChange(u, "visits");
  if (!change || change === "new") return "in 7 days";
  return o.brackets === false ? `in 7 days ${change}` : `in 7 days (${change})`;
}

/** The Traffic fold's line while closed. */
export function trafficLine(u: TrafficUsage): string {
  if (!u.since) return "Counting visits and page views from today";
  const { today, d7 } = u.totals;
  const week = weekWords(u);
  return [`${count(today.visits, "visit")} today`, ...(week ? [`${n(d7.visits)} ${week}`] : []), `${count(today.views, "page view")} today`].join(" · ");
}

/** A day as the chart and the lists say it: "3 Nov". */
export function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

// ---------------------------------------------------------------------------
// Other sites and apps

/** Names for the apps that send people most often (their Android package, as kept). Any other app shows its package. */
export const APP_NAMES: Record<string, string> = {
  "com.google.android.gm": "Gmail",
  "org.telegram.messenger": "Telegram",
  "com.linkedin.android": "LinkedIn",
  "com.snapchat.android": "Snapchat",
  "com.truecaller": "Truecaller",
  "com.google.android.apps.messaging": "Google Messages",
  "com.samsung.android.messaging": "Samsung Messages",
  "com.reddit.frontpage": "Reddit",
  "com.pinterest": "Pinterest",
  "com.discord": "Discord",
  "org.thoughtcrime.securesms": "Signal",
  "com.microsoft.office.outlook": "Outlook",
  "com.slack": "Slack",
  "in.mohalla.sharechat": "ShareChat",
  "com.quora.android": "Quora",
};

/** A site or app as the admin lists it: its name, and "App" under an app. */
export function siteLabel(s: SiteRow): { label: string; sub?: string } {
  if (s.host === "(other)") return { label: "Others (past the day's 300)" };
  if (s.app) return { label: APP_NAMES[s.host] ?? s.host, sub: "App" };
  return { label: s.host };
}
