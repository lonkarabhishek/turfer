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
 * note of the links it has counted (LIVE_SEEN_KEY: code, day, time), takes
 * it back when the server did not count the view (so the next visit tries
 * again), and sends only a yes or no for unique and a random tag made for
 * that one view (newViewTag): nothing about the viewer.
 *
 * The server (POST /api/live/<code>/views) counts only its own page's
 * JSON (viewFromPage), checks the agent again and sheds load per instance
 * (createViewLimiter); its memory of a view is a keyed hash of the tag
 * and of the network for a few minutes, never stored. Pure, relative
 * imports only (npm run test:live).
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

/**
 * The note with a view the server did not count taken back: the link's
 * entry as it was before that view (was), so the next visit tries again,
 * unique still if it was. Left as it is when the note no longer holds
 * that view (counted at `at`): another tab counted since.
 */
export function unseeView(seen: SeenNote, code: string, at: number, was: SeenNote[string] | undefined): SeenNote {
  if (seen[code]?.at !== at) return seen;
  const rest = Object.fromEntries(Object.entries(seen).filter(([c]) => c !== code));
  return was ? { ...rest, [code]: was } : rest;
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

/** A view's own random tag (newViewTag): 16 hex characters, made for that one view and never kept. */
export const VIEW_TAG_RE = /^[0-9a-f]{16}$/;

/** A fresh tag for one view: random, nothing about the browser in it. */
export function newViewTag(): string {
  const b = new Uint8Array(8);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** The view a POST body asks for: {unique: true} or anything else (not unique), with the view's tag (v) when it has one. */
export function parseViewBody(raw: unknown): { unique: boolean; tag: string | null } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as { unique?: unknown; v?: unknown };
  return { unique: o.unique === true, tag: typeof o.v === "string" && VIEW_TAG_RE.test(o.v) ? o.v : null };
}

/**
 * Whether a view comes from this site's own page (the follower hook's
 * fetch): JSON, and same-origin by Sec-Fetch-Site, or by the Origin's
 * host where a browser sends no Sec-Fetch-Site. Another site's page can
 * send a text/plain POST without asking first; one in JSON it must ask
 * about, and this site never says yes.
 */
export function viewFromPage(headers: Pick<Headers, "get">, url: string): boolean {
  if (!/^application\/json\s*(;|$)/i.test(headers.get("content-type") ?? "")) return false;
  const site = headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = headers.get("origin");
  if (!origin) return false;
  let host = "";
  let own = "";
  try {
    host = new URL(origin).host;
    own = new URL(url).host;
  } catch {
    return false;
  }
  return host === (headers.get("x-forwarded-host") ?? headers.get("host") ?? own) || host === own;
}

/** The same view (its tag, or a browser's network and agent without one) to one link closer than this is not counted again here. */
export const VIEW_GAP_MS = 10_000;
/** Views per network per minute, per instance. A carrier's network puts many phones behind one address. */
export const VIEWS_PER_MIN = 120;
/** Views of one link per network in VIEW_LINK_WINDOW_MS, per instance: a ground's Wi-Fi or one carrier address full of a local match's followers. */
export const VIEWS_PER_NET_LINK = 20;
export const VIEW_LINK_WINDOW_MS = 10 * 60_000;
/** Unique viewers of one link per network a day, per instance; a view past it counts, as not unique. */
export const UNIQUES_PER_NET_LINK = 50;

export type ViewTake = { count: true; unique: boolean } | { count: false; why: "again" | "slow" | "many" };

/**
 * Per-instance limits for counting views, before any database call, so a
 * looping or hostile page costs this function and not the database. net
 * is a keyed hash of the network, who of the view's tag (or the network
 * and agent), never stored. The same who for the same link within
 * VIEW_GAP_MS is not counted ("again": the same view sent twice); past the
 * network's minute views are shed ("slow"), and past VIEWS_PER_NET_LINK
 * for one link ("many"): a script changing its agent or tag on every
 * view gets no further. Unique is the browser's own note (planView),
 * believed for the first UNIQUES_PER_NET_LINK of a link per network a
 * day; phones of one model behind one carrier address share an agent, so
 * this never judges it by the agent.
 */
export function createViewLimiter(now: () => number = Date.now) {
  const perNet = windowCounter(VIEWS_PER_MIN, 60_000, now);
  const perLink = windowCounter(VIEWS_PER_NET_LINK, VIEW_LINK_WINDOW_MS, now);
  const uniques = windowCounter(UNIQUES_PER_NET_LINK, 24 * 60 * 60_000, now);
  // Last view per who and link, in two generations of VIEW_GAP_MS, so old entries go without a sweep.
  let recent = new Map<string, number>();
  let older = new Map<string, number>();
  let since = now();
  return (net: string, who: string, code: string, unique: boolean): ViewTake => {
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
    if (!perLink(`${net}|${code}`)) return { count: false, why: "many" };
    if (recent.size < MAX_TRACKED) recent.set(k, t);
    return { count: true, unique: unique && uniques(`${net}|${code}`) };
  };
}
