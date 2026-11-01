import { LIVE_LINKS_KEY } from "./types";
import { MAX_TRACKED, windowCounter } from "../limits";

/**
 * Views of a live scorecard (/live/<code>): how many times its page was
 * opened, and how many browsers opened it, once a day each. Kept by the
 * database apart from the match (private.live_link_views,
 * supabase/migrations/20261101_live_views.sql), so the counts outlast the
 * 30-day clear-out of the match itself, for the admin.
 *
 * What counts as a view, decided in the browser (planView): the page
 * shows a score (live or finished), is on screen (never a prerender or a
 * background tab), is not a bot or an automated browser, and is not the
 * scorer's own browser (it holds the link, LIVE_LINKS_KEY). The same
 * browser opening the same link again within VIEW_AGAIN_MS is one view
 * (a reload, Back, coming back to the tab). Unique: the first view of the
 * link from this browser on this day (India's day). The browser keeps a
 * note of the links it has counted (LIVE_SEEN_KEY: code, day, time), and
 * sends only a yes or no for unique: no id, nothing about the viewer.
 *
 * The server (POST /api/live/<code>/views) checks the agent again and
 * sheds load per instance (createViewLimiter); its own memory of a
 * browser is a keyed hash of the network and agent for a few seconds,
 * never stored. Pure, relative imports only (npm run test:live).
 */

/** The browser's note of the live links it counted, in localStorage. Kept outside the scorer's keys. */
export const LIVE_SEEN_KEY = "tapturf_live_seen_v1";
/** The same browser opening the same link again within this is the same view. */
export const VIEW_AGAIN_MS = 30 * 60_000;
/** Links kept in the note at most; the least recently counted go first. */
export const SEEN_MAX = 40;
/** A link leaves the note this long after it was last counted (the privacy page says two days). */
export const SEEN_FOR_MS = 48 * 60 * 60_000;
/** The page reads the count again this often while it is on screen and the score updates. */
export const VIEWS_REFRESH_MS = 2 * 60_000;

const IST_MS = 330 * 60_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[a-z0-9]{12}$/;

/** The day in India at a time (ms): "2026-11-01". A browser's unique view is once per link per such day. */
export function viewDay(now: number): string {
  return new Date(now + IST_MS).toISOString().slice(0, 10);
}

/** Per link code: the day it was last counted as unique (d) and when it was last counted (at, ms). */
export type SeenNote = Record<string, { d: string; at: number }>;

/** The note as stored; anything malformed is left out, never thrown. */
export function readSeen(raw: string | null): SeenNote {
  if (!raw) return {};
  try {
    const o: unknown = JSON.parse(raw);
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    const out: SeenNote = {};
    for (const [code, v] of Object.entries(o as Record<string, unknown>)) {
      const e = (v && typeof v === "object" ? v : {}) as { d?: unknown; at?: unknown };
      if (CODE_RE.test(code) && typeof e.d === "string" && DAY_RE.test(e.d) && typeof e.at === "number" && Number.isFinite(e.at)) out[code] = { d: e.d, at: e.at };
    }
    return out;
  } catch {
    return {};
  }
}

export type ViewPlan = { send: false } | { send: true; unique: boolean; next: SeenNote };

/**
 * Whether this opening of a link is a view to send, and whether it is the
 * browser's first of the day for that link, with the note to keep after
 * it. A note from a clock that went back (at in the future) counts again.
 */
export function planView(seen: SeenNote, code: string, now: number): ViewPlan {
  const was = seen[code];
  if (was && now >= was.at && now - was.at < VIEW_AGAIN_MS) return { send: false };
  const day = viewDay(now);
  const unique = !was || was.d !== day;
  const kept = Object.entries({ ...seen, [code]: { d: day, at: now } })
    .filter(([, e]) => now - e.at < SEEN_FOR_MS)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, SEEN_MAX);
  return { send: true, unique, next: Object.fromEntries(kept) };
}

/** Whether this browser holds the link (the scorer's own record of it, LIVE_LINKS_KEY), on or off: its views are not counted. */
export function scorerHolds(raw: string | null, code: string): boolean {
  if (!raw) return false;
  try {
    const o = JSON.parse(raw) as { links?: unknown };
    const links = o && typeof o === "object" && o.links && typeof o.links === "object" ? Object.values(o.links as Record<string, unknown>) : [];
    return links.some((l) => !!l && typeof l === "object" && (l as { code?: unknown }).code === code);
  } catch {
    return false;
  }
}

export { LIVE_LINKS_KEY };

/** What the follower page knows when it is on screen: the browser's agent and webdriver flag, and its two notes as stored (null: none, or no storage). */
export type ViewerHere = { code: string; now: number; ua: string; webdriver: boolean; links: string | null; seen: string | null };

/**
 * Whether this opening is a view to count, and if so whether it is
 * unique and the note to keep: never for a bot or an automated browser,
 * nor in the browser holding the link (the scorer), nor again within
 * VIEW_AGAIN_MS.
 */
export function decideView(v: ViewerHere): { unique: boolean; next: SeenNote } | null {
  if (v.webdriver || isBotAgent(v.ua) || scorerHolds(v.links, v.code)) return null;
  const plan = planView(readSeen(v.seen), v.code, v.now);
  return plan.send ? { unique: plan.unique, next: plan.next } : null;
}

// Crawlers, link previews (WhatsApp's and Telegram's fetchers, Slack, Discord), monitors, headless and scripted browsers,
// and HTTP libraries. WhatsApp's fetcher starts "WhatsApp/"; the apps' own in-app browsers carry a phone browser's agent.
const BOT_AGENT =
  /bot\b|bot\/|crawl|spider|slurp|scrap|facebookexternalhit|facebookcatalog|^whatsapp\/|embedly|quora link preview|bingpreview|google web preview|google-inspectiontool|lighthouse|pagespeed|gtmetrix|pingdom|uptime|headless|phantomjs|puppeteer|playwright|selenium|webdriver|electron|^curl|^wget|python|^java\/|okhttp|axios|node-fetch|^node|undici|go-http|libwww|httpclient|^dart|postman|insomnia/i;

/** A crawler, a link preview, a monitor or an automated browser by its user agent. No agent at all is one too. */
export function isBotAgent(ua: string | null | undefined): boolean {
  const s = (ua ?? "").trim();
  // Cubot is a phone maker ("Android 10; CUBOT X30"), not a bot.
  return s.length < 12 || BOT_AGENT.test(s.replace(/cubot/gi, ""));
}

/** Whether a request is a prefetch or prerender (Chrome's Sec-Purpose, the older Purpose and X-Moz). */
export function isPrefetch(headers: Pick<Headers, "get">): boolean {
  return [headers.get("sec-purpose"), headers.get("purpose"), headers.get("x-moz"), headers.get("x-purpose")].some((v) => !!v && /prefetch|prerender|preview/i.test(v));
}

export type ViewCount = { views: number; viewers: number };

/** live_view_add or live_view_count's answer ({r: 'ok', views, viewers}); null for anything else. */
export function toViewCount(data: unknown): ViewCount | null {
  const d = (data && typeof data === "object" ? data : {}) as { r?: unknown; views?: unknown; viewers?: unknown };
  const views = Number(d.views);
  const viewers = Number(d.viewers);
  if (d.r !== "ok" || !Number.isSafeInteger(views) || !Number.isSafeInteger(viewers) || views < 0 || viewers < 0) return null;
  return { views, viewers: Math.min(viewers, views) };
}

/** "1 view", "1,234 views", "1,23,456 views". */
export function viewsLabel(n: number): string {
  return `${n.toLocaleString("en-IN")} ${n === 1 ? "view" : "views"}`;
}

/** The view a POST body asks for: {unique: true} or anything else (not unique). */
export function parseViewBody(raw: unknown): { unique: boolean } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return { unique: (raw as { unique?: unknown }).unique === true };
}

/** Views from one browser (network and agent) to one link closer than this are not counted again here. */
export const VIEW_GAP_MS = 10_000;
/** Views per network per minute, per instance. A carrier's network puts many phones behind one address. */
export const VIEWS_PER_MIN = 120;

/**
 * Per-instance limits for counting views, before any database call, so a
 * looping or hostile page costs this function and not the database. who
 * is a keyed hash of the network and agent (never stored). A view from
 * the same who for the same link within VIEW_GAP_MS is not counted
 * ("again": a page reloaded in a loop, or one that ignores its note), and
 * past the network's minute views are shed ("slow"). Unique is the
 * browser's own note (planView): this does not judge it, since phones of
 * one model behind one carrier address share a who all day.
 */
export function createViewLimiter(now: () => number = Date.now) {
  const perNet = windowCounter(VIEWS_PER_MIN, 60_000, now);
  // Last view per who and link, in two generations of VIEW_GAP_MS, so old entries go without a sweep.
  let recent = new Map<string, number>();
  let older = new Map<string, number>();
  let since = now();
  return (net: string, who: string, code: string): { count: true } | { count: false; why: "again" | "slow" } => {
    const t = now();
    if (t - since >= VIEW_GAP_MS) {
      older = recent;
      recent = new Map();
      since = t;
    }
    const k = `${who}|${code}`;
    const last = recent.get(k) ?? older.get(k);
    if (last !== undefined && t - last < VIEW_GAP_MS) return { count: false, why: "again" };
    if (!perNet(net)) return { count: false, why: "slow" };
    if (recent.size < MAX_TRACKED) recent.set(k, t);
    return { count: true };
  };
}
