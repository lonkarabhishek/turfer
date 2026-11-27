import { enoughTrending, parseTrendWindow, parseTrending, trendSpan, type TrendWindow, type TrendWire } from "./trendWire";

/**
 * Trending by views off the map (the site owner, 27 Nov 2026: "If a turf is
 * trending show it on the page as well at the top plus in the listing"): a
 * turf's own page and its card in every list say "Trending #3" for the same
 * turfs, with the same ranks and the same window as /map's Trending view,
 * because they read the map's own answer, GET /api/map/trending (the top
 * ten across India by turf page views in the last 24 hours, 7 days or 30
 * days, ranks only and never a count; fewer than five trending turfs is
 * none at all), and read it back with the map's own functions
 * (lib/map/trendWire.ts).
 *
 * What it costs: one request per tab in TREND_KEEP_MS (10 minutes, as long
 * as the route's answer is kept), whatever the visitor opens. The answer
 * is kept in this page's memory and, with its time, in the tab's
 * sessionStorage (TREND_STORE_KEY: first-party, the route's public answer
 * and when it was read, nothing about the visitor; memory alone when
 * storage is blocked), so ten turf pages opened one after another ask
 * once. The read waits for the page to be loaded, idle and on screen
 * (components/turf/useTrending.ts), is never made on the admin, myTapturf,
 * an owner's report or the email pages, nor by a crawler, and a failed
 * read is "nobody is trending" until the next one is due: nothing shows,
 * nothing throws and nothing is retried sooner.
 *
 * The rules are here, apart from the browser, so the tests run them with a
 * clock, a storage and a route of their own. Relative imports only (`npm
 * run test:list`).
 */

export const TREND_URL = "/api/map/trending";
/** One read per tab in this long: the route's own answer changes no sooner (app/api/map/trending/route.ts). */
export const TREND_KEEP_MS = 10 * 60_000;
export const TREND_STORE_KEY = "tt_trending_v1";

/** The route's answer as a page holds it: when it was read, the window, and each trending turf's rank by its key. */
export type TrendNow = { at: number; window: TrendWindow; list: readonly TrendWire[]; ranks: ReadonlyMap<string, number> };

function shape(at: number, window: TrendWindow, list: TrendWire[]): TrendNow {
  return { at, window, list, ranks: new Map(list.map((t) => [t.k, t.r])) };
}

/** The route's JSON read at `at`, exactly as /map reads it (components/map/MapExplorer.tsx): no ranks at all when fewer than five turfs trend. */
export function trendNow(json: unknown, at: number): TrendNow {
  return shape(at, parseTrendWindow(json), enoughTrending(parseTrending(json)));
}

/** Nobody is trending (a failed read, too): nothing shows anywhere. */
export function noTrend(at: number): TrendNow {
  return shape(at, "24h", []);
}

/** The text kept in sessionStorage: the time of the read and the route's own two keys. */
export function keepText(t: TrendNow): string {
  return JSON.stringify({ at: t.at, window: t.window, trending: t.list });
}

/** Read within the last TREND_KEEP_MS. A time ahead of the clock (the clock went back) is not fresh. */
export function trendFresh(t: TrendNow | null, now: number): boolean {
  return !!t && t.at <= now && now - t.at < TREND_KEEP_MS;
}

/**
 * The kept text read back without trusting it, or null when there is none,
 * it is not that shape, or it is no longer fresh: the page then reads the
 * route again. The list goes through the same checks as the route's answer.
 */
export function readKept(text: string | null | undefined, now: number): TrendNow | null {
  if (!text) return null;
  try {
    const v = JSON.parse(text) as { at?: unknown } | null;
    if (!v || typeof v !== "object" || typeof v.at !== "number" || !Number.isFinite(v.at)) return null;
    const t = trendNow(v, v.at);
    return trendFresh(t, now) ? t : null;
  } catch {
    return null;
  }
}

/** Where Trending never shows and is never read: the admin, myTapturf, an owner's report and the email pages (lib/outcome/prompt.ts quietPath's list). */
export function trendPath(path: string): boolean {
  const p = path.toLowerCase();
  return !["/admin", "/my", "/report", "/email"].some((x) => p === x || p.startsWith(`${x}/`));
}

/**
 * A turf's rank, or null when it does not trend. The route names a turf by
 * its page's key, its slug or else its id (lib/map/data.ts mapPoint, the
 * key /map's pins and cards carry), so that is what is looked up, from the
 * same row a card or a turf page has.
 */
export function trendRankOf(t: TrendNow | null | undefined, turf: { id?: string | null; slug?: string | null }): number | null {
  if (!t || t.ranks.size === 0) return null;
  return (turf.slug ? t.ranks.get(turf.slug) : undefined) ?? (turf.id ? t.ranks.get(turf.id) : undefined) ?? null;
}

/**
 * TurfCard's `trendRank` and `trendOver` for a turf in a list: its rank and
 * the window in the map's words ("the last 7 days"), as /map's own cards
 * get them; a turf that does not trend gets no rank and the card says nothing.
 */
export function trendCard(t: TrendNow | null | undefined, turf: { id?: string | null; slug?: string | null }): { trendRank: number | null; trendOver?: string } {
  const trendRank = trendRankOf(t, turf);
  return t && trendRank ? { trendRank, trendOver: trendSpan(t.window) } : { trendRank: null };
}

/** The chip on a turf's own page: "Trending #3 on TapTurf". */
export function trendChip(rank: number): string {
  return `Trending #${rank} on TapTurf`;
}

/** What that means, in plain words and with the map's own words for the window: "Number 3 by page views in the last 7 days". */
export function trendMeaning(rank: number, w: TrendWindow): string {
  return `Number ${rank} by page views in ${trendSpan(w)}`;
}

/** What the rules need from the browser (the tests hand in their own). */
export type TrendDeps = {
  now: () => number;
  /** The kept text; may throw (storage blocked). */
  load: () => string | null;
  /** Keep the text; may throw. */
  save: (text: string) => void;
  /** GET the route: its JSON, or a rejection for any failure (a status that is not 2xx, the network, bad JSON). */
  get: () => Promise<unknown>;
  /** Run once the page is loaded, idle and on screen. */
  later: (run: () => void) => void;
  /** This page may show it: not a quiet path (trendPath), not a crawler. */
  allowed: () => boolean;
  /** The page is going away: a read cut off by that is not kept as "nobody is trending". */
  leaving?: () => boolean;
};

export type TrendReader = {
  /** What is known right now, or null (nothing read yet, or not here). The same object until a read replaces it. */
  now: () => TrendNow | null;
  /** Something on the page shows it: read it once it is due. Never throws, never waits. */
  want: () => void;
  subscribe: (l: () => void) => () => void;
};

/**
 * One reader per page. `want` asks the route only when nothing fresh is in
 * memory or in storage, and only once however many cards ask; an answer
 * older than TREND_KEEP_MS stays on screen until the next one replaces it.
 */
export function createTrendReader(d: TrendDeps): TrendReader {
  let mem: TrendNow | null = null;
  let looked = false;
  let busy = false;
  const listeners = new Set<() => void>();

  const known = (): TrendNow | null => {
    if (mem || looked) return mem;
    // Storage is read once per page, not on every card's render.
    looked = true;
    try {
      mem = readKept(d.load(), d.now());
    } catch {
      mem = null;
    }
    return mem;
  };

  const read = () => {
    void (async () => {
      let next: TrendNow;
      let ok = true;
      try {
        next = trendNow(await d.get(), d.now());
      } catch {
        ok = false;
        next = noTrend(d.now());
      }
      mem = next;
      busy = false;
      try {
        // A good answer always; a failure too, so a route that is down is not asked again by every page (but not one the page's own leaving cut off).
        if (ok || !d.leaving?.()) d.save(keepText(next));
      } catch {
        /* storage blocked: memory only */
      }
      for (const l of listeners) {
        try {
          l();
        } catch {
          /* one listener never stops the rest */
        }
      }
    })();
  };

  return {
    now: () => {
      try {
        return d.allowed() ? known() : null;
      } catch {
        return null;
      }
    },
    want: () => {
      try {
        if (busy || !d.allowed() || trendFresh(known(), d.now())) return;
        busy = true;
        d.later(read);
      } catch {
        busy = false;
      }
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}
