/**
 * Who started each live scoreboard link, for /admin/live and the admin
 * home's latest link (admin_live_links2, 20261029_live_link_starts.sql):
 * the account that turned it on, as the server verified it on the link's
 * first write. Links from before that, and every link while the file is
 * not applied, say "Not recorded": nothing here guesses from times or
 * sign-ins. And how many times each was viewed (admin_live_views,
 * 20261101_live_views.sql, kept after the match is cleared; lib/live/views.ts
 * says what a view is). Pure; relative imports only (npm run test:live).
 */

import { liveStatusAt } from "../live/types";

export type LiveStarter = {
  /** The account, for the admin's people list (/admin?person=<id>#people). */
  id: string;
  name: string | null;
  username: string | null;
  method: "google" | "phone" | null;
  /** When it was recorded. */
  at: string | null;
};

/** One link as admin_live_links returns it (admin_live_links2 adds the starter_* columns). */
export type AdminLiveLink = {
  code: string;
  status: string;
  sport: string | null;
  team_a: string | null;
  team_b: string | null;
  title: string | null;
  venue: string | null;
  events: number;
  writes: number;
  created_at: string;
  updated_at: string;
  /** null: not recorded. */
  starter: LiveStarter | null;
  /** Its views (admin_live_views, 20261101_live_views.sql), 0 and 0 when never viewed; null when views can't be read (before that file too). */
  views: LiveViews | null;
};

/** A link's views: page views, and unique viewers (one per browser per day, so a browser back the next day counts again). */
export type LiveViews = { views: number; viewers: number; last: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USERNAME = /^[a-z][a-z0-9_]{2,19}$/;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** A row of either read; one without a starter (admin_live_links, or a link with none recorded) gets null. */
export function toAdminLiveLink(row: Record<string, unknown>): AdminLiveLink {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const id = typeof row.starter_id === "string" && UUID.test(row.starter_id) ? row.starter_id.toLowerCase() : null;
  const username = str(row.starter_username);
  const method = row.starter_method === "google" || row.starter_method === "phone" ? row.starter_method : null;
  return {
    code: String(row.code ?? ""),
    status: String(row.status ?? ""),
    sport: str(row.sport),
    team_a: str(row.team_a),
    team_b: str(row.team_b),
    title: str(row.title),
    venue: str(row.venue),
    events: n(row.events),
    writes: n(row.writes),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    starter: id ? { id, name: str(row.starter_name), username: username && USERNAME.test(username) ? username : null, method, at: str(row.started_at) } : null,
    views: null,
  };
}

/** admin_live_views' rows by code. Counts arrive as numbers or, past 2^53, strings: anything not a whole count is left out. */
export function toLiveViews(rows: Record<string, unknown>[]): Map<string, LiveViews> {
  const out = new Map<string, LiveViews>();
  for (const r of rows) {
    const code = typeof r.code === "string" ? r.code : "";
    const views = Number(r.views);
    const viewers = Number(r.viewers);
    if (!/^[a-z0-9]{12}$/.test(code) || !Number.isSafeInteger(views) || !Number.isSafeInteger(viewers) || views < 0 || viewers < 0) continue;
    out.set(code, { views, viewers: Math.min(viewers, views), last: str(r.last_viewed_at) });
  }
  return out;
}

/** The links with their views: 0 for one never viewed; all null when the views could not be read. */
export function withViews(links: AdminLiveLink[], views: Map<string, LiveViews> | null): AdminLiveLink[] {
  return links.map((l) => ({ ...l, views: views ? (views.get(l.code) ?? { views: 0, viewers: 0, last: null }) : null }));
}

/** Every link's views added up, for the admin home's tile; null when they could not be read. */
export function viewTotals(views: Map<string, LiveViews> | null): { views: number; viewers: number; links: number } | null {
  if (!views) return null;
  let v = 0;
  let u = 0;
  for (const x of views.values()) {
    v += x.views;
    u += x.viewers;
  }
  return { views: v, viewers: u, links: views.size };
}

export const methodLabel = (m: LiveStarter["method"]): string => (m === "google" ? "Google" : m === "phone" ? "Phone" : "Sign-in");

/** Who started it, in a word or two. */
export const starterName = (s: LiveStarter | null): string => (s ? s.name || (s.username ? `@${s.username}` : "No name on the account") : "Not recorded");

/**
 * A starter recorded this long after the link began came from a later
 * signed-in write: a link from before the check, or one that began before
 * 20261029_live_link_starts.sql was applied (recording waited for it).
 */
const LATER_MS = 10 * 60_000;

/** Whether the starter was recorded well after the link began, by a later signed-in write from the browser holding its secret. */
export function recordedLater(link: Pick<AdminLiveLink, "created_at" | "starter">): boolean {
  const a = Date.parse(link.created_at);
  const b = link.starter?.at ? Date.parse(link.starter.at) : NaN;
  return Number.isFinite(a) && Number.isFinite(b) && b - a > LATER_MS;
}

/**
 * The line under the latest link's name on the admin home: what it is, how
 * it stands at now (as /admin/live has it: a live link with no update for 2
 * hours is closed, which the database never stores), and how it was signed in.
 */
export function latestLinkSub(link: AdminLiveLink, ago: string, now: number): string {
  const what = link.sport ? (link.sport === "cricket" ? "Cricket" : link.sport.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase())) : null;
  const status = liveStatusAt(link.status, Date.parse(link.updated_at), now);
  const state = status === "live" ? "live now" : status === "closed" ? "closed (idle)" : status === "done" ? "finished" : status;
  const who = link.starter ? [link.starter.username ? `@${link.starter.username}` : null, methodLabel(link.starter.method)].filter(Boolean).join(" · ") : null;
  return [what, state, `started ${ago}`, who].filter(Boolean).join(" · ");
}
