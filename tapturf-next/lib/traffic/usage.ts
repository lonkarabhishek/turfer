import { TRAFFIC_KINDS, TRAFFIC_SOURCES, type TrafficKind, type TrafficSource } from "./traffic";

/**
 * The admin's view of the traffic counts (admin_traffic,
 * supabase/migrations/20261104_traffic.sql): today, yesterday, the last 7
 * full India days against the 7 before them, the last 30 full days, every
 * one of the last 30 days, visits and views by source and by kind, the top
 * pages and other sites. Read defensively: a field that is missing or not a
 * number is 0, a row with an unknown source or kind is left out; an answer
 * that isn't one at all is null. The answer names nobody. Pure, relative
 * imports only (npm run test:traffic).
 */

export type TrafficCounts = { views: number; visits: number; signedViews: number };
export type TrafficDay = TrafficCounts & { day: string };
export type SourceRow = { source: TrafficSource; visits: number; views: number };
export type KindRow = { kind: TrafficKind; views: number; visits: number };
export type PageRow = { path: string; kind: TrafficKind; views: number; visits: number };
export type SiteRow = { host: string; visits: number };
/** today, the last 7 full days (yesterday back) and the last 30 full days. */
export type TrafficWindow = "today" | "d7" | "d30";

export type TrafficUsage = {
  /** India's day the numbers were read on ("2026-11-04"). */
  today: string;
  /** The first day anything was counted; null before the first. */
  since: string | null;
  totals: { today: TrafficCounts; yesterday: TrafficCounts; d7: TrafficCounts; prev7: TrafficCounts; d30: TrafficCounts };
  /** The last 30 days, oldest first, today the last, a day with none as 0. */
  daily: TrafficDay[];
  bySource: Record<TrafficWindow, SourceRow[]>;
  byKind: Record<TrafficWindow, KindRow[]>;
  /** The 7 days' most viewed pages, and how many pages had a view. */
  pages: PageRow[];
  pagesTotal: number;
  /** The 7 days' other sites by visits, and how many there were. */
  sites: SiteRow[];
  sitesTotal: number;
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
  const pages = arr(d.pages)
    .map((x) => {
      const o = obj(x);
      const path = str(o.path);
      return path ? { path, kind: isKind(o.kind) ? (o.kind as TrafficKind) : "other", views: num(o.views), visits: num(o.visits) } : null;
    })
    .filter((x): x is PageRow => x !== null);
  const sites = arr(d.sites)
    .map((x) => {
      const o = obj(x);
      const host = str(o.host);
      return host ? { host, visits: num(o.visits) } : null;
    })
    .filter((x): x is SiteRow => x !== null);
  const since = str(d.since);
  return {
    today,
    since: since && DAY_RE.test(since) ? since : null,
    totals: { today: counts(t.today), yesterday: counts(t.yesterday), d7: counts(t.d7), prev7: counts(t.prev7), d30: counts(t.d30) },
    daily,
    bySource: { today: sources(bs.today), d7: sources(bs.d7), d30: sources(bs.d30) },
    byKind: { today: kinds(bk.today), d7: kinds(bk.d7), d30: kinds(bk.d30) },
    pages,
    pagesTotal: Math.max(num(d.pages_total), pages.length),
    sites,
    sitesTotal: Math.max(num(d.sites_total), sites.length),
  };
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

/** The Traffic fold's line while closed. */
export function trafficLine(u: TrafficUsage): string {
  if (!u.since) return "Counting visits and page views from today";
  const { today, d7, prev7 } = u.totals;
  const change = changeText(d7.visits, prev7.visits);
  return `${count(today.visits, "visit")} today · ${n(d7.visits)} in 7 days${change && change !== "new" ? ` (${change})` : ""} · ${count(today.views, "page view")} today`;
}

/** A day as the chart and the lists say it: "3 Nov". */
export function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}
