import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, newMatch, newPlayerId, sanitizeMatch, type Match } from "../cricket/scoring";
import { applyBoard, deriveBoard, newBoard, sanitizeBoard } from "../board/index";
import type { Board, BoardEvent } from "../board/types";
import { isLiveBoard, sanitizeLive } from "./match";
import {
  LIVE_MIN_GAP_MS,
  LIVE_MINTS_PER_10_MIN,
  LIVE_WRITES_PER_MIN,
  createLiveLimiter,
  liveHttpStatus,
  liveIpHash,
  liveMatchToStore,
  liveResult,
  liveWriteKey,
  parsePutBody,
  parseStopBody,
  readLiveBody,
  toLiveRow,
} from "./server";
import { LIVE_MAX_MATCH_CHARS, LIVE_MAX_REV } from "./types";

const KEY = "k".repeat(64);
const SECRET = "0123456789abcdef".repeat(4);

const reqFrom = (xff?: string) => new Request("https://tapturf.in/api/live/x", { headers: xff === undefined ? {} : { "x-forwarded-for": xff } });
const hashOf = (xff?: string, key = KEY) => liveIpHash(reqFrom(xff), key);

test("ip hash: 32 hex, keyed, first x-forwarded-for hop only", () => {
  const h = hashOf("203.0.113.7");
  assert.match(h, /^[0-9a-f]{32}$/);
  assert.equal(hashOf("203.0.113.7, 10.0.0.1, 10.0.0.2"), h);
  assert.equal(hashOf(" 203.0.113.7 "), h);
  assert.notEqual(hashOf("10.0.0.1, 203.0.113.7"), h);
  assert.notEqual(hashOf("203.0.113.8"), h);
  assert.notEqual(hashOf("203.0.113.7", "other-key"), h);
});

test("ip hash: IPv4 with a port or mapped into IPv6 is the same client", () => {
  const h = hashOf("203.0.113.7");
  assert.equal(hashOf("203.0.113.7:51234"), h);
  assert.equal(hashOf("::ffff:203.0.113.7"), h);
  assert.equal(hashOf("::FFFF:cb00:7107"), h);
  assert.equal(hashOf("0:0:0:0:0:ffff:203.0.113.7"), h);
});

test("ip hash: IPv6 counts by /64, however the address is written", () => {
  const h = hashOf("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
  assert.equal(hashOf("2001:db8:1:2::1"), h);
  assert.equal(hashOf("2001:0db8:0001:0002:ffff:0:0:1"), h);
  assert.equal(hashOf("2001:DB8:1:2::"), h);
  assert.equal(hashOf("[2001:db8:1:2::5]:443"), h);
  assert.equal(hashOf("2001:db8:1:2::5%eth0"), h);
  assert.notEqual(hashOf("2001:db8:1:3::1"), h);
  // "::" in the first half fills the prefix with zeros.
  assert.equal(hashOf("2001:db8::1"), hashOf("2001:db8:0:0:1::"));
  assert.notEqual(hashOf("2001:db8::1"), hashOf("2001:db8:0:1::"));
  assert.equal(hashOf("::1"), hashOf("::2"));
});

test("ip hash: a missing or empty header is one shared bucket, not a crash", () => {
  const none = hashOf(undefined);
  assert.match(none, /^[0-9a-f]{32}$/);
  assert.equal(hashOf(""), none);
  assert.notEqual(hashOf("203.0.113.7"), none);
  // Unreadable IPv6 is hashed as written rather than lumped with others.
  assert.notEqual(hashOf("1:2:3::4::5"), hashOf("1:2:3::4::6"));
});

test("write key: unset or blank is off", () => {
  const before = process.env.LIVE_WRITE_KEY;
  try {
    delete process.env.LIVE_WRITE_KEY;
    assert.equal(liveWriteKey(), null);
    process.env.LIVE_WRITE_KEY = "  ";
    assert.equal(liveWriteKey(), null);
    process.env.LIVE_WRITE_KEY = ` ${KEY}\n`;
    assert.equal(liveWriteKey(), KEY);
  } finally {
    if (before === undefined) delete process.env.LIVE_WRITE_KEY;
    else process.env.LIVE_WRITE_KEY = before;
  }
});

test("results map to the HTTP statuses on LiveError", () => {
  const want: Record<string, number> = { ok: 200, stale: 409, slow: 429, forbidden: 403, gone: 410, limit: 429, busy: 503, too_big: 413, bad: 400, unavailable: 503 };
  for (const [r, status] of Object.entries(want)) assert.equal(liveHttpStatus(r), status, r);
  assert.equal(liveHttpStatus("toString"), 503);
  assert.equal(liveHttpStatus("weird"), 503);
});

test("an RPC result we do not know is treated as the database being down", () => {
  // busy (the site-wide cap) is passed on as itself, so the scorer keeps the link on and retries.
  for (const r of ["ok", "stale", "slow", "forbidden", "gone", "limit", "busy", "too_big", "bad"]) assert.equal(liveResult(r), r);
  for (const r of ["unavailable", "taken", "constructor", "", null, undefined, 1, { r: "ok" }]) assert.equal(liveResult(r), "unavailable", String(r));
});

test("PUT body: secret is 64 lowercase hex, rev a whole number from 1 to 2^52", () => {
  const match = { v: 1 };
  assert.deepEqual(parsePutBody({ secret: SECRET, match, rev: 1729000000000 }), { secret: SECRET, match, rev: 1729000000000 });
  assert.deepEqual(parsePutBody({ secret: SECRET, rev: 5 }), { secret: SECRET, match: undefined, rev: 5 });
  // The cap leaves room for the +1 a stop or an expiry adds, so a stored rev stays a safe integer.
  assert.equal(LIVE_MAX_REV, 2 ** 52);
  assert.equal(parsePutBody({ secret: SECRET, match, rev: LIVE_MAX_REV })?.rev, LIVE_MAX_REV);
  for (const bad of [
    null,
    "x",
    [],
    { secret: SECRET.toUpperCase(), match, rev: 1 },
    { secret: SECRET.slice(1), match, rev: 1 },
    { secret: 123, match, rev: 1 },
    { secret: SECRET, match, rev: 0 },
    { secret: SECRET, match, rev: -1 },
    { secret: SECRET, match, rev: 1.5 },
    { secret: SECRET, match, rev: "5" },
    { secret: SECRET, match, rev: LIVE_MAX_REV + 1 },
    { secret: SECRET, match, rev: Number.MAX_SAFE_INTEGER },
    { secret: SECRET, match, rev: Number.MAX_SAFE_INTEGER + 1 },
    { secret: SECRET, match, rev: NaN },
    { secret: SECRET, match },
  ]) {
    assert.equal(parsePutBody(bad), null, JSON.stringify(bad));
  }
});

test("row: any whole rev is read, even past MAX_SAFE_INTEGER; a bad status or time throws", () => {
  const at = "2026-10-20T10:00:00.123456+00:00";
  assert.deepEqual(toLiveRow({ match: { v: 1 }, rev: 7, status: "live", updated_at: at }), { match: { v: 1 }, rev: 7, status: "live", updated_at: "2026-10-20T10:00:00.123Z" });
  // A rev the database already holds must not make every read of the link fail.
  for (const rev of [Number.MAX_SAFE_INTEGER + 1, 2 ** 60]) assert.equal(toLiveRow({ match: null, rev, status: "stopped", updated_at: at }).rev, rev);
  assert.equal(toLiveRow({ rev: 3, status: "expired", updated_at: at }).match, null);
  for (const bad of [
    null,
    { rev: 1.5, status: "live", updated_at: at },
    { rev: "x", status: "live", updated_at: at },
    { rev: Infinity, status: "live", updated_at: at },
    { rev: 1, status: "waiting", updated_at: at },
    { rev: 1, status: "live", updated_at: "soon" },
    { rev: 1, status: "live" },
  ]) {
    assert.throws(() => toLiveRow(bad), /unexpected row/, JSON.stringify(bad));
  }
});

/** A match as the scorer's browser sends it: through JSON, like the PUT body. */
const sent = (m: Match): unknown => JSON.parse(JSON.stringify(m));

test("stored match: a renamed player is stored under the latest name only, roster and walk-in alike", () => {
  let m = newMatch({ teamA: "Kings", teamB: "Royals", players: { a: ["Rahul Sharma", "Amit Verma"], b: ["Bobby Deol"] } }, { id: "m1", now: 1 });
  const walkIn = newPlayerId(m, "a");
  const steps = [
    { type: "addPlayer", team: "a", player: walkIn, name: "Walk In Guy" },
    { type: "renamePlayer", team: "a", player: "a1", name: "R Sharma" },
    { type: "renamePlayer", team: "a", player: "a1", name: "Player 1" },
    { type: "renamePlayer", team: "a", player: walkIn, name: "Guest" },
  ] as const;
  for (const e of steps) {
    const next = apply(m, { ...e });
    assert.notEqual(next, m, `${e.type} ${e.name} applied`);
    m = next;
  }
  const out = liveMatchToStore(sent(m));
  assert.ok("match" in out, JSON.stringify(out));
  const json = JSON.stringify(out.match);
  for (const old of ["Rahul Sharma", "R Sharma", "Walk In Guy"]) assert.ok(!json.includes(old), `${old} is not stored`);
  for (const now of ["Player 1", "Guest", "Amit Verma", "Bobby Deol"]) assert.ok(json.includes(now), `${now} is stored`);
  assert.equal(out.status, "live");
  assert.equal(isLiveBoard(out.match), false);
  // The renames stay, so followers' history lines up with the scorer's.
  assert.equal((out.match as Match).events.filter((e) => e.type === "renamePlayer").length, 3);
  // The scorer's own match keeps what was typed.
  assert.ok(JSON.stringify(m).includes("Rahul Sharma"));
});

test("stored match: not a match is bad; size is measured after the names are folded", () => {
  assert.deepEqual(liveMatchToStore({ v: 2 }), { error: "bad" });
  assert.deepEqual(liveMatchToStore(null), { error: "bad" });
  // 2000 renames to short names, then one to a 40 character name: under
  // the cap as sent, over it once every rename says the long name.
  const base = newMatch({ players: { a: ["Ann"], b: ["Ben"] } }, { id: "m2", now: 1 });
  const events = Array.from({ length: 2000 }, (_, i) => ({ type: "renamePlayer", team: "a", player: "a1", name: `n${i}` }));
  events.push({ type: "renamePlayer", team: "a", player: "a1", name: "L".repeat(40) });
  const raw = { ...base, events };
  assert.ok(JSON.stringify(raw).length < LIVE_MAX_MATCH_CHARS, "under the cap as sent");
  assert.deepEqual(liveMatchToStore(raw), { error: "too_big" });
  // Half the renames, all short, is stored.
  const ok = liveMatchToStore({ ...base, events: events.slice(0, 1000) });
  assert.ok("match" in ok && JSON.stringify(ok.match).length <= LIVE_MAX_MATCH_CHARS);
});

/** Apply board events, failing the test on any refused one. */
function play(b: Board, ...events: BoardEvent[]): Board {
  for (const e of events) {
    const next = applyBoard(b, e);
    assert.notEqual(next, b, `${JSON.stringify(e)} applied`);
    b = next;
  }
  return b;
}

test("stored board: kept as a board, renamed team folded to its latest name, sentAt kept, and read back unchanged", () => {
  const T = 1_760_000_000_000;
  let b = newBoard("football", { teamA: "Red FC", teamB: "Blue FC", venue: "Kick Off Arena" }, { id: "bstore1", now: T });
  b = play(b, { type: "clock", run: true, at: T }, { type: "point", side: "a", how: "goal", player: "Ravi", at: T + 60_000 }, { type: "rename", side: "a", name: "Red Star FC", at: T + 90_000 });
  const out = liveMatchToStore(JSON.parse(JSON.stringify({ ...b, sentAt: T + 95_000 })));
  assert.ok("match" in out, JSON.stringify(out));
  assert.ok(isLiveBoard(out.match));
  const stored = out.match as Board;
  assert.equal(out.status, "live");
  assert.equal(stored.sentAt, T + 95_000);
  assert.equal(stored.setup.teamA, "Red Star FC");
  const json = JSON.stringify(stored);
  assert.ok(!json.includes("Red FC"), "the old name is not stored");
  assert.ok(json.includes("Ravi") && json.includes("Kick Off Arena"));
  assert.equal(stored.events.length, 3);
  // What followers get (GET and the page run sanitizeLive) is what was stored, event for event.
  assert.deepEqual(sanitizeLive(JSON.parse(json)), stored);
  const v = deriveBoard(stored);
  assert.equal(v.teams.a.name, "Red Star FC");
  assert.equal(v.teams.a.score, 1);
  // The scorer's own board keeps what was typed.
  assert.equal(b.setup.teamA, "Red FC");
});

test("stored board: a finished one is done; neither engine reads the other's", () => {
  const b = play(newBoard("badminton", { teamA: "Asha", teamB: "Ravi", firstServe: "a" }, { id: "bstore2", now: 1 }), { type: "end", reason: "retired", side: "b", at: 2 });
  const out = liveMatchToStore(JSON.parse(JSON.stringify(b)));
  assert.ok("match" in out);
  assert.equal(out.status, "done");
  // Read as cricket, a board would be an empty 0/0 scorecard: it is refused instead, both ways.
  const m = newMatch({ teamA: "Kings", teamB: "Royals" }, { id: "m9", now: 1 });
  assert.equal(sanitizeMatch(JSON.parse(JSON.stringify(b))), null);
  assert.equal(sanitizeBoard(JSON.parse(JSON.stringify(m))), null);
  // sanitizeLive picks the right one.
  assert.ok(isLiveBoard(sanitizeLive(JSON.parse(JSON.stringify(b)))!));
  assert.deepEqual(sanitizeLive(JSON.parse(JSON.stringify(m))), sanitizeMatch(JSON.parse(JSON.stringify(m))));
  const cricket = liveMatchToStore(JSON.parse(JSON.stringify(m)));
  assert.ok("match" in cricket && !isLiveBoard(cricket.match));
  // A board of no sport we know, or not a board or match at all: bad.
  assert.deepEqual(liveMatchToStore({ v: 1, kind: "board", id: "bx", sport: "curling", setup: {}, events: [] }), { error: "bad" });
  assert.deepEqual(liveMatchToStore({ kind: "board" }), { error: "bad" });
  assert.equal(sanitizeLive("board"), null);
});

test("DELETE body: just the secret", () => {
  assert.deepEqual(parseStopBody({ secret: SECRET, extra: 1 }), { secret: SECRET });
  assert.equal(parseStopBody({ secret: "nope" }), null);
  assert.equal(parseStopBody(null), null);
});

const put = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request("https://tapturf.in/api/live/x", { method: "PUT", body, headers, ...(body instanceof ReadableStream ? { duplex: "half" } : {}) } as RequestInit);

test("body: JSON is parsed; broken or missing JSON is bad", async () => {
  assert.deepEqual(await readLiveBody(put(JSON.stringify({ a: 1 })), 100), { body: { a: 1 } });
  assert.deepEqual(await readLiveBody(put("{"), 100), { error: "bad" });
  assert.deepEqual(await readLiveBody(put(null), 100), { error: "bad" });
});

test("body: too big by Content-Length is refused before reading", async () => {
  let pulled = false;
  // highWaterMark 0: the stream pulls only when someone reads it.
  const stream = new ReadableStream<Uint8Array>(
    {
      pull() {
        pulled = true;
      },
    },
    { highWaterMark: 0 },
  );
  assert.deepEqual(await readLiveBody(put(stream, { "content-length": "101" }), 100), { error: "too_big" });
  assert.equal(pulled, false);
});

test("body: too big without Content-Length is cut off while reading", async () => {
  let chunks = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      chunks++;
      c.enqueue(new Uint8Array(40).fill(32));
    },
  });
  assert.deepEqual(await readLiveBody(put(stream), 100), { error: "too_big" });
  assert.ok(chunks <= 4, `read ${chunks} chunks`);
  assert.deepEqual(await readLiveBody(put(" ".repeat(90) + "1"), 100), { body: 1 });
  assert.deepEqual(await readLiveBody(put(" ".repeat(100) + "1"), 100), { error: "too_big" });
});

function clock() {
  let t = 1_000_000;
  return { now: () => t, tick: (ms: number) => (t += ms) };
}

test("limiter: a second write for the same link within the gap is slow", () => {
  const c = clock();
  const l = createLiveLimiter(c.now);
  assert.equal(l.write("code1", "ip1"), null);
  c.tick(LIVE_MIN_GAP_MS - 1);
  assert.equal(l.write("code1", "ip1"), "slow");
  // Another link, or the same link from another network, is not held up.
  assert.equal(l.write("code2", "ip1"), null);
  assert.equal(l.write("code1", "ip2"), null);
  c.tick(1);
  assert.equal(l.write("code1", "ip1"), null);
});

test("limiter: a network over the minute's writes is slowed until the window turns", () => {
  const c = clock();
  const l = createLiveLimiter(c.now);
  for (let i = 0; i < LIVE_WRITES_PER_MIN; i++) assert.equal(l.write(`c${i}`, "ip1"), null, `write ${i}`);
  assert.equal(l.write("another", "ip1"), "slow");
  assert.equal(l.stop("ip1"), false);
  assert.equal(l.write("another", "ip2"), null);
  c.tick(60_000);
  assert.equal(l.write("another", "ip1"), null);
  assert.equal(l.stop("ip1"), true);
});

test("limiter: refused writes do not use up the budget", () => {
  const c = clock();
  const l = createLiveLimiter(c.now);
  assert.equal(l.write("code1", "ip1"), null);
  for (let i = 0; i < 500; i++) assert.equal(l.write("code1", "ip1"), "slow");
  c.tick(LIVE_MIN_GAP_MS);
  assert.equal(l.write("code1", "ip1"), null);
});

test("limiter: new codes per network per 10 minutes", () => {
  const c = clock();
  const l = createLiveLimiter(c.now);
  for (let i = 0; i < LIVE_MINTS_PER_10_MIN; i++) assert.equal(l.mint("ip1"), true);
  assert.equal(l.mint("ip1"), false);
  assert.equal(l.mint("ip2"), true);
  c.tick(10 * 60_000);
  assert.equal(l.mint("ip1"), true);
});

test("limiter: the gap holds across the 5 s generation turn", () => {
  const c = clock();
  const l = createLiveLimiter(c.now);
  c.tick(4_900);
  assert.equal(l.write("code1", "ip1"), null);
  c.tick(200);
  assert.equal(l.write("code1", "ip1"), "slow");
  c.tick(200);
  assert.equal(l.write("code1", "ip1"), null);
});

test("limiter: a flood of networks is let through uncounted, while counted ones stay limited", () => {
  const c = clock();
  const l = createLiveLimiter(c.now);
  assert.equal(l.write("first", "ip0"), null);
  for (let i = 1; i <= 6_000; i++) assert.equal(l.write(`code${i}`, `ip${i}`), null);
  for (let i = 1; i < LIVE_WRITES_PER_MIN; i++) assert.equal(l.write(`first${i}`, "ip0"), null);
  assert.equal(l.write("first", "ip0"), "slow");
  assert.equal(l.write("brand-new", "ip-new"), null);
});
