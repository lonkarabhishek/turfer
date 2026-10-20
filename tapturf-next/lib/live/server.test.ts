import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIVE_MIN_GAP_MS,
  LIVE_MINTS_PER_10_MIN,
  LIVE_WRITES_PER_MIN,
  createLiveLimiter,
  liveHttpStatus,
  liveIpHash,
  liveResult,
  liveWriteKey,
  parsePutBody,
  parseStopBody,
  readLiveBody,
} from "./server";

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
  const want: Record<string, number> = { ok: 200, stale: 409, slow: 429, forbidden: 403, gone: 410, limit: 429, too_big: 413, bad: 400, unavailable: 503 };
  for (const [r, status] of Object.entries(want)) assert.equal(liveHttpStatus(r), status, r);
  assert.equal(liveHttpStatus("toString"), 503);
  assert.equal(liveHttpStatus("weird"), 503);
});

test("an RPC result we do not know is treated as the database being down", () => {
  for (const r of ["ok", "stale", "slow", "forbidden", "gone", "limit", "too_big", "bad"]) assert.equal(liveResult(r), r);
  for (const r of ["unavailable", "taken", "constructor", "", null, undefined, 1, { r: "ok" }]) assert.equal(liveResult(r), "unavailable", String(r));
});

test("PUT body: secret is 64 lowercase hex, rev a positive safe integer", () => {
  const match = { v: 1 };
  assert.deepEqual(parsePutBody({ secret: SECRET, match, rev: 1729000000000 }), { secret: SECRET, match, rev: 1729000000000 });
  assert.deepEqual(parsePutBody({ secret: SECRET, rev: 5 }), { secret: SECRET, match: undefined, rev: 5 });
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
    { secret: SECRET, match, rev: Number.MAX_SAFE_INTEGER + 1 },
    { secret: SECRET, match, rev: NaN },
    { secret: SECRET, match },
  ]) {
    assert.equal(parsePutBody(bad), null, JSON.stringify(bad));
  }
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
