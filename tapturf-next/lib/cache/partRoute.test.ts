import { test } from "node:test";
import assert from "node:assert/strict";
import { HIT_HEADERS, MISS_HEADERS, createPartReader, dbTag, isPartOf, parsePartParams, partPath } from "./partRoute";

const DB = dbTag("https://hwfsbpzercuoshodmnuf.supabase.co");
const part = (v: number, rows = [{ id: "a" }]) => ({ v, n: 3, parts: 2, rows });

function fakeFetch(answer: (url: string) => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    // Like fetch, give up when the signal fires.
    const signal = init?.signal;
    return Promise.race([
      answer(String(input)),
      new Promise<never>((_, reject) => signal?.addEventListener("abort", () => reject(signal.reason), { once: true })),
    ]);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = HIT_HEADERS) =>
  new Response(JSON.stringify(body), { status, headers });

function reader(answer: (url: string) => Response | Promise<Response>, clock = { t: 0 }, origin: string | null = "https://www.tapturf.in") {
  const f = fakeFetch(answer);
  const logs: Record<string, unknown>[] = [];
  const read = createPartReader<{ id: string }>({
    origin,
    db: DB,
    fetchImpl: f.fetchImpl,
    timeoutMs: 50,
    offMs: 1_000,
    now: () => clock.t,
    log: (_msg, extra) => logs.push(extra),
  });
  return { read, logs, ...f };
}

test("dbTag: 8 hex digits, stable, different per database", () => {
  assert.match(DB, /^[0-9a-f]{8}$/);
  assert.equal(dbTag("https://hwfsbpzercuoshodmnuf.supabase.co"), DB);
  assert.notEqual(dbTag("https://other.supabase.co"), DB);
});

test("params: only this database, a positive version and a part below 200", () => {
  assert.deepEqual(parsePartParams({ db: DB, v: "34", i: "5" }, DB), { v: 34, i: 5 });
  assert.deepEqual(parsePartParams({ db: DB, v: "1", i: "0" }, DB), { v: 1, i: 0 });
  for (const bad of [
    { db: "ffffffff", v: "34", i: "5" },
    { db: DB, v: "0", i: "5" },
    { db: DB, v: "034", i: "5" },
    { db: DB, v: "-1", i: "5" },
    { db: DB, v: "3.5", i: "5" },
    { db: DB, v: "34", i: "200" },
    { db: DB, v: "34", i: "05" },
    { db: DB, v: "34", i: "x" },
    { db: DB, v: "1".repeat(13), i: "1" },
    {},
  ]) {
    assert.equal(parsePartParams(bad, DB), null, JSON.stringify(bad));
  }
  assert.equal(parsePartParams({ db: "", v: "1", i: "0" }, ""), null, "no database configured: nothing");
});

test("a hit is cached by the CDN for a year; a miss never is", () => {
  assert.match(HIT_HEADERS["Cache-Control"], /s-maxage=31536000/);
  assert.equal(MISS_HEADERS["Cache-Control"], "no-store");
  assert.equal(partPath(DB, 34, 5), `/api/turf-list/${DB}/34/5`);
});

test("isPartOf: exactly version v, with its numbers and rows", () => {
  assert.equal(isPartOf(part(34), 34), true);
  assert.equal(isPartOf(part(35), 34), false);
  assert.equal(isPartOf({ v: 34, n: 3, parts: 2 }, 34), false);
  assert.equal(isPartOf(null, 34), false);
  assert.equal(isPartOf("x", 34), false);
});

test("a hit returns the part; the request is not cached by Next and names the database, version and part", async () => {
  const { read, calls } = reader(() => json(part(34)));
  assert.deepEqual(await read(34, 5), part(34));
  assert.equal(calls[0].url, `https://www.tapturf.in/api/turf-list/${DB}/34/5`);
  assert.equal(calls[0].init?.cache, "no-store");
});

test("a miss returns null and keeps the route on", async () => {
  let miss = true;
  const { read, calls, logs } = reader(() => (miss ? new Response("{}", { status: 404, headers: MISS_HEADERS }) : json(part(34))));
  assert.equal(await read(34, 0), null);
  miss = false;
  assert.deepEqual(await read(34, 0), part(34));
  assert.equal(calls.length, 2);
  assert.equal(logs.length, 0);
});

test("a failure (error page, wrong part, timeout) turns the route off for a while, logged once", async () => {
  const clock = { t: 0 };
  let answer: () => Response | Promise<Response> = () => new Response("Not Found", { status: 404 }); // a 404 that is not ours
  const { read, calls, logs } = reader(() => answer(), clock);
  assert.equal(await read(34, 0), null);
  assert.equal(await read(34, 1), null);
  assert.equal(calls.length, 1, "off: the second part did not ask");
  assert.equal(logs.length, 1);
  clock.t += 1_000;
  answer = () => json(part(33));
  assert.equal(await read(34, 1), null, "another version's part is a failure");
  clock.t += 1_000;
  answer = () => json({ v: 34 }, 500);
  assert.equal(await read(34, 1), null);
  clock.t += 1_000;
  // Hangs: the timeout gives up. (The ref'd timer keeps the test alive; AbortSignal.timeout's is unref'd.)
  answer = () => new Promise<Response>(() => void setTimeout(() => {}, 500));
  assert.equal(await read(34, 1), null);
  assert.equal(logs.length, 4);
  assert.match(String(logs[3].error), /timeout|abort/i);
});

test("Next's dynamic-usage signal is passed on, not taken for a broken route", async () => {
  const dynamic = Object.assign(new Error("Dynamic server usage: no-store fetch"), { digest: "DYNAMIC_SERVER_USAGE" });
  let calls = 0;
  const { read, logs } = reader(() => {
    calls++;
    if (calls === 1) throw dynamic;
    return json(part(34));
  });
  await assert.rejects(read(34, 0), /Dynamic server usage/);
  assert.equal(logs.length, 0);
  assert.deepEqual(await read(34, 0), part(34), "the route stays on");
});

test("no origin (previews, builds, local): no request at all", async () => {
  const { read, calls } = reader(() => json(part(34)), { t: 0 }, null);
  assert.equal(await read(34, 0), null);
  assert.equal(calls.length, 0);
});
