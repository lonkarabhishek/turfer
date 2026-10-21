/**
 * The eye count on a live score: how many people have it open now.
 * Supabase Realtime Presence on a public channel per link, nothing in the
 * database. Each follower's tab joins under a random key with an empty
 * payload; the scorer only listens. The decisions are here, on injected
 * I/O, so watch.test.ts runs them with a fake channel and clock;
 * useWatchers wires them to the browser client and the page.
 * No React and relative imports only (npm run test:live).
 */

/** A follower who finds this many already watching does not join: the count shows "100+" and presence traffic stays bounded. */
export const WATCH_CAP = 100;
/** A tab hidden this long leaves the count; it joins again when looked at. */
export const WATCH_HIDDEN_MS = 30_000;
/** After a failed join: one more try this much later, then nothing until the page is looked at again. */
export const WATCH_RETRY_MS = 10_000;
/** A follower decides whether to join on the first presence sync, or after this long without one. */
export const WATCH_SYNC_WAIT_MS = 2_000;

export type Watchers = { count: number; capped: boolean };

export function watchTopic(code: string): string {
  return `live-watch:${code}`;
}

/** Presence keys with anyone behind them. A key is one tab, so the count includes the viewer themself. */
export function presentCount(state: Record<string, readonly unknown[] | undefined>): number {
  let n = 0;
  for (const k in state) if (state[k]?.length) n++;
  return n;
}

/** What the eye shows for this many present: at most the cap, flagged once it is reached. */
export function watchersOf(present: number): Watchers {
  const n = Math.max(0, Math.floor(present));
  return n >= WATCH_CAP ? { count: WATCH_CAP, capped: true } : { count: n, capped: false };
}

/** "12" and "12 people watching"; "100+" once capped. */
export function watchLabel(w: Watchers): { text: string; aria: string } {
  if (w.capped) return { text: `${WATCH_CAP}+`, aria: `${WATCH_CAP} or more people watching` };
  return { text: String(w.count), aria: w.count === 1 ? "1 person watching" : `${w.count} people watching` };
}

/* ------------------------------------------------------------------ */
/* The controller                                                      */
/* ------------------------------------------------------------------ */

export type WatchStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";

/** One Realtime channel, as much of it as the count needs. */
export type WatchChannel = {
  /** Listen for presence syncs. Called before subscribe, which is what turns presence on for the channel. */
  onSync: (fn: () => void) => void;
  subscribe: (fn: (status: WatchStatus) => void) => void;
  state: () => Record<string, readonly unknown[] | undefined>;
  /** Resolves "ok" once the server has it. */
  track: () => Promise<unknown>;
  untrack: () => Promise<unknown>;
  /** Unsubscribe and drop the channel (the socket closes with the last one). */
  remove: () => Promise<unknown>;
};

export type WatchIo = {
  /** The channel for a topic, with this tab's presence key. Rejects when Realtime is not there (no client, no keys). */
  open: (topic: string) => Promise<WatchChannel>;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (t: unknown) => void;
  hidden: () => boolean;
  /** What to show; null hides the count. */
  emit: (w: Watchers | null) => void;
};

export type Watch = { visible: () => void; hidden: () => void; stop: () => void };

const noop = () => {};

/**
 * Count the people on one link. track: a follower (joins the count) or
 * the scorer (only listens). Joins only after SUBSCRIBED, as the
 * Presence docs say; any error or timeout hides the count, with one
 * retry and no reconnect loop.
 */
export function createWatch(code: string, track: boolean, io: WatchIo): Watch {
  let alive = true;
  /** Bumped on every open and close, so a late answer from an old channel is ignored. */
  let gen = 0;
  let ch: WatchChannel | null = null;
  let opening = false;
  let tracked = false;
  let decided = false;
  let retried = false;
  let retryTimer: unknown = null;
  let hideTimer: unknown = null;
  let syncTimer: unknown = null;

  const clear = (t: unknown) => {
    if (t !== null) io.clearTimer(t);
  };

  /** Leave the channel. leave: untrack first (a healthy channel going away on purpose). */
  const close = (leave: boolean) => {
    gen++;
    clear(syncTimer);
    syncTimer = null;
    const c = ch;
    ch = null;
    if (c) {
      if (leave && tracked) c.untrack().catch(noop);
      c.remove().catch(noop);
    }
    tracked = false;
    decided = false;
  };

  const fail = (g: number) => {
    if (g !== gen || !alive) return;
    close(false);
    io.emit(null);
    if (retried || io.hidden()) return;
    retried = true;
    retryTimer = io.setTimer(() => {
      retryTimer = null;
      connect();
    }, WATCH_RETRY_MS);
  };

  /** A follower's first look: join the count, or show 100+ and leave without joining. */
  const decide = (g: number, c: WatchChannel) => {
    if (g !== gen || decided) return;
    decided = true;
    clear(syncTimer);
    syncTimer = null;
    const n = presentCount(c.state());
    if (n >= WATCH_CAP) {
      close(false);
      io.emit({ count: WATCH_CAP, capped: true });
      return;
    }
    tracked = true;
    c.track().then(
      (r) => {
        if (r !== "ok") fail(g);
      },
      () => fail(g),
    );
  };

  const connect = () => {
    if (!alive || ch || opening || io.hidden()) return;
    opening = true;
    const g = ++gen;
    io.open(watchTopic(code)).then(
      (c) => {
        opening = false;
        // Stopped or closed while the client loaded. Looked at again meanwhile: that look found this open under way.
        if (g !== gen || !alive) {
          c.remove().catch(noop);
          if (alive && !io.hidden()) connect();
          return;
        }
        ch = c;
        let subscribed = false;
        c.onSync(() => {
          if (g !== gen || !subscribed) return;
          if (track && !decided) decide(g, c);
          else io.emit(watchersOf(presentCount(c.state())));
        });
        c.subscribe((status) => {
          if (g !== gen) return;
          if (status === "SUBSCRIBED") {
            if (subscribed) return;
            subscribed = true;
            // Back in: the next drop gets its own retry. Only a success refills it, so this never loops.
            retried = false;
            // presence_state follows the join; if it is slow, decide on what is known.
            if (track) syncTimer = io.setTimer(() => decide(g, c), WATCH_SYNC_WAIT_MS);
            return;
          }
          // An error, a timeout, or the server closing the channel. The client would rejoin on its own, forever:
          // removing the channel stops that.
          fail(g);
        });
      },
      () => {
        opening = false;
        if (g === gen) fail(g);
        else if (alive && !io.hidden()) connect();
      },
    );
  };

  connect();

  return {
    visible() {
      if (!alive) return;
      clear(hideTimer);
      hideTimer = null;
      clear(retryTimer);
      retryTimer = null;
      // A fresh look: a fresh retry, and a capped follower checks again.
      retried = false;
      connect();
    },
    hidden() {
      if (!alive) return;
      clear(retryTimer);
      retryTimer = null;
      if (hideTimer !== null) return;
      hideTimer = io.setTimer(() => {
        hideTimer = null;
        // A tab left open in the background is not watching. The last count stays until the next look.
        if (io.hidden()) close(true);
      }, WATCH_HIDDEN_MS);
    },
    stop() {
      alive = false;
      clear(retryTimer);
      clear(hideTimer);
      retryTimer = hideTimer = null;
      close(true);
    },
  };
}

/**
 * One channel per topic at a time in a tab. The client hands back the
 * channel it already has for a topic and drops channels by topic, so a
 * page mounted again (Strict Mode, Back) must wait until the last one is
 * gone. acquire resolves once the topic is free; call the release it
 * gives when that channel has been removed.
 */
export function createLeases() {
  const tails = new Map<string, Promise<void>>();
  return {
    async acquire(topic: string): Promise<() => void> {
      const before = tails.get(topic) ?? Promise.resolve();
      let release = noop;
      const mine = new Promise<void>((r) => (release = r));
      const tail = before.then(() => mine);
      tails.set(topic, tail);
      await before;
      let done = false;
      return () => {
        if (done) return;
        done = true;
        release();
        if (tails.get(topic) === tail) tails.delete(topic);
      };
    },
    size: () => tails.size,
  };
}
