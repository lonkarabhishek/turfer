/**
 * One public answer, read once per tab and kept: the rules behind the
 * small labels a cached page gets in the browser after it has loaded
 * (Trending by views, lib/map/trendingClient.ts; what is on at a turf,
 * lib/tournament/turfEvents.ts). Each of those routes answers the same
 * thing to everyone, so a tab asks once and keeps the answer for a while,
 * in the page's memory and, with its time, in the tab's sessionStorage
 * (memory alone when storage is blocked): ten pages opened one after
 * another ask once.
 *
 * `want` asks the route only when nothing fresh is in memory or in
 * storage, and only once however many parts of the page ask; an answer
 * past its time stays on screen until the next one replaces it. The read
 * waits for `later` (the page loaded, idle and on screen), is never made
 * where `allowed` says no (a quiet path, a crawler), and a failed read is
 * kept as the empty answer until the next one is due: nothing shows,
 * nothing throws and nothing is retried sooner.
 *
 * No imports, so each reader's tests run it with a clock, a storage and a
 * route of their own.
 */

/** What the rules need from the browser (the tests hand in their own). */
export type KeptDeps = {
  now: () => number;
  /** The kept text; may throw (storage blocked). */
  load: () => string | null;
  /** Keep the text; may throw. */
  save: (text: string) => void;
  /** GET the route: its JSON, or a rejection for any failure (a status that is not 2xx, the network, bad JSON). */
  get: () => Promise<unknown>;
  /** Run once the page is loaded, idle and on screen. */
  later: (run: () => void) => void;
  /** This page may show it: not a quiet path, not a crawler. */
  allowed: () => boolean;
  /** The page is going away: a read cut off by that is not kept as the empty answer. */
  leaving?: () => boolean;
};

/** How one kind of answer is read, kept and timed. */
export type KeptKind<T> = {
  /** The route's JSON read at `at`. May throw: that is a failed read. */
  fromJson: (json: unknown, at: number) => T;
  /** The empty answer (a failed read, too). */
  none: (at: number) => T;
  /** The text kept in storage. */
  text: (t: T) => string;
  /** The kept text read back without trusting it; null when there is none, it is not that shape, or it is no longer fresh. */
  readKept: (text: string | null | undefined, now: number) => T | null;
  fresh: (t: T | null, now: number) => boolean;
};

export type KeptReader<T> = {
  /** What is known right now, or null (nothing read yet, or not here). The same object until a read replaces it. */
  now: () => T | null;
  /** Something on the page shows it: read it once it is due. Never throws, never waits. */
  want: () => void;
  subscribe: (l: () => void) => () => void;
};

/** One reader per page and kind of answer. */
export function createKeptReader<T>(d: KeptDeps, k: KeptKind<T>): KeptReader<T> {
  let mem: T | null = null;
  let looked = false;
  let busy = false;
  const listeners = new Set<() => void>();

  const known = (): T | null => {
    if (mem || looked) return mem;
    // Storage is read once per page, not on every render.
    looked = true;
    try {
      mem = k.readKept(d.load(), d.now());
    } catch {
      mem = null;
    }
    return mem;
  };

  const read = () => {
    void (async () => {
      let next: T;
      let ok = true;
      try {
        next = k.fromJson(await d.get(), d.now());
      } catch {
        ok = false;
        next = k.none(d.now());
      }
      mem = next;
      busy = false;
      try {
        // A good answer always; a failure too, so a route that is down is not asked again by every page (but not one the page's own leaving cut off).
        if (ok || !d.leaving?.()) d.save(k.text(next));
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
        if (busy || !d.allowed() || k.fresh(known(), d.now())) return;
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
