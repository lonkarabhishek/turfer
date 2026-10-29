// Run with: npm run test:scorer (compiled with tsc to .test-out/scorer-ui, then node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Match } from "../../../lib/cricket/scoring";
import { LIVE_IDLE_CLOSE_MS, LIVE_KEEPALIVE_MAX_BYTES, LIVE_LINKS_KEY, LIVE_RETRY_MS, LIVE_SEND_EVERY_MS, type LiveLinkRecord } from "../../../lib/live/types";
import {
  browserIoFor,
  canKeepLink,
  createLiveSync,
  handleResult,
  idleHere,
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
  type LiveToken,
} from "./live";
import { askLiveLogin, liveReturn, takeLiveAsk } from "./liveLogin";
import { loadLinks, saveLink } from "./links";
import { MAX_SAVED, loadMatch, saveMatch, type MatchMeta } from "./storage";

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
  for (const e of ["slow", "forbidden", "gone", "limit", "busy", "too_big", "bad", "login", "unavailable"]) assert.equal(readReply(400, { error: e }).r, e);
  assert.equal(readReply(502, null).r, "unavailable");
  assert.equal(readReply(404, "<html>").r, "unavailable");
  assert.equal(readReply(400, { error: "nope" }).r, "unavailable");
  assert.equal(readReply(200, { ok: "yes" }).r, "unavailable");
  assert.equal(readReply(409, { error: "stale", rev: -1 }).rev, undefined);
  // gone with idle: the link closed after 2 hours without an update (20261029_live_idle_close.sql).
  assert.deepEqual(readReply(410, { error: "gone", idle: true }), { r: "gone", rev: undefined, idle: true });
  assert.deepEqual(readReply(410, { error: "gone" }), { r: "gone", rev: undefined });
  assert.deepEqual(readReply(410, { error: "gone", idle: "yes" }), { r: "gone", rev: undefined }, "only a true idle");
  assert.deepEqual(readReply(403, { error: "forbidden", idle: true }), { r: "forbidden", rev: undefined }, "idle only with gone");

  assert.deepEqual(readNew(200, { code: CODE }), { code: CODE });
  assert.deepEqual(readNew(200, { code: "SHORT" }), { fault: "unavailable" });
  assert.deepEqual(readNew(429, { error: "limit" }), { fault: "limit" });
  assert.deepEqual(readNew(503, { error: "unavailable" }), { fault: "unavailable" });
  assert.deepEqual(readNew(401, { error: "login" }), { fault: "login" });
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
  // Closed after 2 hours without an update: the server still shows its last score, so the link stays on, to be turned off, and says so.
  const closed = handleResult(l, T0 + 10, { r: "gone", idle: true }, 0, true);
  assert.deepEqual([closed.link.on, closed.link.stopped, closed.fault, closed.halt, closed.wait], [true, "closed", "closed", false, 0]);
  assert.deepEqual([closed.link.code, closed.link.secret], [l.code, l.secret], "its secret is kept: it is the only way to clear it");
  assert.equal(closed.link.rev, l.rev, "the match itself is untouched: scoring carries on here");

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

  // login: nothing was written. The link stays on with every edit kept; sending waits for a login.
  const login = handleResult(l, T0 + 10, { r: "login" }, 2, true);
  assert.deepEqual([login.link, login.fault, login.halt, login.wait], [l, "login", true, 0]);
  const loginInfo = liveInfo(l, net({ halted: true, fault: "login" }));
  assert.deepEqual([loginInfo.on, loginInfo.state, loginInfo.fault, pillTone(loginInfo)], [true, "error", "login", "red"]);

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
  // After a reload the stored reason still says the link closed after 2 hours, and that it can still be turned off.
  const shut = liveInfo(link({ rev: T0, sentRev: T0, stopped: "closed" }), undefined);
  assert.deepEqual([shut.on, shut.closed, shut.state, shut.fault, pillTone(shut)], [false, true, "error", "closed", "red"]);
  assert.equal(syncState(link({ rev: T0, sentRev: T0, stopped: "closed" }), undefined), "error", "not synced: it takes no more updates");
  assert.equal(liveInfo(link({ stopped: "closed" }), net({ fault: "not_off" })).fault, "not_off", "a turn-off that did not get through says so");
  assert.equal(liveInfo(link(), undefined).closed, false);

  // By this phone's clock, 2 hours after the server's last ok: closed while the match is in play, not once it is finished.
  const quiet = link({ rev: T0, sentRev: T0, okAt: T0 + 2000 });
  const at = (now: number, inPlay: boolean) => liveInfo(quiet, undefined, { now, inPlay });
  assert.deepEqual([at(T0 + 2000 + LIVE_IDLE_CLOSE_MS - 1, true).closed, at(T0 + 2000 + LIVE_IDLE_CLOSE_MS - 1, true).state], [false, "synced"]);
  const late = at(T0 + 2000 + LIVE_IDLE_CLOSE_MS, true);
  assert.deepEqual([late.on, late.closed, late.state, late.fault, pillTone(late)], [false, true, "error", "closed", "red"]);
  const final = at(T0 + 2000 + LIVE_IDLE_CLOSE_MS, false);
  assert.deepEqual([final.on, final.closed, final.state, final.fault], [true, false, "synced", null], "a finished match's result is still worth sharing");
  assert.equal(liveInfo(link({ sentRev: 0 }), undefined, { now: T0 + 10 * LIVE_IDLE_CLOSE_MS, inPlay: true }).closed, false, "nothing taken yet: not closed");
  assert.equal(liveInfo(link({ sentRev: T0, stopped: "off" }), undefined, { now: T0 + 10 * LIVE_IDLE_CLOSE_MS, inPlay: true }).closed, false, "being turned off");
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
  assert.equal(canKeepLink(link({ stopped: "closed" }), T0), false);
  assert.equal(canKeepLink(null, T0), false);
  // Not once 2 hours have passed since the server last took a write (a record without okAt: sentRev, that edit's time): it is closed.
  const last = link({ rev: T0 + 60_000, sentRev: T0 + 60_000 });
  assert.equal(canKeepLink(last, T0 + 60_000 + LIVE_IDLE_CLOSE_MS - 1), true);
  assert.equal(canKeepLink(last, T0 + 60_000 + LIVE_IDLE_CLOSE_MS), false);
  assert.equal(idleHere(last, T0 + 60_000 + LIVE_IDLE_CLOSE_MS), true);
  assert.equal(idleHere(link({ sentRev: 0 }), T0 + 10 * LIVE_IDLE_CLOSE_MS), false, "nothing taken yet: not closed for want of updates");
  // okAt, when the server said ok, wins: an edit made offline and sent later is when the server's 2 hours start.
  const sentLate = link({ rev: T0 + 60_000, sentRev: T0 + 60_000, okAt: T0 + 3_600_000 });
  assert.equal(idleHere(sentLate, T0 + 60_000 + LIVE_IDLE_CLOSE_MS), false);
  assert.equal(idleHere(sentLate, T0 + 3_600_000 + LIVE_IDLE_CLOSE_MS), true);
});

test("a game reminder's venue and from=game are read, and left out of the query", () => {
  const none = { sport: null, name: "" };
  assert.deepEqual(readReminder("?venue=%20Turf%20Park%20&from=game"), { venue: "Turf Park", fromGame: true, ...none, rest: "" });
  assert.deepEqual(readReminder("?utm_source=wa&venue=X&from=game&tab=1"), { venue: "X", fromGame: true, ...none, rest: "?utm_source=wa&tab=1" });
  assert.deepEqual(readReminder("?from=other"), { venue: "", fromGame: false, ...none, rest: "" });
  assert.deepEqual(readReminder(""), { venue: "", fromGame: false, ...none, rest: "" });
  assert.equal(readReminder(`?venue=${"v".repeat(60)}`).venue.length, 48);
});

test("a Live Scoreboard reminder's sport and name are read, and left out of the query too", () => {
  assert.deepEqual(readReminder("?sport=football&venue=Kick%20Off&from=game"), { venue: "Kick Off", fromGame: true, sport: "football", name: "", rest: "" });
  assert.deepEqual(readReminder("?sport=other&name=%20Ultimate%20%20Frisbee%20&from=game&utm_source=wa"), {
    venue: "",
    fromGame: true,
    sport: "other",
    name: "Ultimate Frisbee",
    rest: "?utm_source=wa",
  });
  assert.equal(readReminder("?sport=Table-Tennis").sport, "table-tennis");
  // Not a board sport: no sport, and still out of the address, so a reload resumes the match.
  assert.deepEqual(readReminder("?sport=cricket&tab=2"), { venue: "", fromGame: false, sport: null, name: "", rest: "?tab=2" });
  assert.equal(readReminder("?sport=").sport, null);
  assert.equal(readReminder(`?name=${"n".repeat(50)}`).name.length, 32);
  assert.equal(readReminder("?name=a%0Ab%09c").name, "a b c");
});

test("the sync reads each match through the page's loader", () => {
  assert.equal(browserIoFor(loadMatch).match, loadMatch);
  const seen: string[] = [];
  const io = browserIoFor((id) => {
    seen.push(id);
    return { id, sentAt: 5 };
  });
  assert.deepEqual(io.match("b1"), { id: "b1", sentAt: 5 });
  assert.deepEqual(seen, ["b1"]);
  // Everything else is the browser's own.
  assert.equal(io.links, browserIoFor(loadMatch).links);
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
  body: { secret?: string; rev?: number; match?: { n: number; sentAt?: number } } | null;
  keepalive: boolean;
  /** The sign-in it carried (Authorization: Bearer), or null. */
  token: string | null;
  answer: (status: number, body: unknown) => Promise<void>;
  drop: () => Promise<void>;
};

const tickOver = () => new Promise<void>((r) => setImmediate(r));

function rig(start: { links?: Record<string, LiveLinkRecord>; matches?: Record<string, { n: number }>; load?: (id: string, now: number) => unknown; token?: () => Promise<LiveToken> } = {}) {
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
    token: start.token,
    request: (method, url, body, keepalive, token) =>
      new Promise((resolve, reject) => {
        calls.push({
          method,
          url,
          body: body === null ? null : JSON.parse(body),
          keepalive,
          token: token ?? null,
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
    match: (id) => (start.load ? start.load(id, now) : (matches[id] ?? null)),
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
  const edit = (id: string, n: number, shape: { status: "live" | "done"; innings: readonly unknown[] } = LIVE1) => {
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

test("engine: a board's loader runs for every PUT, so a retry carries a fresh sentAt", async () => {
  const boards: Record<string, { n: number }> = {};
  // As LiveScoreboard's loader: the stored board, stamped with the time of this send.
  const t = rig({ links: { b1: link({ rev: T0 - 1, sentRev: T0 - 1 }) }, load: (id, now) => (boards[id] ? { ...boards[id], sentAt: now } : null) });
  boards.b1 = { n: 1 };
  t.sync.changed("b1", { status: "live", innings: [null] });
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].body?.match?.sentAt, T0);
  await drop(t.calls[0]);
  await t.advance(LIVE_RETRY_MS[0]);
  assert.equal(t.calls.length, 2);
  assert.equal(t.calls[1].body?.match?.sentAt, T0 + LIVE_RETRY_MS[0]);
  await ok(t.calls[1]);
  // A finished period is a new "innings" of the board's shape: it skips the throttle like an innings end.
  await t.advance(700);
  boards.b1 = { n: 2 };
  t.sync.changed("b1", { status: "live", innings: [null, null] });
  assert.equal(t.calls.length, 3);
  // A loader that finds nothing (the board was deleted): nothing is sent.
  await ok(t.calls[2]);
  delete boards.b1;
  await t.advance(3000);
  t.sync.changed("b1", { status: "live", innings: [null, null] });
  await t.advance(10_000);
  assert.equal(t.calls.length, 3);
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

/** A link whose last write the server took at T0 - 1, now closed: the rig's clock past 2 hours, and a write answered gone (idle). */
async function closedRig() {
  const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) }, matches: { m1: { n: 0 } } });
  await t.advance(LIVE_IDLE_CLOSE_MS);
  t.edit("m1", 1);
  await fail(t.calls[0], 410, { error: "gone", idle: true });
  return t;
}

test("engine: gone with idle stops sending and says it closed; the link stays, to be turned off or replaced", async () => {
  const t = await closedRig();
  assert.deepEqual([t.links.m1.on, t.links.m1.stopped, t.links.m1.code, t.links.m1.secret], [true, "closed", CODE, SECRET]);
  const info = liveInfo(t.links.m1, t.sync.snapshot().net.m1);
  assert.deepEqual([info.on, info.closed, info.state, info.fault, pillTone(info)], [false, true, "error", "closed", "red"]);
  // Scoring carries on here; nothing more goes to the closed link, and it is not offered to the next match.
  t.edit("m1", 2);
  t.sync.wake();
  t.sync.flushAll(true);
  await t.advance(60_000);
  assert.equal(t.calls.length, 1);
  assert.equal(t.sync.move("m1", "m2"), false);
  assert.equal(canKeepLink(t.links.m1, T0), false);
  // Start a new link: the closed one is turned off first (its secret is the only way to clear its last score),
  // then a new code carries the latest match, and the reason clears.
  const started = t.sync.start("m1");
  await tickOver();
  assert.deepEqual([t.calls[1]?.method, t.calls[1]?.url, t.calls[1]?.body], ["DELETE", `/api/live/${CODE}`, { secret: SECRET }]);
  await ok(t.calls[1]);
  await fail(t.calls[2], 200, { code: CODE2 });
  assert.equal(t.calls[2].url, "/api/live/new");
  assert.equal(await started, null);
  assert.deepEqual([t.links.m1.code, t.links.m1.on, t.links.m1.stopped], [CODE2, true, undefined]);
  assert.equal(t.calls[3].method, "PUT");
  assert.equal(t.calls[3].url, `/api/live/${CODE2}`);
  assert.equal(t.calls[3].body?.match?.n, 2);
  await ok(t.calls[3]);
  const after = liveInfo(t.links.m1, t.sync.snapshot().net.m1);
  assert.deepEqual([after.state, after.fault, after.closed], ["synced", null, false]);
});

test("engine: a closed link still turns off, which clears its last score", async () => {
  const t = await closedRig();
  const off = t.sync.stop("m1");
  await tickOver();
  assert.deepEqual([t.calls[1]?.method, t.calls[1]?.url, t.calls[1]?.body], ["DELETE", `/api/live/${CODE}`, { secret: SECRET }]);
  await ok(t.calls[1]);
  assert.equal(await off, true);
  const info = liveInfo(t.links.m1, t.sync.snapshot().net.m1);
  assert.deepEqual([info.link?.on, info.link?.stopped, info.state, info.fault, info.closed, pillTone(info)], [false, "off", "off", null, false, null]);

  // Not through: still closed, secret and all, to try again.
  const t2 = await closedRig();
  const off2 = t2.sync.stop("m1");
  await tickOver();
  await drop(t2.calls[1]);
  assert.equal(await off2, false);
  assert.deepEqual([t2.links.m1.on, t2.links.m1.stopped, t2.links.m1.secret], [true, "closed", SECRET]);
  const shown = liveInfo(t2.links.m1, t2.sync.snapshot().net.m1);
  assert.deepEqual([shown.closed, shown.fault], [true, "not_off"]);
  await t2.advance(60_000);
  assert.equal(t2.calls.length, 2, "no PUT after a failed turn-off of a closed link");
});

test("engine: deleting a match with a closed link sends the DELETE, and drops the record once the server has it", async () => {
  const t = await closedRig();
  t.sync.remove("m1");
  assert.deepEqual([t.links.m1.on, t.links.m1.stopped], [true, "off"], "kept until the server has the stop");
  await tickOver();
  assert.deepEqual([t.calls[1]?.method, t.calls[1]?.keepalive, t.calls[1]?.body], ["DELETE", true, { secret: SECRET }]);
  await drop(t.calls[1]);
  assert.ok(t.links.m1, "network error: still kept");
  t.sync.wake();
  await tickOver();
  assert.equal(t.calls[2]?.method, "DELETE", "tried again on wake");
  await ok(t.calls[2]);
  assert.equal(t.links.m1, undefined);
});

test("engine: a new link for a closed one waits for the old one to turn off, and keeps it if that fails", async () => {
  const t = await closedRig();
  const started = t.sync.start("m1");
  await tickOver();
  assert.equal(t.calls[1]?.method, "DELETE");
  await fail(t.calls[1], 503, { error: "unavailable" });
  assert.equal(await started, "not_off");
  assert.equal(t.calls.length, 2, "no new code while the old link still shows its score");
  assert.deepEqual([t.links.m1.code, t.links.m1.on, t.links.m1.stopped, t.links.m1.secret], [CODE, true, "closed", SECRET]);
});

test("engine: a PUT out while turning off comes back gone (idle): the DELETE still goes", async () => {
  const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) } });
  await t.advance(LIVE_IDLE_CLOSE_MS);
  t.edit("m1", 1);
  const off = t.sync.stop("m1");
  await fail(t.calls[0], 410, { error: "gone", idle: true });
  await tickOver();
  assert.deepEqual([t.calls[1]?.method, t.calls[1]?.body], ["DELETE", { secret: SECRET }], "the server still shows its last score");
  await ok(t.calls[1]);
  assert.equal(await off, true);
  assert.deepEqual([t.links.m1.on, t.links.m1.stopped], [false, "off"]);

  // The same during a delete of the match (finishStop).
  const t2 = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) } });
  await t2.advance(LIVE_IDLE_CLOSE_MS);
  t2.edit("m1", 1);
  t2.sync.remove("m1");
  await fail(t2.calls[0], 410, { error: "gone", idle: true });
  await tickOver();
  assert.equal(t2.calls[1]?.method, "DELETE");
  await ok(t2.calls[1]);
  assert.equal(t2.links.m1, undefined);
});

test("engine: an ok notes when the server took it (okAt), and the clock's closed follows it", async () => {
  const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) } });
  t.edit("m1", 1);
  await t.advance(5000);
  await ok(t.calls[0]);
  assert.equal(t.links.m1.okAt, T0 + 5000);
  const snap = (dt: number) => liveInfo(t.links.m1, t.sync.snapshot().net.m1, { now: T0 + 5000 + dt, inPlay: true });
  assert.equal(snap(LIVE_IDLE_CLOSE_MS - 1).closed, false);
  assert.equal(snap(LIVE_IDLE_CLOSE_MS).closed, true);
  assert.equal(t.sync.snapshot().at, T0 + 5000, "the snapshot says when it was taken");
  // The clock's closed is a hint: the next edit still goes, and an ok puts the link back.
  await t.advance(LIVE_IDLE_CLOSE_MS);
  t.edit("m1", 2);
  assert.equal(t.calls[1]?.method, "PUT");
  await ok(t.calls[1]);
  assert.equal(liveInfo(t.links.m1, t.sync.snapshot().net.m1, { now: t.sync.snapshot().at, inPlay: true }).closed, false);
  // Start a new link while it is closed by the clock only: the old one is turned off first, as for one the server closed.
  await t.advance(LIVE_IDLE_CLOSE_MS);
  const started = t.sync.start("m1");
  await tickOver();
  assert.equal(t.calls[2]?.method, "DELETE");
  await ok(t.calls[2]);
  assert.equal(t.calls[3]?.url, "/api/live/new");
  await fail(t.calls[3], 200, { code: CODE2 });
  assert.equal(await started, null);
  assert.equal(t.links.m1.code, CODE2);
  // A link that is not closed is left alone.
  assert.equal(await t.sync.start("m1"), null);
  assert.equal(t.calls.filter((c) => c.method === "POST").length, 1);
});

test("a link closed after 2 hours is remembered as closed across visits", () => {
  const store = new Map<string, string>();
  const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  Object.defineProperty(globalThis, "localStorage", { value: ls, configurable: true });
  try {
    saveLink("m1", link({ stopped: "closed", okAt: T0 + 5 }));
    assert.deepEqual([loadLinks().links.m1.on, loadLinks().links.m1.stopped, loadLinks().links.m1.okAt], [true, "closed", T0 + 5]);
    store.set(LIVE_LINKS_KEY, JSON.stringify({ v: 1, links: { m3: { ...link(), okAt: "soon" } } }));
    assert.equal(loadLinks().links.m3.okAt, undefined, "a broken okAt is dropped, the link kept");
    store.set(LIVE_LINKS_KEY, JSON.stringify({ v: 1, links: { m2: { ...link({ on: false }), stopped: "napping" } } }));
    assert.equal(loadLinks().links.m2.stopped, undefined, "an unknown reason is dropped");
  } finally {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
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

test("live link login: the ask survives the trip and is read once, by its own tool, while fresh", () => {
  const store = new Map<string, string>();
  const ss = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  Object.defineProperty(globalThis, "sessionStorage", { value: ss, configurable: true });
  let went = "";
  Object.defineProperty(globalThis, "window", { value: { location: { href: "https://www.tapturf.in/tools/live-scoreboard?tab=2" } }, configurable: true });
  Object.defineProperty(globalThis.window.location, "href", { get: () => "https://www.tapturf.in/tools/live-scoreboard?tab=2", set: (v: string) => void (went = v), configurable: true });
  askLiveLogin("board", "b123", 1_000);
  assert.equal(went, `/login?next=${encodeURIComponent("/tools/live-scoreboard?tab=2&live=1")}&via=live`);
  assert.deepEqual(liveReturn("?tab=2&live=1"), { returning: true, rest: "?tab=2" });
  assert.deepEqual(liveReturn("?live=1"), { returning: true, rest: "" });
  assert.deepEqual(liveReturn("?tab=2"), { returning: false, rest: "?tab=2" });
  assert.equal(takeLiveAsk("cricket", 2_000), null, "another tool's ask is not taken...");
  assert.equal(takeLiveAsk("board", 2_000), null, "...and is used up all the same");
  askLiveLogin("board", "b123", 1_000);
  assert.equal(takeLiveAsk("board", 1_000 + 31 * 60_000), null, "a stale ask is ignored");
  askLiveLogin("board", "b123", 1_000);
  assert.equal(takeLiveAsk("board", 5_000), "b123");
  assert.equal(takeLiveAsk("board", 5_000), null, "read once");
  // Asked by the server to log in again: the login page must not bounce a device that still looks signed in.
  askLiveLogin("cricket", "m9", 1_000, true);
  assert.equal(went, `/login?next=${encodeURIComponent("/tools/live-scoreboard?tab=2&live=1")}&via=live&again=1`);
  assert.equal(takeLiveAsk("cricket", 2_000), "m9");
});

/* ------------------------------------------------------------------ */
/* The sign-in on every send (lib/live/gate.ts checks it)              */
/* ------------------------------------------------------------------ */

/** A sign-in that answers from a list, the last one for good, counting reads. */
function tokens(...list: LiveToken[]) {
  const reads = { n: 0 };
  const left = [...list];
  return { reads, get: async (): Promise<LiveToken> => (reads.n++, left.length > 1 ? left.shift()! : left[0]), set: (...next: LiveToken[]) => left.splice(0, left.length, ...next) };
}
const LOGIN = { error: "login" };

test("engine: the code and every send carry the sign-in, read fresh for each", async () => {
  const tk = tokens({ token: "t1" }, { token: "t2" }, { token: "t3" });
  const t = rig({ matches: { m1: { n: 1 } }, token: tk.get });
  const started = t.sync.start("m1");
  await tickOver();
  assert.deepEqual([t.calls[0].method, t.calls[0].token], ["POST", "t1"], "the mint asks with the sign-in");
  await fail(t.calls[0], 200, { code: CODE });
  assert.equal(await started, null);
  await tickOver();
  assert.deepEqual([t.calls[1].method, t.calls[1].token], ["PUT", "t2"], "the first send reads it again");
  await ok(t.calls[1]);
  await t.advance(LIVE_SEND_EVERY_MS);
  t.edit("m1", 2);
  await tickOver();
  assert.deepEqual([t.calls[2].token, tk.reads.n], ["t3", 3], "one read per send");
  await ok(t.calls[2]);
  assert.equal(liveInfo(t.links.m1, t.sync.snapshot().net.m1).state, "synced");
});

test("engine: a login answer is tried once more with a fresh token, and an expired one carries on unnoticed", async () => {
  const tk = tokens({ token: "expired" }, { token: "fresh" });
  const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) }, matches: { m1: { n: 1 } }, token: tk.get });
  t.edit("m1", 1);
  await tickOver();
  assert.equal(t.calls[0].token, "expired");
  await fail(t.calls[0], 401, LOGIN);
  assert.equal(t.calls.length, 1, "not inside the route's gap between two writes, which would answer slow");
  await t.advance(600);
  await tickOver();
  assert.deepEqual([t.calls.length, t.calls[1].token, t.calls[1].body?.rev], [2, "fresh", t.calls[0].body?.rev], "the same send, again, right after the gap");
  await ok(t.calls[1]);
  const info = liveInfo(t.links.m1, t.sync.snapshot().net.m1);
  assert.deepEqual([info.state, info.fault], ["synced", null], "the scorer sees nothing");
});

test("engine: a login that stands: scoring goes on here, the link stays on and waits, then resumes after the login", async () => {
  const tk = tokens({ token: "turned-down" });
  const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) }, matches: { m1: { n: 1 } }, token: tk.get });
  t.edit("m1", 1);
  await tickOver();
  await fail(t.calls[0], 401, LOGIN);
  await t.advance(600);
  await tickOver();
  await fail(t.calls[1], 401, LOGIN);
  assert.equal(t.calls.length, 2, "tried twice, no more");
  let info = liveInfo(t.links.m1, t.sync.snapshot().net.m1);
  assert.deepEqual([info.on, info.state, info.fault, pillTone(info)], [true, "error", "login", "red"]);
  // Balls go on being saved and counted; nothing is sent while it waits.
  for (let n = 2; n <= 6; n++) {
    await t.advance(3000);
    t.edit("m1", n);
  }
  await t.advance(120_000);
  assert.equal(t.calls.length, 2, "no sends while waiting for the login");
  assert.ok(t.links.m1.rev > t.links.m1.sentRev, "every ball kept to send");
  // Back from the login (or logged in again): the latest match goes at once.
  tk.set({ token: "new-login" });
  t.sync.resume("m1");
  await tickOver();
  assert.deepEqual([t.calls.length, t.calls[2].token, t.calls[2].body?.match?.n], [3, "new-login", 6]);
  await ok(t.calls[2]);
  info = liveInfo(t.links.m1, t.sync.snapshot().net.m1);
  assert.deepEqual([info.state, info.fault], ["synced", null]);
  // resume touches only a link waiting for a login.
  t.sync.resume("m1");
  assert.equal(t.calls.length, 3);
});

test("engine: signed out gets no second try; a sign-in that can't be read now is not sent as signed out", async () => {
  const out = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) }, matches: { m1: { n: 1 } }, token: tokens({ none: true }).get });
  out.edit("m1", 1);
  await tickOver();
  assert.equal(out.calls[0].token, null, "no sign-in: sent without (a link from before the check takes it)");
  await fail(out.calls[0], 401, LOGIN);
  assert.equal(out.calls.length, 1, "no token to try again with");
  assert.equal(out.sync.snapshot().net.m1.fault, "login");

  const tk = tokens({ unknown: true });
  const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) }, matches: { m1: { n: 1 } }, token: tk.get });
  t.edit("m1", 1);
  await tickOver();
  await tickOver();
  assert.equal(t.calls.length, 0, "nothing sent");
  assert.equal(liveInfo(t.links.m1, t.sync.snapshot().net.m1).state, "sending", "retried, no login asked for");
  tk.set({ token: "t1" });
  await t.advance(LIVE_RETRY_MS[0]);
  await tickOver();
  assert.deepEqual([t.calls.length, t.calls[0].token], [1, "t1"]);
});

test("engine: a flush leaves at once with the last token, no read in the way", async () => {
  const tk = tokens({ token: "t1" });
  const t = rig({ links: { m1: link({ rev: T0 - 1, sentRev: T0 - 1 }) }, matches: { m1: { n: 1 } }, token: tk.get });
  t.edit("m1", 1);
  await tickOver();
  await ok(t.calls[0]);
  t.edit("m1", 2);
  t.sync.flushAll(true);
  assert.deepEqual([t.calls.length, t.calls.at(-1)?.keepalive, t.calls.at(-1)?.token], [2, true, "t1"], "sent in the same tick as pagehide");
});

test("engine: a mint without an accepted sign-in says login and saves nothing; one that can't be read now does not ask", async () => {
  const t = rig({ matches: { m1: { n: 1 } }, token: tokens({ token: "turned-down" }).get });
  const started = t.sync.start("m1");
  await tickOver();
  await fail(t.calls[0], 401, LOGIN);
  assert.equal(await started, "login");
  assert.equal(t.links.m1, undefined);
  assert.equal(t.sync.snapshot().net.m1.fault, "login");

  const u = rig({ matches: { m1: { n: 1 } }, token: tokens({ unknown: true }).get });
  assert.equal(await u.sync.start("m1"), "unavailable");
  assert.equal(u.calls.length, 0);
});

test("engine: a stop needs no sign-in", async () => {
  const tk = tokens({ token: "t1" });
  const t = rig({ links: { m1: link({ rev: T0, sentRev: T0 }) }, matches: { m1: { n: 1 } }, token: tk.get });
  const off = t.sync.stop("m1");
  await tickOver();
  assert.deepEqual([t.calls[0].method, t.calls[0].token, tk.reads.n], ["DELETE", null, 0]);
  await ok(t.calls[0]);
  assert.equal(await off, true);
});
