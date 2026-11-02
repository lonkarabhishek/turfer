import { MAX_TRACKED, windowCounter } from "../limits";
import { VIEW_AGAIN_MS, VIEW_TAG_RE, isBotAgent, viewDay } from "../live/views";

/**
 * How many people use the map, for the admin (the site owner asked on
 * 2 Nov): views of /map, the cards opened from it, and the turf pages'
 * "This turf on the map" opened. Kept by the database as counts per India
 * day, and for a signed-in visitor also with their account
 * (supabase/migrations/20261102_map_views.sql).
 *
 * What counts, decided in the browser as for live scorecards
 * (lib/live/views.ts):
 *   view  /map shown and on screen (never a prerender or a background
 *         tab), not a bot or an automated browser. The same browser again
 *         within VIEW_AGAIN_MS is the same view (a reload, Back from a card,
 *         coming back to the tab). Unique: the browser's first view of the
 *         India day. The browser keeps one note (MAP_SEEN_KEY: the day and
 *         when it last counted), and sends only a yes or no for unique and a
 *         random tag made for that one view: nothing about the visitor.
 *   tap   a turf or game card on /map opened: a link to its page followed,
 *         from the list or the card a pin opens (mapCardKind).
 *   mini  the "This turf on the map" card on a turf page tapped open.
 *
 * The server (POST /api/map/views, lib/map/viewRoute.ts) counts only its
 * own page's JSON, checks the agent and prefetches again and sheds load
 * per network (createMapLimiter); a sign-in sent with it, verified there,
 * puts the account on it. Never where on the map anyone looked. Pure,
 * relative imports only (npm run test:list).
 */

export type MapKind = "view" | "tap" | "mini";
const KINDS: readonly MapKind[] = ["view", "tap", "mini"];

/** The browser's note of its last counted map view, in localStorage. The privacy page lists it under "Stored on your device". */
export const MAP_SEEN_KEY = "tapturf_map_seen_v1";

/** The day (India's) it last counted a unique view, and when it last counted one (ms). */
export type MapSeen = { d: string; at: number };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The note as stored; anything malformed is none, never thrown. */
export function readMapSeen(raw: string | null | undefined): MapSeen | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { d?: unknown; at?: unknown } | null;
    return o && typeof o === "object" && typeof o.d === "string" && DAY_RE.test(o.d) && typeof o.at === "number" && Number.isFinite(o.at) ? { d: o.d, at: o.at } : null;
  } catch {
    return null;
  }
}

/**
 * Whether this showing of /map is a view to send, whether it is the
 * browser's first of the India day, and the note to keep after it. A
 * note from a clock that went back (at in the future) counts again.
 */
export function planMapView(seen: MapSeen | null, now: number): { send: false } | { send: true; unique: boolean; next: MapSeen } {
  if (seen && now >= seen.at && now - seen.at < VIEW_AGAIN_MS) return { send: false };
  const d = viewDay(now);
  return { send: true, unique: !seen || seen.d !== d, next: { d, at: now } };
}

/** Never a bot, a link preview or an automated browser (navigator.webdriver). */
export function personHere(ua: string | null | undefined, webdriver: boolean): boolean {
  return !webdriver && !isBotAgent(ua);
}

/**
 * The kind of card a link on /map opens: "turf" for /turf/<slug>, "game"
 * for /game/<id> on this site; null for anything else (Call, WhatsApp,
 * the street map's credit, a city link).
 */
export function mapCardKind(href: string, origin: string): "turf" | "game" | null {
  let u: URL;
  try {
    u = new URL(href, origin);
  } catch {
    return null;
  }
  if (u.origin !== new URL(origin).origin) return null;
  if (/^\/turf\/[^/]+\/?$/.test(u.pathname)) return "turf";
  if (/^\/game\/[^/]+\/?$/.test(u.pathname) && !/^\/game\/create\/?$/.test(u.pathname)) return "game";
  return null;
}

/** What the browser sends: the kind, unique (a view only) and the event's own random tag. */
export function mapUseBody(kind: MapKind, unique: boolean, tag: string): string {
  return JSON.stringify(kind === "view" ? { k: kind, u: unique, v: tag } : { k: kind, v: tag });
}

/** The use a POST body asks for: a known kind, unique only for a view and only when true, the tag when it is one. */
export function parseMapUse(raw: unknown): { kind: MapKind; unique: boolean; tag: string | null } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as { k?: unknown; u?: unknown; v?: unknown };
  if (!KINDS.includes(o.k as MapKind)) return null;
  const kind = o.k as MapKind;
  return { kind, unique: kind === "view" && o.u === true, tag: typeof o.v === "string" && VIEW_TAG_RE.test(o.v) ? o.v : null };
}

/** The same event (its tag, or a browser's network and agent without one) of one kind closer than this is not counted again here. */
export const MAP_GAP_MS = 10_000;
/** Events per network per minute, per instance, of every kind together. A carrier's network puts many phones behind one address. */
export const MAP_PER_MIN = 120;
/** Events of one kind per network in MAP_KIND_WINDOW_MS, per instance: a script changing its tag every time gets no further. */
export const MAP_PER_NET_KIND = 60;
export const MAP_KIND_WINDOW_MS = 10 * 60_000;
/** Unique visitors per network a day, per instance; a view past it counts, as not unique. */
export const MAP_UNIQUES_PER_NET = 300;

export type MapTake = { count: true; unique: boolean } | { count: false; why: "again" | "slow" | "many" };

/**
 * Per-instance limits for the map's counts, before any database call, so
 * a looping or hostile page costs this function and not the database. net
 * is a keyed hash of the network, who of the event's tag (or the network
 * and agent), never stored. As createViewLimiter (lib/live/views.ts):
 * the same who and kind within MAP_GAP_MS is the same event sent twice
 * ("again"), past the network's minute it is shed ("slow"), and past
 * MAP_PER_NET_KIND of one kind ("many"). Unique is the browser's own note,
 * believed for the first MAP_UNIQUES_PER_NET views per network a day.
 */
export function createMapLimiter(now: () => number = Date.now) {
  const perNet = windowCounter(MAP_PER_MIN, 60_000, now);
  const perKind = windowCounter(MAP_PER_NET_KIND, MAP_KIND_WINDOW_MS, now);
  const uniques = windowCounter(MAP_UNIQUES_PER_NET, 24 * 60 * 60_000, now);
  // Last event per who and kind, in two generations of MAP_GAP_MS, so old entries go without a sweep.
  let recent = new Map<string, number>();
  let older = new Map<string, number>();
  let since = now();
  return (net: string, who: string, kind: MapKind, unique: boolean): MapTake => {
    const t = now();
    if (t - since >= MAP_GAP_MS) {
      older = recent;
      recent = new Map();
      since = t;
    }
    const k = `${who}|${kind}`;
    const last = recent.get(k) ?? older.get(k);
    if (last !== undefined && t - last < MAP_GAP_MS) return { count: false, why: "again" };
    if (!perNet(net)) return { count: false, why: "slow" };
    if (!perKind(`${net}|${kind}`)) return { count: false, why: "many" };
    if (recent.size < MAX_TRACKED) recent.set(k, t);
    return { count: true, unique: kind === "view" && unique && uniques(net) };
  };
}
