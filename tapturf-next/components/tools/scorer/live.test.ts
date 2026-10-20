// Run with: npm run test:scorer (compiled with tsc to .test-out/scorer-ui, then node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Match } from "../../../lib/cricket/scoring";
import { LIVE_KEEPALIVE_MAX_BYTES, LIVE_RETRY_MS, LIVE_SEND_EVERY_MS, type LiveLinkRecord } from "../../../lib/live/types";
import {
  canKeepLink,
  createLiveSync,
  handleResult,
  keepaliveAllowed,
  liveInfo,
  makeSecret,
  nextRev,
  pillTone,
  readNew,
  readReminder,
  readReply,
  retryDelay,
  sendWait,
  shapeOf,
  shortUrl,
  syncState,
  type LiveIo,
  type LiveNet,
} from "./live";
import { MAX_SAVED, saveMatch, type MatchMeta } from "./storage";

const T0 = 1_760_000_000_000;
const CODE = "abcdefgh1234";
const CODE2 = "zzzzzzzz9999";
const SECRET = "ab".repeat(32);
const link = (over: Partial<LiveLinkRecord> = {}): LiveLinkRecord => ({ code: CODE, secret: SECRET, on: true, rev: T0, sentRev: 0, createdAt: T0, ...over });
const net = (over: Partial<LiveNet> = {}): LiveNet => ({ offline: false, halted: false, fault: null, mode: null, ...over });
const LIVE1 = { status: "live" as const, innings: [1] };
const LIVE2 = { status: "live" as const, innings: [1, 2] };
const DONE2 = { status: "done" as const, innings: [1, 2] };

/* ------------------------------------------------------------------ */
/* Pure decisions                                                      */
/* ------------------------------------------------------------------ */

test("rev follows the clock but never goes back", () => {
  assert.equal(nextRev(0, T0), T0);
  assert.equal(nextRev(T0, T0 + 5000), T0 + 5000);
  // Same millisecond, or a phone clock that stepped back ten minutes.
  assert.equal(nextRev(T0, T0), T0 + 1);
  assert.equal(nextRev(T0, T0 - 600_000), T0 + 1);
});

test("shape changes at an innings or match end only", () => {
  assert.equal(shapeOf(LIVE1), "live:1");
  assert.notEqual(shapeOf(LIVE1), shapeOf(LIVE2));
  assert.notEqual(shapeOf(LIVE2), shapeOf(DONE2));
});

test("send wait: leading edge, one trailing send per window, urgent skips only the throttle", () => {
  const idle = { now: T0, lastStart: 0, lastDone: 0, retryAt: 0, urgent: false };
  assert.equal(sendWait(idle), 0, "first edit goes at once");
  const busy = { ...idle, lastStart: T0 - 1000, lastDone: T0 - 700 };
  assert.equal(sendWait(busy), LIVE_SEND_EVERY_MS - 1000, "then waits out the window");
  assert.equal(sendWait({ ...busy, urgent: true }), 0, "an innings end goes now");
  assert.equal(sendWait({ ...busy, urgent: true, lastDone: T0 - 100 }), 500, "but not inside the server's gap");
  assert.equal(sendWait({ ...busy, urgent: true, retryAt: T0 + 4000 }), 4000, "nor inside a backoff");
});

test("backoff steps up and stays at the last step", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(retryDelay), [...LIVE_RETRY_MS, 30_000, 30_000]);
});

test("answers are read by their body; anything else is unavailable", () => {
  assert.deepEqual(readReply(200, { ok: true, rev: 5 }), { r: "ok", rev: 5 });
  assert.deepEqual(readReply(200, { ok: true }), { r: "ok", rev: undefined });
  assert.deepEqual(readReply(409, { error: "stale", rev: 9 }), { r: "stale", rev: 9 });
  for (const e of ["slow", "forbidden", "gone", "limit", "busy", "too_big", "bad", "unavailable"]) assert.equal(readReply(400, { error: e }).r, e);
  assert.equal(readReply(502, null).r, "unavailable");
  assert.equal(readReply(404, "<html>").r, "unavailable");
  assert.equal(readReply(400, { error: "nope" }).r, "unavailable");
  assert.equal(readReply(200, { ok: "yes" }).r, "unavailable");
  assert.equal(readReply(409, { error: "stale", rev: -1 }).rev, undefined);

  assert.deepEqual(readNew(200, { code: CODE }), { code: CODE });
  assert.deepEqual(readNew(200, { code: "SHORT" }), { fault: "unavailable" });
  assert.deepEqual(readNew(429, { error: "limit" }), { fault: "limit" });
  assert.deepEqual(readNew(503, { error: "unavailable" }), { fault: "unavailable" });
});

test("handleResult follows the LiveError table", () => {
  const l = link({ rev: T0 + 10, sentRev: T0 });

  // ok: sentRev moves up; a newer local rev stays to be sent.
  const ok = handleResult(l, T0 + 5, { r: "ok", rev: T0 + 5 }, 3, true);
  assert.equal(ok.link.sentRev, T0 + 5);
  assert.equal(ok.link.rev, T0 + 10);
  assert.deepEqual([ok.wait, ok.fails, ok.offline, ok.fault, ok.halt], [0, 0, false, null, false]);
  assert.equal(handleResult(l, T0 + 10, { r: "ok" }, 0, true).link.sentRev, T0 + 10, "no rev in the body: the one sent");
  assert.equal(handleResult(link({ sentRev: T0 + 50 }), T0 + 5, { r: "ok", rev: T0 + 5 }, 0, true).link.sentRev, T0 + 50, "never lowers sentRev");

  // stale: jump past the server's rev and send again, unless the server already has this exact rev.
  const ahead = handleResult(l, T0 + 10, { r: "stale", rev: T0 + 99 }, 0, true);
  assert.equal(ahead.link.rev, T0 + 100);
  assert.equal(ahead.link.sentRev, T0);
  const same = handleResult(l, T0 + 10, { r: "stale", rev: T0 + 10 }, 0, true);
  assert.equal(same.link.sentRev, T0 + 10, "a lost ok: the server has it");
  const behind = handleResult(l, T0 + 5, { r: "stale", rev: T0 + 5 }, 0, true);
  assert.equal(behind.link.rev, T0 + 10, "local edits since: just send them");

  const slow = handleResult(l, T0 + 10, { r: "slow" }, 2, true);
  assert.deepEqual([slow.wait, slow.fails, slow.link], [LIVE_SEND_EVERY_MS / 2, 2, l]);

  for (const r of ["forbidden", "gone"] as const) {
    const s = handleResult(l, T0 + 10, { r }, 0, true);
    assert.equal(s.link.on, false, r);
    assert.equal(s.link.stopped, r);
    assert.equal(s.fault, r);
  }

  // limit and too_big: off here only while the server has nothing; once it has taken a write, stay on (to be turned off) and halt.
  for (const r of ["limit", "too_big"] as const) {
    const first = handleResult(link(), T0, { r }, 0, true);
    assert.deepEqual([first.link.on, first.link.stopped, first.fault, first.halt], [false, r, r, false], r);
    const later = handleResult(l, T0 + 10, { r }, 0, true);
    assert.deepEqual([later.link, later.fault, later.halt], [l, r, true], r);
  }

  // busy: the site-wide cap. Back off like a 5xx and keep the link on.
  const busy = handleResult(l, T0 + 10, { r: "busy" }, 1, true);
  assert.deepEqual([busy.link, busy.wait, busy.fails, busy.offline, busy.fault, busy.halt], [l, LIVE_RETRY_MS[1], 2, false, "busy", false]);

  const bad = handleResult(l, T0 + 10, { r: "bad" }, 0, true);
  assert.equal(bad.halt, true);
  assert.equal(bad.link.on, true);

  const net0 = handleResult(l, T0 + 10, { r: "network" }, 0, true);
  assert.deepEqual([net0.wait, net0.fails, net0.offline], [LIVE_RETRY_MS[0], 1, true]);
  const down = handleResult(l, T0 + 10, { r: "unavailable" }, 1, true);
  assert.deepEqual([down.wait, down.fails, down.offline], [LIVE_RETRY_MS[1], 2, false]);
  assert.equal(handleResult(l, T0 + 10, { r: "unavailable" }, 1, false).offline, true, "offline when the phone says so");
});

test("keepalive only with something unsent, one at a time, and small", () => {
  const l = link({ rev: T0 + 10, sentRev: T0 });
  const k = { link: l, inFlightRev: 0, busy: false, bytes: 20_000, unloading: false };
  assert.equal(keepaliveAllowed(k), true);
  assert.equal(keepaliveAllowed({ ...k, link: link({ rev: T0, sentRev: T0 }) }), false, "nothing unsent");
  assert.equal(keepaliveAllowed({ ...k, busy: true }), false, "one keepalive in flight");
  assert.equal(keepaliveAllowed({ ...k, bytes: LIVE_KEEPALIVE_MAX_BYTES + 1 }), false, "too big for the budget");
  assert.equal(keepaliveAllowed({ ...k, bytes: LIVE_KEEPALIVE_MAX_BYTES }), true);
  assert.equal(keepaliveAllowed({ ...k, inFlightRev: T0 + 10 }), false, "the same rev is already out");
  assert.equal(keepaliveAllowed({ ...k, inFlightRev: T0 + 10, unloading: true }), true, "unless the page is going");
  assert.equal(keepaliveAllowed({ ...k, link: { ...l, on: false } }), false);
  assert.equal(keepaliveAllowed({ ...k, link: { ...l, stopped: "off" } }), false, "a stop is pending");
});

test("sync state, info and the pill", () => {
  assert.equal(syncState(null, undefined), "off");
  assert.equal(syncState(null, net({ fault: "offline" })), "error", "turning on failed");
  assert.equal(syncState(link({ on: false, stopped: "off" }), undefined), "off");
  assert.equal(syncState(link({ stopped: "off" }), undefined), "off", "stop pending");
  assert.equal(syncState(link({ on: false, stopped: "gone" }), undefined), "error");
  assert.equal(syncState(link({ rev: T0, sentRev: T0 }), undefined), "synced");
  assert.equal(syncState(link({ rev: T0 + 1, sentRev: T0 }), net()), "sending");
  assert.equal(syncState(link({ rev: T0 + 1, sentRev: T0 }), net({ offline: true })), "offline");
  assert.equal(syncState(link(), net({ halted: true })), "error");

  const refused = liveInfo(link({ on: false, stopped: "too_big" }), undefined);
  assert.deepEqual([refused.on, refused.state, refused.fault], [false, "error", "too_big"]);
  assert.equal(liveInfo(link({ on: false, stopped: "off" }), undefined).fault, null);
  assert.equal(liveInfo(link(), undefined).on, true);

  assert.equal(pillTone(liveInfo(null, undefined)), null);
  assert.equal(pillTone(liveInfo(null, net({ mode: "starting" }))), "amber");
  assert.equal(pillTone(liveInfo(link({ sentRev: T0 }), undefined)), "green");
  assert.equal(pillTone(liveInfo(link(), net({ offline: true }))), "amber");
  assert.equal(pillTone(liveInfo(link({ on: false, stopped: "gone" }), undefined)), "red");
  assert.equal(pillTone(liveInfo(link({ on: false, stopped: "off" }), undefined)), null);
});

test("keep the same link only while it can still take writes", () => {
  assert.equal(canKeepLink(link(), T0 + 3_600_000), true);
  assert.equal(canKeepLink(link(), T0 + 25 * 3_600_000), false);
  assert.equal(canKeepLink(link({ on: false, stopped: "off" }), T0), false);
  assert.equal(canKeepLink(null, T0), false);
});

test("a game reminder's venue and from=game are read, and left out of the query", () => {
  assert.deepEqual(readReminder("?venue=%20Turf%20Park%20&from=game"), { venue: "Turf Park", fromGame: true, rest: "" });
  assert.deepEqual(readReminder("?utm_source=wa&venue=X&from=game&tab=1"), { venue: "X", fromGame: true, rest: "?utm_source=wa&tab=1" });
  assert.deepEqual(readReminder("?from=other"), { venue: "", fromGame: false, rest: "" });
  assert.deepEqual(readReminder(""), { venue: "", fromGame: false, rest: "" });
  assert.equal(readReminder(`?venue=${"v".repeat(60)}`).venue.length, 48);
});

test("saving past the cap names the matches it dropped", () => {
  const store = new Map<string, string>();
  const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  Object.defineProperty(globalThis, "localStorage", { value: ls, configurable: true });
  try {
    const meta = (i: number): MatchMeta => ({ id: `m${i}`, teamA: "A", teamB: "B", headline: "", status: "done", createdAt: i, updatedAt: i });
    const save = (i: number) => saveMatch({ id: `m${i}` } as unknown as Match, meta(i));
    for (let i = 1; i <= MAX_SAVED; i++) assert.deepEqual(save(i).dropped, []);
    const full = save(MAX_SAVED + 1);
    assert.deepEqual(full.dropped, ["m1"], "the oldest goes");
    assert.equal(full.index.list.length, MAX_SAVED);
    assert.equal(store.has("tapturf_scorer_m_m1"), false);
    assert.deepEqual(save(MAX_SAVED + 1).dropped, [], "saving the same match again drops nothing");
  } finally {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("secret is 64 hex; short url drops the scheme", () => {
  const s = makeSecret(new Uint8Array(32).map((_, i) => i * 8));
  assert.match(s, /^[0-9a-f]{64}$/);
  assert.equal(s.slice(0, 6), "000810");
  assert.equal(shortUrl(`https://www.tapturf.in/live/${CODE}`), `tapturf.in/live/${CODE}`);
  assert.equal(shortUrl(`http://localhost:3000/live/${CODE}`), `localhost:3000/live/${CODE}`);
});

/* ------------------------------------------------------------------ */
/* The engine, on a fake clock and network                             */
/* ------------------------------------------------------------------ */

type Call = {
  method: string;
  url: string;
  body: { secret?: string; rev?: number; match?: { n: number } } | null;
  keepalive: boolean;
  answer: (status: number, body: unknown) => Promise<void>;
  drop: () => Promise<void>;
};

const tickOver = () => new Promise<void>((r) => setImmediate(r));

function rig(start: { links?: Record<string, LiveLinkRecord>; matches?: Record<string, { n: number }> } = {}) {
  let now = T0;
  let seq = 0;
  const timers: { id: number; at: number; fn: () => void }[] = [];
  const links: Record<string, LiveLinkRecord> = { ...start.links };
  const matches: Record<string, { n: number }> = { ...start.matches };
  const calls: Call[] = [];
  const io: LiveIo = {
    now: () => now,
    setTimer: (fn, ms) => {
      timers.push({ id: ++seq, at: now + ms, fn });
      return seq;
    },
    clearTimer: (id) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    online: () => true,
    request: (method, url, body, keepalive) =>
      new Promise((resolve, reject) => {
        calls.push({
          method,
          url,
          body: body === null ? null : JSON.parse(body),
          keepalive,
          answer: async (status, b) => {
            resolve({ status, body: b });
            await tickOver();
          },
          drop: async () => {
            reject(new TypeError("Failed to fetch"));
            await tickOver();
          },
        });
      }),
    links: () => JSON.parse(JSON.stringify(links)),
    saveLink: (id, rec) => {
      if (rec) links[id] = { ...rec };
      else delete links[id];
    },
    match: (id) => matches[id] ?? null,
    secret: () => SECRET,
    emit: () => {},
  };
  const sync = createLiveSync(io);
  /** Move the clock on, running timers as they fall due. */
  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > end) break;
      timers.shift();
      now = Math.max(now, t.at);
      t.fn();
      await tickOver();
    }
    now = end;
  };
  /** A local edit: save the match, then tell the engine, as LiveScorer's persist() does. */
  const edit = (id: string, n: number, shape: { status: "live" | "done"; innings: number[] } = LIVE1) => {
    matches[id] = { n };
    sync.changed(id, shape);
  };
  return { io, sync, links, matches, calls, advance, edit };
}

const ok = (c: Call, rev = c.body?.rev) => c.answer(200, { ok: true, rev });
const fail = (c: Call, status: number, body: unknown) => c.answer(status, body);
const drop = (c: Call) => c.drop();

test("engine: leading send, one at a time, then one trailing send with the latest match", async () => {
  const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) } });
  t.edit("m1", 1);
  assert.equal(t.calls.length, 1, "the first edit goes at once");
  assert.equal(t.calls[0].method, "PUT");
  assert.equal(t.calls[0].url, `/api/live/${CODE}`);
  assert.equal(t.calls[0].body?.match?.n, 1);
  assert.equal(t.calls[0].body?.secret, SECRET);

  await t.advance(300);
  t.edit("m1", 2);
  await t.advance(300);
  t.edit("m1", 3);
  assert.equal(t.calls.length, 1, "nothing more while one is out");

  await ok(t.calls[0]);
  assert.equal(t.links.m1.sentRev, t.calls[0].body?.rev);
  assert.equal(t.calls.length, 1, "the trailing send waits for the window");
  await t.advance(LIVE_SEND_EVERY_MS);
  assert.equal(t.calls.length, 2);
  assert.equal(t.calls[1].body?.match?.n, 3, "read from storage at send time");
  assert.equal(t.calls[1].body?.rev, t.links.m1.rev);

  await ok(t.calls[1]);
  assert.equal(t.links.m1.sentRev, t.links.m1.rev);
  await t.advance(10_000);
  assert.equal(t.calls.length, 2, "all sent: quiet");
});

test("engine: an innings or match end skips the throttle", async () => {
  const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) } });
  t.edit("m1", 1);
  await ok(t.calls[0]);
  await t.advance(700);
  t.edit("m1", 2, LIVE2);
  assert.equal(t.calls.length, 2, "new innings goes now");
  await ok(t.calls[1]);
  await t.advance(100);
  t.edit("m1", 3, DONE2);
  assert.equal(t.calls.length, 2, "but not inside the server's gap");
  await t.advance(600);
  assert.equal(t.calls.length, 3);
  assert.equal(t.calls[2].body?.match?.n, 3);
});

test("engine: network errors back off; coming back online sends at once", async () => {
  const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) } });
  t.edit("m1", 1);
  await drop(t.calls[0]);
  assert.equal(t.sync.snapshot().net.m1.offline, true);
  await t.advance(LIVE_RETRY_MS[0] - 1);
  assert.equal(t.calls.length, 1);
  await t.advance(1);
  assert.equal(t.calls.length, 2, "retry after 2 s");
  await fail(t.calls[1], 503, { error: "unavailable" });
  await t.advance(LIVE_RETRY_MS[1] - 1);
  assert.equal(t.calls.length, 2, "then 4 s");
  t.sync.wake();
  assert.equal(t.calls.length, 3, "online or visible: at once");
  await ok(t.calls[2]);
  assert.equal(t.sync.snapshot().net.m1.offline, false);
  assert.equal(t.links.m1.sentRev, t.links.m1.rev);
});

test("engine: retries keep to the throttle, except a failed innings end", async () => {
  const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) } });
  t.edit("m1", 1);
  await ok(t.calls[0]);
  await t.advance(3000);
  t.edit("m1", 2);
  await drop(t.calls[1]);
  await t.advance(LIVE_RETRY_MS[0]);
  assert.equal(t.calls.length, 2, "a ball's retry waits for the window too");
  await t.advance(LIVE_SEND_EVERY_MS - LIVE_RETRY_MS[0]);
  assert.equal(t.calls.length, 3);
  await ok(t.calls[2]);
  await t.advance(3000);
  t.edit("m1", 3, LIVE2);
  await drop(t.calls[3]);
  await t.advance(LIVE_RETRY_MS[0]);
  assert.equal(t.calls.length, 5, "the innings end retries on the backoff alone");
  assert.equal(t.calls[4].body?.match?.n, 3);
});

test("engine: slow retries after half a window; stale resends past the server's rev", async () => {
  const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) } });
  t.edit("m1", 1);
  await fail(t.calls[0], 429, { error: "slow" });
  await t.advance(LIVE_SEND_EVERY_MS / 2 - 1);
  assert.equal(t.calls.length, 1);
  await t.advance(1);
  assert.equal(t.calls.length, 2);
  const serverRev = T0 + 1_000_000;
  await fail(t.calls[1], 409, { error: "stale", rev: serverRev });
  assert.equal(t.links.m1.rev, serverRev + 1);
  await t.advance(600);
  assert.equal(t.calls.length, 3);
  assert.equal(t.calls[2].body?.rev, serverRev + 1);
  assert.equal(t.calls[2].body?.match?.n, 1, "the latest local match");
});

test("engine: gone turns the link off here and stops sending", async () => {
  const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) } });
  t.edit("m1", 1);
  await fail(t.calls[0], 410, { error: "gone" });
  assert.equal(t.links.m1.on, false);
  assert.equal(t.links.m1.stopped, "gone");
  t.edit("m1", 2);
  t.sync.wake();
  await t.advance(60_000);
  assert.equal(t.calls.length, 1);
  assert.equal(t.sync.snapshot().net.m1.fault, "gone");
});

test("engine: bad halts sending for the visit", async () => {
  const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) } });
  t.edit("m1", 1);
  await fail(t.calls[0], 400, { error: "bad" });
  t.edit("m1", 2);
  await t.advance(60_000);
  assert.equal(t.calls.length, 1);
  assert.equal(t.links.m1.on, true);
});

test("engine: flush sends with keepalive once, and only what is not already out", async () => {
  const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) } });
  t.edit("m1", 1);
  t.sync.flushAll(false);
  assert.equal(t.calls.length, 1, "the same rev is already out");
  await ok(t.calls[0]);
  await t.advance(500);
  t.edit("m1", 2);
  assert.equal(t.calls.length, 1, "inside the window: trailing send queued");
  t.sync.flushAll(false);
  assert.equal(t.calls.length, 2);
  assert.equal(t.calls[1].keepalive, true);
  assert.equal(t.calls[1].body?.match?.n, 2);
  t.sync.flushAll(true);
  assert.equal(t.calls.length, 2, "one keepalive at a time");
  await ok(t.calls[1]);
  await t.advance(10_000);
  assert.equal(t.calls.length, 2, "the flush replaced the trailing send");

  // Too big for keepalive: left for the next visit.
  t.edit("m1", 3);
  await ok(t.calls[2]);
  await t.advance(100);
  t.matches.m1 = { n: 4, pad: "x".repeat(LIVE_KEEPALIVE_MAX_BYTES) } as { n: number };
  t.sync.changed("m1", LIVE1);
  t.sync.flushAll(true);
  assert.ok(t.calls.slice(3).every((c) => !c.keepalive));
});

test("engine: pagehide flushes even when the same rev is out", async () => {
  const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) } });
  t.edit("m1", 1);
  t.sync.flushAll(true);
  assert.equal(t.calls.length, 2);
  assert.equal(t.calls[1].keepalive, true);
  assert.equal(t.calls[1].body?.rev, t.calls[0].body?.rev);
});

test("engine: mount sends what the last visit left", async () => {
  const t = rig({ links: { m1: link({ rev: T0 + 5, sentRev: T0 }), m2: link({ code: "zzzzzzzz9999", rev: T0, sentRev: T0 }) }, matches: { m1: { n: 7 }, m2: { n: 8 } } });
  t.sync.wake();
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].body?.match?.n, 7);
});

test("engine: start mints a code, saves the link and sends", async () => {
  const t = rig({ matches: { m1: { n: 1 } } });
  const started = t.sync.start("m1");
  assert.equal(t.sync.snapshot().net.m1.mode, "starting");
  assert.equal(t.calls[0].method, "POST");
  assert.equal(t.calls[0].url, "/api/live/new");
  await fail(t.calls[0], 200, { code: CODE });
  assert.equal(await started, null);
  assert.deepEqual(t.links.m1, { code: CODE, secret: SECRET, on: true, rev: T0, sentRev: 0, createdAt: T0 });
  assert.equal(t.calls[1].method, "PUT");
  assert.equal(t.calls[1].body?.rev, T0);

  const t2 = rig({ matches: { m1: { n: 1 } } });
  const failed = t2.sync.start("m1");
  await drop(t2.calls[0]);
  assert.equal(await failed, "offline");
  assert.equal(t2.links.m1, undefined);
  assert.equal(syncState(null, t2.sync.snapshot().net.m1), "error");
});

test("engine: stop turns the link off once the server has it", async () => {
  const t = rig({ links: { m1: link({ rev: T0, sentRev: T0 }) }, matches: { m1: { n: 1 } } });
  const first = t.sync.stop("m1");
  await drop(t.calls[0]);
  assert.equal(await first, false);
  assert.equal(t.links.m1.on, true, "still on: say so and let them try again");
  assert.equal(t.sync.snapshot().net.m1.fault, "not_off");

  const second = t.sync.stop("m1");
  assert.equal(t.calls[1].method, "DELETE");
  assert.deepEqual(t.calls[1].body, { secret: SECRET });
  await ok(t.calls[1]);
  assert.equal(await second, true);
  assert.deepEqual([t.links.m1.on, t.links.m1.stopped], [false, "off"]);
  t.edit("m1", 2);
  assert.equal(t.calls.length, 2, "no sends once off");
});

test("engine: move hands the link to the next match", async () => {
  const t = rig({ links: { m1: link({ rev: T0 + 10, sentRev: T0 + 10 }) } });
  t.edit("m2", 1);
  assert.equal(t.calls.length, 0, "m2 has no link yet");
  assert.equal(t.sync.move("m1", "m2"), true);
  assert.equal(t.links.m1, undefined);
  assert.equal(t.links.m2.code, CODE);
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].body?.match?.n, 1);
  assert.ok((t.calls[0].body?.rev ?? 0) > T0 + 10, "past the old match's rev");
  assert.equal(t.sync.move("m1", "m3"), false);
});

test("engine: deleting a match turns its link off, live or done", async () => {
  const t = rig({ links: { m1: link({ rev: T0, sentRev: T0 }), m2: link({ code: CODE2, rev: T0, sentRev: T0 }) }, matches: { m1: { n: 1 }, m2: { n: 2 } } });
  t.sync.remove("m1");
  await tickOver();
  assert.equal(t.calls[0].method, "DELETE");
  assert.equal(t.calls[0].keepalive, true);
  assert.equal(t.links.m1.stopped, "off", "kept until the server has the stop");
  await drop(t.calls[0]);
  assert.ok(t.links.m1, "network error: still kept");
  t.sync.wake();
  await tickOver();
  const retry = t.calls.find((c, i) => i > 0 && c.method === "DELETE");
  assert.ok(retry, "tried again on wake");
  await ok(retry);
  assert.equal(t.links.m1, undefined);

  // m2 is done, with its last ball still out: nothing here could turn its link off once the match is gone.
  t.edit("m2", 3, DONE2);
  const lead = t.calls[t.calls.length - 1];
  assert.deepEqual([lead.method, lead.body?.match?.n], ["PUT", 3]);
  const before = t.calls.length;
  t.sync.remove("m2");
  assert.equal(t.links.m2.stopped, "off", "kept until the server has the stop");
  await tickOver();
  assert.equal(t.calls.length, before, "not while its last ball is out");
  await ok(lead);
  const stop = t.calls[before];
  assert.deepEqual([stop?.method, stop?.keepalive, stop?.url, stop?.body], ["DELETE", true, `/api/live/${CODE2}`, { secret: SECRET }]);
  await ok(stop);
  assert.equal(t.links.m2, undefined);
  assert.equal(t.calls.length, before + 1);
});

test("engine: an answer for a link that was turned off meanwhile is ignored", async () => {
  const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) } });
  t.edit("m1", 1);
  t.links.m1 = link({ code: "zzzzzzzz9999", rev: T0 + 1, sentRev: T0 + 1 });
  await fail(t.calls[0], 410, { error: "gone" });
  assert.equal(t.links.m1.on, true);
  assert.equal(t.links.m1.code, "zzzzzzzz9999");
});

test("engine: limit or too_big once the server has taken writes: sending stops, the link stays on and still turns off", async () => {
  for (const [status, error] of [
    [429, "limit"],
    [413, "too_big"],
  ] as const) {
    const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) } });
    t.edit("m1", 1);
    await fail(t.calls[0], status, { error });
    const info = liveInfo(t.links.m1, t.sync.snapshot().net.m1);
    assert.deepEqual([info.on, info.state, info.fault, info.link?.stopped], [true, "error", error, undefined], error);
    t.edit("m1", 2);
    t.sync.wake();
    await t.advance(60_000);
    assert.equal(t.calls.length, 1, "nothing more is sent");

    const off = t.sync.stop("m1");
    await tickOver();
    assert.deepEqual([t.calls[1]?.method, t.calls[1]?.body], ["DELETE", { secret: SECRET }], "the old card can still come down");
    await ok(t.calls[1]);
    assert.equal(await off, true);
    const after = liveInfo(t.links.m1, t.sync.snapshot().net.m1);
    assert.deepEqual([after.link?.on, after.link?.stopped, after.state, after.fault, pillTone(after)], [false, "off", "off", null, null]);
  }
});

test("engine: stop waits for every PUT that is out, keepalive ones too, before the DELETE", async () => {
  // The first PUT, which creates the link: a DELETE that got there first would find nothing, and the PUT would then make it.
  const t = rig({ links: { m1: link() }, matches: { m1: { n: 1 } } });
  t.sync.wake();
  t.sync.flushAll(true);
  assert.deepEqual(
    t.calls.map((c) => [c.method, c.keepalive]),
    [
      ["PUT", false],
      ["PUT", true],
    ],
  );
  const off = t.sync.stop("m1");
  assert.equal(t.sync.snapshot().net.m1.mode, "stopping");
  await tickOver();
  assert.equal(t.calls.length, 2, "no DELETE while a PUT is out");
  await ok(t.calls[0]);
  assert.equal(t.calls.length, 2, "nor while the keepalive one is");
  await ok(t.calls[1]);
  assert.equal(t.calls[2]?.method, "DELETE");
  await ok(t.calls[2]);
  assert.equal(await off, true);
  assert.deepEqual([t.links.m1.on, t.links.m1.stopped], [false, "off"]);

  // The PUT that was out came back gone: off already, nothing to tell the server.
  const t2 = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) } });
  t2.edit("m1", 1);
  const off2 = t2.sync.stop("m1");
  await fail(t2.calls[0], 410, { error: "gone" });
  assert.equal(await off2, true);
  assert.equal(t2.calls.length, 1);
  const info = liveInfo(t2.links.m1, t2.sync.snapshot().net.m1);
  assert.deepEqual([info.link?.stopped, info.state, info.fault, pillTone(info)], ["off", "off", null, null]);
});

test("engine: a late gone for a link turned off meanwhile leaves it off, with no pill", async () => {
  const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) } });
  // A second tab on the same storage turns the link off while this tab's PUT is out.
  const other = createLiveSync(t.io);
  t.edit("m1", 1);
  const off = other.stop("m1");
  await tickOver();
  assert.equal(t.calls[1]?.method, "DELETE");
  await ok(t.calls[1]);
  assert.equal(await off, true);
  await fail(t.calls[0], 410, { error: "gone" });
  const info = liveInfo(t.links.m1, t.sync.snapshot().net.m1);
  assert.deepEqual([info.link?.on, info.link?.stopped, info.state, info.fault, pillTone(info)], [false, "off", "off", null, null]);
});

test("engine: a link turned on again while the old one's PUT is out sends its first update once that PUT is back", async () => {
  const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) } });
  t.edit("m1", 1);
  t.sync.flushAll(true);
  // The keepalive one finds the link expired; the page's own PUT is still out.
  await fail(t.calls[1], 410, { error: "gone" });
  assert.equal(t.links.m1.stopped, "gone");
  const on = t.sync.start("m1");
  await fail(t.calls[2], 200, { code: CODE2 });
  assert.equal(await on, null);
  assert.equal(t.calls.length, 3, "one request per match at a time");
  await drop(t.calls[0]);
  await t.advance(1000);
  const first = t.calls[3];
  assert.deepEqual([first?.method, first?.url, first?.body?.rev], ["PUT", `/api/live/${CODE2}`, t.links.m1.rev]);
  await ok(first);
  assert.equal(liveInfo(t.links.m1, t.sync.snapshot().net.m1).state, "synced");
});

test("engine: busy backs off on the retry steps and keeps the link on", async () => {
  // The first send, the one that makes the link: the site-wide cap on new links answers busy.
  const t = rig({ links: { m1: link({ rev: T0 - 1 }) } });
  t.edit("m1", 1);
  await fail(t.calls[0], 503, { error: "busy" });
  const info = liveInfo(t.links.m1, t.sync.snapshot().net.m1);
  assert.deepEqual([info.on, info.state, info.fault, pillTone(info)], [true, "sending", "busy", "amber"]);
  await t.advance(LIVE_RETRY_MS[0] - 1);
  assert.equal(t.calls.length, 1);
  await t.advance(1);
  assert.equal(t.calls.length, 2, "retry after 2 s");
  await fail(t.calls[1], 503, { error: "busy" });
  await t.advance(LIVE_RETRY_MS[1] - 1);
  assert.equal(t.calls.length, 2, "then 4 s");
  await t.advance(1);
  assert.equal(t.calls.length, 3);
  await ok(t.calls[2]);
  const after = liveInfo(t.links.m1, t.sync.snapshot().net.m1);
  assert.deepEqual([after.on, after.state, after.fault], [true, "synced", null]);
});

test("engine: a match deleted while its turn-off waits for a PUT still gets the DELETE", async () => {
  const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) } });
  t.edit("m1", 1);
  const off = t.sync.stop("m1");
  t.sync.remove("m1");
  await ok(t.calls[0]);
  assert.equal(t.calls[1]?.method, "DELETE");
  await ok(t.calls[1]);
  assert.equal(await off, true);
  assert.equal(t.links.m1, undefined, "dropped with the match");
  assert.equal(t.calls.length, 2);
});

test("engine: a turn-off is saved before it waits, so a killed tab still turns the link off on the next visit", async () => {
  const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) } });
  t.edit("m1", 1);
  void t.sync.stop("m1");
  await tickOver();
  assert.deepEqual([t.links.m1.on, t.links.m1.stopped], [true, "off"], "pending before the PUT is back");
  assert.equal(t.calls.length, 1, "no DELETE yet");
  // The tab dies here. Next visit: a fresh engine on what was saved.
  const next = rig({ links: JSON.parse(JSON.stringify(t.links)), matches: { m1: { n: 1 } } });
  next.sync.wake();
  assert.deepEqual(
    next.calls.map((c) => c.method),
    ["DELETE"],
    "no PUT for a link being turned off",
  );
  await ok(next.calls[0]);
  assert.equal(next.links.m1, undefined);
});

test("engine: a turn-off the server did not get puts the link back on, to try again", async () => {
  const t = rig({ links: { m1: link({ rev: T0, sentRev: T0 }) } });
  const off = t.sync.stop("m1");
  await tickOver();
  assert.equal(t.calls[0]?.method, "DELETE");
  await fail(t.calls[0], 503, { error: "unavailable" });
  assert.equal(await off, false);
  assert.deepEqual([t.links.m1.on, t.links.m1.stopped], [true, undefined]);
  const info = liveInfo(t.links.m1, t.sync.snapshot().net.m1);
  assert.deepEqual([info.on, info.fault], [true, "not_off"]);
});
