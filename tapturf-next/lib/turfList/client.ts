import type { Turf } from "../../types/turf";
import type { Coords } from "../utils/location";
import { haversineKm } from "../utils/location";
import {
  FIRST_PAGE,
  MAX_LIMIT,
  exactNearest,
  normalizeQ,
  sportSlug,
  type ListFilters,
  type ListItem,
  type ListPage,
} from "./query";

/**
 * The /turfs listing's state in the browser, as pure functions
 * (components/search/TurfListingClient.tsx holds it; `npm run test:list`).
 *
 * The cards on screen are batches from GET /api/turfs/list (the first one
 * rendered by the server), kept in the route's order. A batch from another
 * version of the list snapshot than the ones before it (a list purge landed
 * between two taps) is accepted, not refetched from the start: its rows are
 * appended after the server's offset with any turf already shown dropped,
 * and the total is the newest. At worst a turf whose rank moved across the
 * batch boundary in that purge is skipped until the next search or reload;
 * refetching instead would reshuffle cards the player already scrolled
 * past. A purge changes few rows, and the route answers by version (`v` in
 * the URL), so this is rare.
 */

export type ListState = {
  /** Which list these are: scope, filters and rounded location (listKey). */
  key: string;
  /** Version of the newest batch. */
  v: number;
  /** Matching turfs in all (newest batch). */
  total: number;
  /** Within 5 km of the rounded location (newest batch), or null. */
  near: number | null;
  /** In the route's order, each turf once. */
  items: ListItem[];
  /** The route's offset after the last batch: where the next one starts. */
  next: number;
  /** No more to fetch (the route ran out, or answered an empty batch). */
  end: boolean;
  /** Cards to show: FIRST_PAGE, then grown by nextBatch() per tap. */
  target: number;
};

export function listKey(city: string | null, f: ListFilters, rounded: Coords | null): string {
  const sort = f.sort === "nearby" && !rounded ? "rating" : f.sort;
  return [city ?? "", f.sport ? sportSlug(f.sport) : "", normalizeQ(f.q).toLowerCase(), sort, rounded ? `${rounded.lat.toFixed(2)},${rounded.lng.toFixed(2)}` : ""].join("|");
}

/** True for a key whose list depends on the viewer's location (never saved for Back). */
export function isGeoKey(key: string): boolean {
  return !key.endsWith("|");
}

/**
 * The rounded point a nearby list was ranked from, or null for any other
 * list: the cards on screen are ordered by their own list's key, so a list
 * still showing (dimmed) while the next one loads keeps its order.
 */
export function nearbyFrom(key: string): Coords | null {
  const parts = key.split("|");
  if (parts.length < 5 || parts[parts.length - 2] !== "nearby") return null;
  const [lat, lng] = parts[parts.length - 1].split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export function startState(key: string, page: ListPage, target = FIRST_PAGE): ListState {
  return addBatch({ key, v: page.v, total: page.total, near: page.near, items: [], next: 0, end: false, target }, page);
}

export function addBatch(s: ListState, page: ListPage): ListState {
  const seen = new Set(s.items.map((i) => i.turf.id));
  const fresh = page.items.filter((i) => !seen.has(i.turf.id));
  const next = Math.max(s.next, page.offset + page.items.length);
  return {
    ...s,
    v: page.v,
    total: page.total,
    near: page.near,
    items: [...s.items, ...fresh],
    next,
    end: page.items.length === 0 || next >= page.total,
  };
}

export type Shown = { item: ListItem; km: number | null };

/**
 * The cards to render, at most s.target. Nearby lists (sorted by the
 * route on the rounded point in their key) are put in exact order for
 * `me` (exactNearest); other lists keep the route's order. Distances are
 * from the precise location, which never leaves the browser.
 */
export function shownCards(s: ListState, me: Coords | null): Shown[] {
  const rounded = nearbyFrom(s.key);
  if (me && rounded) {
    const byId = new Map(s.items.map((i) => [i.turf.id, i]));
    return exactNearest(s.items.map((i) => i.turf), s.end, me, rounded)
      .slice(0, s.target)
      .map(({ item, km }) => ({ item: byId.get(item.id)!, km }));
  }
  return s.items.slice(0, s.target).map((item) => ({ item, km: me ? kmFrom(me, item.turf) : null }));
}

function kmFrom(me: Coords, t: Pick<Turf, "lat" | "lng">): number | null {
  if (!Number.isFinite(t.lat) || !Number.isFinite(t.lng)) return null;
  const d = haversineKm(me, { lat: t.lat as number, lng: t.lng as number });
  return Number.isFinite(d) ? d : null;
}

/**
 * The batch to fetch so `ready` cards (shownCards().length) reach
 * s.target, or null when nothing is missing or there is nothing left.
 * Normal lists ask for exactly the gap from s.next (10 at 10, 20 at 20...,
 * the same offsets for everyone). Nearby lists ask for a little more
 * (exactNearest needs some turfs past the last one it shows).
 */
export function wantBatch(s: ListState, ready: number): { offset: number; limit: number } | null {
  if (s.end || ready >= s.target || ready >= s.total) return null;
  const gap = s.target - ready;
  const limit = nearbyFrom(s.key) ? gap + Math.max(10, Math.ceil(s.target / 2)) : gap;
  return { offset: s.next, limit: Math.min(MAX_LIMIT, Math.max(1, limit)) };
}

/** The first batch of a new list: FIRST_PAGE, or a little more for nearby. */
export function firstBatch(nearby: boolean): { offset: number; limit: number } {
  return { offset: 0, limit: nearby ? FIRST_PAGE * 2 : FIRST_PAGE };
}

/* ---------- Back to the list: the cards and the scroll position ---------- */

export const SAVE_KEY = "tt_turfs_list_v1";
/** A saved list older than this is not restored (a new version is likely; the batches are cheap). */
export const SAVE_TTL_MS = 30 * 60_000;
/** Saving more than this many cards is not worth the storage (and the JSON). */
export const SAVE_MAX_ITEMS = 400;

export type Saved = {
  /** location.pathname + location.search when saved. */
  url: string;
  /** The rendered scope (#tt-scope data-scope): a city id, or "" for all of India. */
  scope: string;
  filters: ListFilters;
  state: ListState;
  y: number;
  at: number;
};

/** What to store for Back, or null when this list should not be kept (a nearby list, or too long). */
export function toSaved(url: string, scope: string, filters: ListFilters, state: ListState, y: number, now: number): string | null {
  if (isGeoKey(state.key) || state.items.length > SAVE_MAX_ITEMS) return null;
  const saved: Saved = { url, scope, filters, state, y: Math.max(0, Math.round(y)), at: now };
  return JSON.stringify(saved);
}

/** The saved list for this URL and scope, if it is recent and well formed. */
export function fromSaved(raw: string | null, url: string, scope: string, now: number): Saved | null {
  if (!raw) return null;
  let s: Saved;
  try {
    s = JSON.parse(raw) as Saved;
  } catch {
    return null;
  }
  if (!s || typeof s !== "object" || s.url !== url || s.scope !== scope) return null;
  if (typeof s.at !== "number" || now - s.at > SAVE_TTL_MS || now < s.at) return null;
  const st = s.state;
  if (!st || typeof st.key !== "string" || isGeoKey(st.key) || !Array.isArray(st.items) || st.items.length === 0) return null;
  if (!st.items.every((i) => i && i.turf && typeof i.turf.id === "string" && typeof i.turf.name === "string")) return null;
  if (![st.v, st.total, st.next, st.target].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0)) return null;
  if (!s.filters || typeof s.filters.q !== "string" || typeof s.filters.sort !== "string") return null;
  return { ...s, y: typeof s.y === "number" && Number.isFinite(s.y) ? s.y : 0 };
}

/**
 * Runs while the HTML is parsed, before the first paint: a URL with a
 * search, sport or sort (a shared link, /turfs?q=, Back) gets cards the
 * server could not render (the page is static), so the server's default
 * cards are dimmed (html[data-tt-list="wait"], globals.css) until the
 * listing has fetched the right ones and takes over. Gives up after 8 s,
 * so a page whose scripts never run is never left dimmed. ES5.
 */
export const LIST_PREPAINT_JS = `(function(){try{var d=document.documentElement;if(/[?&](q|search|sport|sort)=[^&]/.test(location.search)){d.setAttribute("data-tt-list","wait");setTimeout(function(){d.removeAttribute("data-tt-list")},8000)}}catch(e){}})();`;
