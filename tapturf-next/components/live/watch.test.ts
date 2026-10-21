// Run with: npm run test:live
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WATCH_CAP,
  WATCH_HIDDEN_MS,
  WATCH_RETRY_MS,
  WATCH_SYNC_WAIT_MS,
  createLeases,
  createWatch,
  presentCount,
  watchLabel,
  watchTopic,
  watchersOf,
  type WatchChannel,
  type WatchStatus,
  type Watchers,
} from "./watch";

test("the count is presence keys with anyone behind them, capped at 100", () => {
  assert.equal(presentCount({}), 0);
  assert.equal(presentCount({ a: [{}], b: [{}, {}], c: [] }), 2);
  assert.deepEqual(watchersOf(0), { count: 0, capped: false });
  assert.deepEqual(watchersOf(12), { count: 12, capped: false });
  assert.deepEqual(watchersOf(WATCH_CAP - 1), { count: 99, capped: false });
  assert.deepEqual(watchersOf(WATCH_CAP), { count: 100, capped: true });
  assert.deepEqual(watchersOf(250), { count: 100, capped: true });
  assert.deepEqual(watchersOf(-3), { count: 0, capped: false });
});

test("the eye reads in plain words", () => {
  assert.deepEqual(watchLabel({ count: 1, capped: false }), { text: "1", aria: "1 person watching" });
  assert.deepEqual(watchLabel({ count: 12, capped: false }), { text: "12", aria: "12 people watching" });
  assert.deepEqual(watchLabel({ count: 100, capped: true }), { text: "100+", aria: "100 or more people watching" });
  assert.equal(watchTopic("ab12cd34ef56"), "live-watch:ab12cd34ef56");
});

/* ------------------------------------------------------------------ */
/* The controller, on a fake channel and clock                         */
/* ------------------------------------------------------------------ */

const tick = () => new Promise<void>((r) => setImmediate(r));

type Fake = {
  topic: string;
  sync: (() => void) | null;
  status: ((s: WatchStatus) => void) | null;
  presence: Record<string, unknown[]>;
  tracks: number;
  untracks: number;
  removed: boolean;
  trackAnswer: string;
};

function rig(opts: { fail?: number; hidden?: boolean } = {}) {
  let now = 0;
  let seq = 0;
  let failOpens = opts.fail ?? 0;
  let hidden = opts.hidden ?? false;
  const timers: { id: number; at: number; fn: () => void }[] = [];
  const channels: Fake[] = [];
  const shown: (Watchers | null)[] = [];
  let opens = 0;
  const io = {
    open: async (topic: string): Promise<WatchChannel> => {
      opens++;
      if (failOpens > 0) {
        failOpens--;
        throw new Error("no realtime");
      }
      const f: Fake = { topic, sync: null, status: null, presence: {}, tracks: 0, untracks: 0, removed: false, trackAnswer: "ok" };
      channels.push(f);
      return {
        onSync: (fn) => (f.sync = fn),
        subscribe: (fn) => (f.status = fn),
        state: () => f.presence,
        track: async () => {
          f.tracks++;
          return f.trackAnswer;
        },
        untrack: async () => {
          f.untracks++;
          return "ok";
        },
        remove: async () => {
          f.removed = true;
          return "ok";
        },
      };
    },
    setTimer: (fn: () => void, ms: number) => {
      timers.push({ id: ++seq, at: now + ms, fn });
      return seq;
    },
    clearTimer: (id: unknown) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    hidden: () => hidden,
    emit: (w: Watchers | null) => shown.push(w),
  };
  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > end) break;
      timers.shift();
      now = t.at;
      t.fn();
      await tick();
    }
    now = end;
    await tick();
  };
  /** The server's presence_state or diff: these keys are present now. */
  const present = (f: Fake, keys: number) => {
    f.presence = Object.fromEntries(Array.from({ length: keys }, (_, i) => [`k${i}`, [{}]]));
    f.sync?.();
  };
  return {
    io,
    channels,
    shown,
    advance,
    present,
    get opens() {
      return opens;
    },
    get timers() {
      return timers.length;
    },
    setHidden(h: boolean) {
      hidden = h;
    },
  };
}

test("a follower joins only after SUBSCRIBED and the first sync, and counts themself in", async () => {
  const r = rig();
  const w = createWatch("abc", true, r.io);
  await tick();
  const c = r.channels[0];
  assert.equal(c.topic, "live-watch:abc");
  // Not subscribed yet: nothing is tracked, whatever arrives.
  r.present(c, 3);
  assert.equal(c.tracks, 0);
  c.status?.("SUBSCRIBED");
  r.present(c, 3);
  assert.equal(c.tracks, 1);
  await tick();
  // Our own key arrives with the next sync.
  r.present(c, 4);
  assert.deepEqual(r.shown.at(-1), { count: 4, capped: false });
  r.present(c, 5);
  assert.deepEqual(r.shown.at(-1), { count: 5, capped: false });
  assert.equal(c.tracks, 1);
  w.stop();
  assert.equal(c.untracks, 1);
  assert.equal(c.removed, true);
});

test("a follower who finds 100 there does not join, shows 100+, and checks again when looked at", async () => {
  const r = rig();
  const w = createWatch("abc", true, r.io);
  await tick();
  const c = r.channels[0];
  c.status?.("SUBSCRIBED");
  r.present(c, WATCH_CAP);
  assert.equal(c.tracks, 0);
  assert.equal(c.removed, true);
  assert.deepEqual(r.shown.at(-1), { count: 100, capped: true });
  // Back to the tab later: one more look.
  r.setHidden(true);
  w.hidden();
  r.setHidden(false);
  w.visible();
  await tick();
  assert.equal(r.channels.length, 2);
  const c2 = r.channels[1];
  c2.status?.("SUBSCRIBED");
  r.present(c2, 40);
  assert.equal(c2.tracks, 1);
  w.stop();
});

test("no presence_state soon after SUBSCRIBED: the follower decides on what is known", async () => {
  const r = rig();
  const w = createWatch("abc", true, r.io);
  await tick();
  const c = r.channels[0];
  c.status?.("SUBSCRIBED");
  await r.advance(WATCH_SYNC_WAIT_MS - 1);
  assert.equal(c.tracks, 0);
  await r.advance(1);
  assert.equal(c.tracks, 1);
  w.stop();
});

test("the scorer listens without joining", async () => {
  const r = rig();
  const w = createWatch("abc", false, r.io);
  await tick();
  const c = r.channels[0];
  c.status?.("SUBSCRIBED");
  r.present(c, 0);
  assert.deepEqual(r.shown.at(-1), { count: 0, capped: false });
  r.present(c, 7);
  assert.deepEqual(r.shown.at(-1), { count: 7, capped: false });
  await r.advance(WATCH_SYNC_WAIT_MS * 2);
  assert.equal(c.tracks, 0);
  w.stop();
  assert.equal(c.untracks, 0);
  assert.equal(c.removed, true);
});

test("an error hides the count, retries once after 10 s, then waits for the next look", async () => {
  const r = rig();
  const w = createWatch("abc", false, r.io);
  await tick();
  r.channels[0].status?.("SUBSCRIBED");
  r.present(r.channels[0], 2);
  r.channels[0].status?.("CHANNEL_ERROR");
  assert.equal(r.shown.at(-1), null);
  // The client's own rejoin is stopped by dropping the channel.
  assert.equal(r.channels[0].removed, true);
  await r.advance(WATCH_RETRY_MS - 1);
  assert.equal(r.opens, 1);
  await r.advance(1);
  assert.equal(r.opens, 2);
  r.channels[1].status?.("TIMED_OUT");
  assert.equal(r.channels[1].removed, true);
  await r.advance(10 * WATCH_RETRY_MS);
  assert.equal(r.opens, 2, "no loop");
  // Looked at again: a fresh try.
  w.visible();
  await tick();
  assert.equal(r.opens, 3);
  r.channels[2].status?.("SUBSCRIBED");
  r.present(r.channels[2], 1);
  assert.deepEqual(r.shown.at(-1), { count: 1, capped: false });
  w.stop();
});

test("no Realtime at all: null, one retry, then quiet", async () => {
  const r = rig({ fail: 5 });
  const w = createWatch("abc", true, r.io);
  await tick();
  assert.deepEqual(r.shown, [null]);
  await r.advance(WATCH_RETRY_MS);
  assert.equal(r.opens, 2);
  await r.advance(5 * WATCH_RETRY_MS);
  assert.equal(r.opens, 2);
  assert.equal(r.timers, 0);
  w.stop();
});

test("a track the server refuses hides the count", async () => {
  const r = rig();
  const w = createWatch("abc", true, r.io);
  await tick();
  const c = r.channels[0];
  c.trackAnswer = "timed out";
  c.status?.("SUBSCRIBED");
  r.present(c, 2);
  await tick();
  assert.equal(r.shown.at(-1), null);
  assert.equal(c.removed, true);
  w.stop();
});

test("a tab hidden 30 s leaves the count and joins again when looked at", async () => {
  const r = rig();
  const w = createWatch("abc", true, r.io);
  await tick();
  const c = r.channels[0];
  c.status?.("SUBSCRIBED");
  r.present(c, 3);
  await tick();
  r.present(c, 4);
  r.setHidden(true);
  w.hidden();
  // A quick look away (a WhatsApp reply) stays in.
  await r.advance(WATCH_HIDDEN_MS - 1);
  r.setHidden(false);
  w.visible();
  assert.equal(c.removed, false);
  r.setHidden(true);
  w.hidden();
  await r.advance(WATCH_HIDDEN_MS);
  assert.equal(c.untracks, 1);
  assert.equal(c.removed, true);
  // The last count stays on screen; nothing is opened while hidden.
  assert.deepEqual(r.shown.at(-1), { count: 4, capped: false });
  assert.equal(r.opens, 1);
  r.setHidden(false);
  w.visible();
  await tick();
  assert.equal(r.opens, 2);
  w.stop();
});

test("a page that opens hidden waits until it is looked at", async () => {
  const r = rig({ hidden: true });
  const w = createWatch("abc", true, r.io);
  await tick();
  assert.equal(r.opens, 0);
  r.setHidden(false);
  w.visible();
  await tick();
  assert.equal(r.opens, 1);
  w.stop();
});

test("stopped while the client loads: the channel is dropped as soon as it comes", async () => {
  const r = rig();
  const w = createWatch("abc", true, r.io);
  w.stop();
  await tick();
  assert.equal(r.channels[0].removed, true);
  assert.equal(r.channels[0].status, null);
  assert.deepEqual(r.shown, []);
});

test("one channel per topic at a time: the next waits for the last to be released", async () => {
  const leases = createLeases();
  const order: string[] = [];
  const first = await leases.acquire("t");
  const second = leases.acquire("t").then((rel) => {
    order.push("second");
    return rel;
  });
  const other = await leases.acquire("u");
  order.push("other");
  await tick();
  assert.deepEqual(order, ["other"]);
  first();
  const rel2 = await second;
  assert.deepEqual(order, ["other", "second"]);
  rel2();
  other();
  // Releasing twice is harmless, and nothing is kept once every topic is free.
  first();
  assert.equal(leases.size(), 0);
});
