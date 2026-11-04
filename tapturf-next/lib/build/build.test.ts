import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appTraceFiles, ERROR_PAGES, errorPageFiles, includeErrorPages } from "./errorPages";
import { buildData, FAILED, FIRST_LIFE_S, firstLifeOf, isFailed, manifestProblem, MANIFEST, MANIFEST_MAX_AGE_MS, recorded, type BuildDatasets, type Manifest } from "./data";
import { buildDataDir } from "./env";
import { backoffMs, createPatientFetch, readEach, retryAfterMs } from "./patient";
import { CARD_COLUMNS, HOME_MARKET, livePicks, prerenderedListCities, prerenderTurfKeys, topTurfKeys, type TrendingRow } from "./reads";
import { buildTripwire, createGuardedFetch } from "../supabase/guard";
import { unusable, type ListMeta } from "../cache/rowStore";
import { runBuildData, StepFailed, UNREACHABLE } from "../../scripts/build-data";
import { TURF_UUID, turfIdMap, turfIdTarget } from "../turfIds";
import { resetTurfIds, TURF_IDS_EMPTY, TURF_IDS_FILE, turfIdsDigest, writeTurfIds } from "./turfIds";

type Row = Record<string, unknown>;
const DB = "http://db.test";

/** A fake clock: sleep moves it on at once. */
function clock(t = 1_000_000) {
  const c = { t, slept: [] as number[] };
  return { c, now: () => c.t, sleep: async (ms: number) => void (c.slept.push(ms), (c.t += ms)) };
}

// ---------------------------------------------------------------- env, manifest, buildData

test("buildDataDir: only while `next build` runs with a folder that is not off", () => {
  assert.equal(buildDataDir({ TAPTURF_BUILD_DATA: "/tmp/x" }), null);
  assert.equal(buildDataDir({ NEXT_PHASE: "phase-production-server", TAPTURF_BUILD_DATA: "/tmp/x" }), null);
  assert.equal(buildDataDir({ NEXT_PHASE: "phase-production-build" }), null);
  assert.equal(buildDataDir({ NEXT_PHASE: "phase-production-build", TAPTURF_BUILD_DATA: "off" }), null);
  assert.equal(buildDataDir({ NEXT_PHASE: "phase-production-build", TAPTURF_BUILD_DATA: "/tmp/x" }), "/tmp/x");
});

test("manifestProblem: another database, more than an hour old, or malformed", () => {
  const now = 10_000_000_000;
  const m: Manifest = { db: DB, createdAt: now - 5 * 60_000, v: 7, datasets: {} };
  assert.equal(manifestProblem(m, DB, now), null);
  assert.match(manifestProblem(m, "http://other.test", now) ?? "", /recorded from http:\/\/db\.test, but this build reads http:\/\/other\.test/);
  assert.match(manifestProblem(m, undefined, now) ?? "", /no NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(manifestProblem({ ...m, createdAt: now - MANIFEST_MAX_AGE_MS - 1 }, DB, now) ?? "", /min ago/);
  assert.equal(manifestProblem({ ...m, createdAt: now - MANIFEST_MAX_AGE_MS }, DB, now), null);
  assert.match(manifestProblem(null, DB, now) ?? "", /not an object/);
  assert.match(manifestProblem({ db: DB }, DB, now) ?? "", /malformed/);
});

/** A step folder with these datasets, and the env that builds from it. */
function folder(datasets: Partial<BuildDatasets>, manifest: Partial<Manifest> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "tapturf-build-test-"));
  const m: Manifest = { db: DB, createdAt: Date.now(), v: 7, datasets: {}, ...manifest };
  for (const [name, value] of Object.entries(datasets)) {
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(value));
    m.datasets[name as keyof BuildDatasets] = { bytes: 1 };
  }
  writeFileSync(join(dir, MANIFEST), JSON.stringify(m));
  return dir;
}

function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const was: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    was[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(was)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const building = (dir: string, db = DB) => ({ NEXT_PHASE: "phase-production-build", TAPTURF_BUILD_DATA: dir, NEXT_PUBLIC_SUPABASE_URL: db });

test("buildData: the recorded answer while building from the folder; undefined while serving or for a dataset not recorded", () => {
  const dir = folder({ cities: [{ city: "pune", n: 3 }] });
  try {
    withEnv(building(dir), () => {
      assert.deepEqual(buildData("cities"), [{ city: "pune", n: 3 }]);
      assert.equal(buildData("trending"), undefined);
    });
    withEnv({ ...building(dir), NEXT_PHASE: "phase-production-server" }, () => assert.equal(buildData("cities"), undefined));
    withEnv({ ...building(dir), TAPTURF_BUILD_DATA: "off" }, () => assert.equal(buildData("cities"), undefined));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("buildData throws for a manifest from another database or more than an hour old, and for a malformed file", () => {
  const other = folder({ cities: [] });
  const old = folder({ cities: [] }, { createdAt: Date.now() - MANIFEST_MAX_AGE_MS - 60_000 });
  const broken = folder({ cities: [] });
  writeFileSync(join(broken, "cities.json"), '[{"city":');
  try {
    withEnv(building(other, "http://other.test"), () => assert.throws(() => buildData("cities"), /build data: recorded from http:\/\/db\.test/));
    withEnv(building(old), () => assert.throws(() => buildData("cities"), /min ago/));
    withEnv(building(broken), () => assert.throws(() => buildData("cities"), SyntaxError));
  } finally {
    for (const d of [other, old, broken]) rmSync(d, { recursive: true, force: true });
  }
});

test("recorded: own keys only", () => {
  const map = JSON.parse('{"turf-a": 1, "turf-b": null}') as Record<string, unknown>;
  assert.equal(recorded(map, "turf-a"), 1);
  assert.equal(recorded(map, "turf-b"), null);
  assert.equal(recorded(map, "constructor"), undefined);
  assert.equal(recorded(undefined, "turf-a"), undefined);
});

test("firstLifeOf: the same mark for a key every time, and all four marks over many keys", () => {
  const seen = new Set<number>();
  for (let i = 0; i < 200; i++) {
    const key = `turf-${i}-hyderabad`;
    const s = firstLifeOf(key);
    assert.ok((FIRST_LIFE_S as readonly number[]).includes(s));
    assert.equal(firstLifeOf(key), s);
    seen.add(s);
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), [900, 1200, 1500, 1800]);
});

// ---------------------------------------------------------------- tripwire

test("tripwire: none while serving or without the folder", () => {
  assert.equal(buildTripwire({ NEXT_PHASE: "phase-production-build" }), undefined);
  assert.equal(buildTripwire({ TAPTURF_BUILD_DATA: "/tmp/x" }), undefined);
});

test("tripwire: logs and notes each path once, and lets the read through", () => {
  const logs: string[] = [];
  const notes: string[] = [];
  const trip = buildTripwire(building("/tmp/x"), (m) => logs.push(m), (_dir, p) => notes.push(p))!;
  trip(`${DB}/rest/v1/rpc/turf_page`);
  trip(`${DB}/rest/v1/rpc/turf_page`);
  trip(`${DB}/rest/v1/turfs?select=id`);
  assert.deepEqual(logs, ["build: a page read the database /rest/v1/rpc/turf_page", "build: a page read the database /rest/v1/turfs"]);
  assert.deepEqual(notes, ["/rest/v1/rpc/turf_page", "/rest/v1/turfs"]);
});

test("tripwire, strict: every read the step did not record throws before it reaches the database", async () => {
  let calls = 0;
  const trip = buildTripwire({ ...building("/tmp/x"), TAPTURF_BUILD_DATA_STRICT: "1" }, () => {}, () => {})!;
  const g = createGuardedFetch({ threshold: Infinity, onRequest: trip, fetchImpl: (async () => (calls++, new Response("[]"))) as typeof fetch });
  await assert.rejects(g(`${DB}/rest/v1/rpc/turf_page`, { method: "POST" }), /a page read the database \/rest\/v1\/rpc\/turf_page \(TAPTURF_BUILD_DATA_STRICT=1\)/);
  await assert.rejects(g(`${DB}/rest/v1/rpc/turf_page`, { method: "POST" }), /STRICT/);
  assert.equal(calls, 0);
});

// ---------------------------------------------------------------- patient fetch

const json = (v: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json", ...headers } });

/** A body that sends a little, then breaks (a transfer cut off mid-body). */
function cutBody(): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(ctl) {
      ctl.enqueue(new TextEncoder().encode('[{"id":"'));
      ctl.error(new TypeError("terminated"));
    },
  });
  return new Response(stream, { status: 200 });
}

test("backoff: 1, 2, 4, 8, 15, then 30 s, each ±25%", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map((n) => backoffMs(n, () => 0.5)), [1000, 2000, 4000, 8000, 15000, 30000, 30000]);
  assert.equal(backoffMs(1, () => 0), 750);
  assert.equal(backoffMs(1, () => 1), 1250);
});

test("Retry-After: seconds or a date, at most a minute", () => {
  assert.equal(retryAfterMs("7", 0), 7000);
  assert.equal(retryAfterMs("600", 0), 60_000);
  assert.equal(retryAfterMs(new Date(30_000).toUTCString(), 0), 30_000);
  assert.equal(retryAfterMs(null, 0), null);
  assert.equal(retryAfterMs("soon", 0), null);
});

test("patient fetch: a body cut off mid-transfer is read again, and the caller gets a whole one", async () => {
  const { now, sleep } = clock();
  const answers = [cutBody(), json([{ id: "a" }])];
  const f = createPatientFetch({ deadline: () => now() + 60_000, now, sleep, log: () => {}, fetchImpl: (async () => answers.shift()!) as typeof fetch });
  const res = await f(`${DB}/rest/v1/turfs`);
  assert.deepEqual(await res.json(), [{ id: "a" }]);
  assert.equal(f.stats.requests, 2);
  assert.equal(f.stats.retries, 1);
});

test("patient fetch: honors Retry-After on 429 and 503, sends its user agent, logs one line per retry without rows", async () => {
  const { c, now, sleep } = clock();
  const logs: string[] = [];
  const agents: string[] = [];
  const answers = [json({ message: "busy" }, 503, { "retry-after": "7" }), json({ message: "slow down" }, 429, { "retry-after": "3" }), json([{ id: "a", owner_phone: "x" }])];
  const f = createPatientFetch({
    deadline: () => now() + 60_000,
    userAgent: "tapturf-build-data",
    now,
    sleep,
    log: (m) => logs.push(m),
    fetchImpl: (async (_u: RequestInfo | URL, init?: RequestInit) => (agents.push(new Headers(init?.headers).get("user-agent") ?? ""), answers.shift()!)) as typeof fetch,
  });
  assert.equal((await f(`${DB}/rest/v1/rpc/turf_list_part`, { method: "POST" })).status, 200);
  assert.deepEqual(c.slept, [7000, 3000]);
  assert.deepEqual(agents, ["tapturf-build-data", "tapturf-build-data", "tapturf-build-data"]);
  assert.deepEqual(logs, ["build data: retry /rest/v1/rpc/turf_list_part (HTTP 503) in 7.0 s", "build data: retry /rest/v1/rpc/turf_list_part (HTTP 429) in 3.0 s"]);
});

test("patient fetch: other 4xx answer at once (a missing function fails fast)", async () => {
  let calls = 0;
  const f = createPatientFetch({ deadline: () => Date.now() + 60_000, log: () => {}, fetchImpl: (async () => (calls++, json({ code: "PGRST202" }, 404))) as typeof fetch });
  assert.equal((await f(`${DB}/rest/v1/rpc/turf_list_version`)).status, 404);
  assert.equal(calls, 1);
});

test("patient fetch: gives up at the deadline (the last answer, or the last error) and counts it", async () => {
  const { now, sleep } = clock();
  const down = createPatientFetch({ deadline: () => 1_000_000 + 60_000, now, sleep, log: () => {}, fetchImpl: (async () => json({}, 503)) as typeof fetch });
  assert.equal((await down(`${DB}/x`)).status, 503);
  assert.equal(down.stats.gaveUp, 1);
  assert.ok(down.stats.requests >= 5 && down.stats.requests <= 8, `${down.stats.requests} tries in a minute`);
  const gone = createPatientFetch({ deadline: () => now() + 5_000, now, sleep, log: () => {}, fetchImpl: (async () => Promise.reject(new TypeError("fetch failed"))) as typeof fetch });
  await assert.rejects(gone(`${DB}/x`), /fetch failed/);
  const once = createPatientFetch({ deadline: () => now() + 60_000, maxTries: 1, now, sleep, log: () => {}, fetchImpl: (async () => json({}, 500)) as typeof fetch });
  assert.equal((await once(`${DB}/x`)).status, 500);
  assert.equal(once.stats.requests, 1);
});

test("patient fetch: the timeout covers the body, and the try is made again", async () => {
  let calls = 0;
  const fetchImpl = (async (_u: RequestInfo | URL, init?: RequestInit) => {
    calls++;
    if (calls > 1) return json([]);
    // Headers come, the body never ends (until the request is aborted).
    const stream = new ReadableStream<Uint8Array>({
      start(ctl) {
        ctl.enqueue(new TextEncoder().encode("["));
        init?.signal?.addEventListener("abort", () => ctl.error(init.signal!.reason));
      },
    });
    return new Response(stream, { status: 200 });
  }) as typeof fetch;
  const f = createPatientFetch({ deadline: () => Date.now() + 60_000, timeoutMs: 30, sleep: async () => {}, log: () => {}, fetchImpl });
  assert.deepEqual(await (await f(`${DB}/x`)).json(), []);
  assert.equal(calls, 2);
});

// ---------------------------------------------------------------- readEach

test("readEach: a key is tried at most maxTries times; the others are all read", async () => {
  const { now, sleep } = clock();
  const tried: string[] = [];
  const keys = ["a", "b", "bad", "c", "d", "e"];
  const res = await readEach(keys, async (k) => (tried.push(k), k === "bad" ? Promise.reject(new Error("no")) : k.toUpperCase()), { concurrency: 1, maxTries: 4, deadline: now() + 600_000, now, sleep });
  assert.equal(tried.filter((k) => k === "bad").length, 4);
  assert.deepEqual([...res.got.keys()].sort(), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(res.skipped, [{ key: "bad", why: "failed" }]);
  // Its last 4 tries failed, the one before them did not: one bad key is no failing database.
  assert.equal(res.failingAtEnd, false);
});

test("readEach: failingAtEnd only when the last 5 tries all failed", async () => {
  const { now, sleep } = clock();
  const all = await readEach(["a", "b", "c"], async () => Promise.reject(new Error("down")), { concurrency: 3, maxTries: 4, deadline: now() + 600_000, now, sleep });
  assert.equal(all.failingAtEnd, true);
  assert.equal(all.tries, 12);
  assert.equal(all.got.size, 0);

  // Down, then back: the last tries succeed.
  let n = 0;
  const back = await readEach(["a", "b", "c", "d", "e", "f"], async (k) => (++n <= 5 ? Promise.reject(new Error("down")) : k), { concurrency: 1, maxTries: 4, deadline: now() + 600_000, now, sleep });
  assert.equal(back.failingAtEnd, false);
  assert.equal(back.got.size, 6);
});

test("readEach: slow reads that answer never trip the gate; the deadline skips what is left; null is no failure", async () => {
  const { c, now, sleep } = clock();
  const keys = Array.from({ length: 10 }, (_, i) => `k${i}`);
  const res = await readEach(
    keys,
    async (k) => {
      c.t += 60_000; // a minute each
      return k === "k1" ? null : k;
    },
    { concurrency: 1, maxTries: 4, deadline: now() + 4 * 60_000, now, sleep },
  );
  assert.deepEqual([...res.got.keys()], ["k0", "k2", "k3"]);
  assert.deepEqual(res.skipped.filter((s) => s.why === "absent").map((s) => s.key), ["k1"]);
  assert.equal(res.skipped.filter((s) => s.why === "deadline").length, 6);
  assert.equal(res.failingAtEnd, false);
  assert.equal(res.failures, 0);
});

test("readEach: never more than `concurrency` reads at once", async () => {
  let inFlight = 0;
  let peak = 0;
  await readEach(
    Array.from({ length: 20 }, (_, i) => i),
    async (k) => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      return k;
    },
    { concurrency: 3, maxTries: 4, deadline: Date.now() + 60_000 },
  );
  assert.equal(peak, 3);
});

// ---------------------------------------------------------------- reads

test("topTurfKeys: most reviewed first, no count last, then id; the slug or the id", () => {
  const rows = [
    { id: "c", slug: "turf-c", total_reviews: 5 },
    { id: "b", slug: null, total_reviews: 9 },
    { id: "a", slug: "turf-a", total_reviews: 5 },
    { id: "d", slug: "turf-d", total_reviews: null },
    { id: "e", slug: "", total_reviews: 0 },
  ];
  assert.deepEqual(topTurfKeys(rows, 10), ["b", "turf-a", "turf-c", "e", "turf-d"]);
  assert.deepEqual(topTurfKeys(rows, 2), ["b", "turf-a"]);
  assert.deepEqual(topTurfKeys(rows, 0), []);
});

test("prerenderTurfKeys: the most reviewed, then every other turf of the home market (Nashik), each once", () => {
  assert.equal(HOME_MARKET, "nashik");
  const rows = [
    { id: "a", slug: "a", city: "pune", total_reviews: 50 },
    { id: "b", slug: "b", city: "nashik", total_reviews: 40 },
    { id: "c", slug: "c", city: "mumbai", total_reviews: 30 },
    { id: "d", slug: null, city: "nashik", total_reviews: 2 },
    { id: "e", slug: "e", city: "nashik", total_reviews: null },
    { id: "f", slug: "f", city: "nashik", total_reviews: 9 },
    { id: "g", slug: "g", city: "nashik", total_reviews: 1, is_active: false },
    { id: "h", slug: "h", city: "pune", total_reviews: 1 },
  ];
  assert.deepEqual(prerenderTurfKeys(rows, 2), ["a", "b", "f", "d", "e"], "top 2, then Nashik's others most reviewed first; never an inactive row");
  assert.deepEqual(prerenderTurfKeys(rows, 0), ["b", "f", "d", "e"]);
  assert.deepEqual(prerenderTurfKeys(rows.filter((r) => r.city !== "nashik"), 2), ["a", "c"], "no Nashik turfs: the top only");
});

test("prerenderedListCities: the 8 biggest by live count (ties keep the list's order), plus Nashik when it is live and not among them", () => {
  const live = ["hyderabad", "bangalore", "pune", "mumbai", "delhi", "chennai", "ahmedabad", "surat", "kolkata", "nashik"].map((id, i) => ({ id, n: 400 - i * 10 }));
  assert.deepEqual(prerenderedListCities(live), ["hyderabad", "bangalore", "pune", "mumbai", "delhi", "chennai", "ahmedabad", "surat", "nashik"]);
  // Nashik among the 8: no extra city.
  assert.deepEqual(prerenderedListCities(live, 10), live.map((c) => c.id));
  // A tie keeps the incoming (biggest-first, curated) order.
  assert.deepEqual(prerenderedListCities([{ id: "x", n: 5 }, { id: "y", n: 5 }, { id: "z", n: 9 }], 2), ["z", "x"]);
  // Nashik not live: not added.
  assert.deepEqual(prerenderedListCities(live.filter((c) => c.id !== "nashik"), 2), ["hyderabad", "bangalore"]);
  assert.deepEqual(prerenderedListCities([]), []);
});

test("livePicks: judged at the render, the latest start winning", () => {
  const day = 86_400_000;
  const t = Date.UTC(2026, 9, 29);
  const iso = (ms: number) => new Date(ms).toISOString();
  const rows: TrendingRow[] = [
    { city: "pune", turf_id: "next", tagline: null, starts_at: iso(t + day), ends_at: iso(t + 8 * day) },
    { city: "pune", turf_id: "now", tagline: null, starts_at: iso(t - day), ends_at: iso(t + 2 * day) },
    { city: "pune", turf_id: "older", tagline: null, starts_at: iso(t - 3 * day), ends_at: iso(t + 2 * day) },
    { city: "nashik", turf_id: "ends", tagline: null, starts_at: iso(t - day), ends_at: iso(t + 1000) },
  ];
  assert.deepEqual(livePicks(rows, new Date(t)).map((r) => r.turf_id), ["now", "ends"]);
  // Recorded before, rendered after: the window that closed is gone, the one that opened is in.
  assert.deepEqual(livePicks(rows, new Date(t + day + 1)).map((r) => r.turf_id), ["next"]);
});

test("unusable (the row store's rule): no snapshot, a column missing, or not built for 3 hours", () => {
  const meta: ListMeta = { v: 7, n: 10, parts: 1, cols: CARD_COLUMNS, age_s: 30 };
  assert.equal(unusable(meta, CARD_COLUMNS), null);
  assert.equal(unusable(null, CARD_COLUMNS), "no snapshot");
  assert.equal(unusable({ ...meta, v: 0 }, CARD_COLUMNS), "no snapshot");
  assert.equal(unusable({ ...meta, cols: CARD_COLUMNS.replace(", claimed", "") }, CARD_COLUMNS), "columns missing");
  assert.equal(unusable({ ...meta, age_s: 10_800 }, CARD_COLUMNS), "snapshot stale");
});

// ---------------------------------------------------------------- the step, on a fake PostgREST

type FakeState = {
  v: number;
  meta: () => ListMeta | null;
  rows: Row[];
  size: number;
  cities: () => Response;
  pages: Record<string, unknown>;
  managers: Record<string, unknown>;
  /** Turfs with price bands (readSportBandRows). */
  bands: Row[];
  /** turf_ground_size_peers' answer (readGroundPeers). */
  peers: unknown[];
  /** Answers before the defaults (an outage, a rebuild...). */
  override?: (path: string, u: URL, body: Row, s: FakeState) => Response | Promise<Response> | undefined;
  calls: string[];
};

function fakeDb(over: Partial<FakeState> = {}) {
  const rows: Row[] = Array.from({ length: 1200 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    slug: i === 7 ? null : `turf-${i}`,
    // The home market (Nashik) only among the 300 most reviewed: the step reads 300 turf pages (see the Nashik test below).
    city: i % 2 ? "pune" : i < 300 ? "nashik" : "mumbai",
    total_reviews: 1200 - i,
    sports: ["Football"],
    updated_at: "2026-10-20T00:00:00+00:00",
  }));
  const s: FakeState = {
    v: 7,
    rows,
    size: 400,
    meta: () => ({ v: s.v, n: s.rows.length, parts: Math.ceil(s.rows.length / s.size), cols: CARD_COLUMNS, age_s: 30, built: 1000 + s.v }),
    cities: () => json([{ city: "pune", n: 600, lat: 18.5, lng: 73.8 }, { city: "nashik", n: 600, lat: 20, lng: 73.8 }]),
    pages: {},
    managers: {},
    bands: [
      { id: rows[0].id, pricing_bands: [{ band: "morning", days: "all", format: "6-a-side", price_per_hour: 1200 }], price_owner_confirmed: null },
      { id: rows[5].id, pricing_bands: [{ band: "evening", days: "weekend", format: "box cricket", price_per_hour: 1500 }], price_owner_confirmed: true },
    ],
    peers: [[rows[2].id, "nashik", [[120, 60, 40], [90, 45, null]]], [rows[9].id, "pune", [[150, 80, 45]]]],
    calls: [],
    ...over,
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const p = u.pathname;
    const body = (init?.body ? JSON.parse(String(init.body)) : {}) as Row;
    s.calls.push(p.replace("/rest/v1/", ""));
    const o = await s.override?.(p, u, body, s);
    if (o) return o;
    const sel = u.searchParams.get("select") ?? "";
    const page = (list: Row[]) => {
      const off = Number(u.searchParams.get("offset") ?? 0);
      return json(list.slice(off, off + Number(u.searchParams.get("limit") ?? 1000)));
    };
    switch (p) {
      case "/rest/v1/rpc/turf_list_version":
        return json(s.meta());
      case "/rest/v1/rpc/turf_list_part": {
        const i = Number(body.p_part);
        const parts = Math.ceil(s.rows.length / s.size);
        return json(i < parts ? { v: s.v, n: s.rows.length, parts, rows: s.rows.slice(i * s.size, (i + 1) * s.size) } : null);
      }
      case "/rest/v1/city_turf_counts":
        return s.cities();
      case "/rest/v1/turfs":
        if (sel.startsWith("id,name,city,owner_phone")) return page(s.rows.map((r) => ({ id: r.id, name: `Turf ${r.id}`, city: r.city, owner_phone: "9000000000" })));
        if (sel === "id,pricing_bands,price_owner_confirmed") return page(s.bands);
        if (u.searchParams.get("id")?.startsWith("in.(")) {
          const ids = new Set(u.searchParams.get("id")!.slice(4, -1).split(","));
          return json(s.rows.filter((r) => ids.has(r.id as string)));
        }
        return page(s.rows);
      case "/rest/v1/games":
        return json(sel === "*" ? [{ id: "g1", turf_id: rows[3].id, date: "2026-11-02", start_time: "19:00:00", status: "open" }] : []);
      case "/rest/v1/trending_turfs":
        return json([]);
      case "/rest/v1/rpc/turf_page": {
        const k = String(body.p_key);
        if (k in s.pages) return json(s.pages[k]);
        const row = s.rows.find((r) => (r.slug ?? r.id) === k);
        return json(row ? { turf: row, claimed: k === "turf-1" } : { found: false });
      }
      case "/rest/v1/rpc/turf_ground_size_peers":
        return json(s.peers);
      case "/rest/v1/rpc/turf_managers":
        return json(s.managers[String(body.p_turf_id)] ?? { managers: [{ u: "owner_one", v: true }], more: 0 });
      default:
        return json({ message: `no route ${p}` }, 404);
    }
  }) as typeof fetch;
  return { s, fetchImpl };
}

async function step(over: Partial<FakeState> = {}, env: Record<string, string> = {}, ck = clock()) {
  const { s, fetchImpl } = fakeDb(over);
  const { c, now, sleep } = ck;
  const logs: string[] = [];
  const dir = mkdtempSync(join(tmpdir(), "tapturf-step-test-"));
  const read = (name: string) => JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));
  try {
    const run = runBuildData(dir, { env: { NEXT_PUBLIC_SUPABASE_URL: DB, NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", VERCEL_ENV: "production", ...env }, fetchImpl, now, sleep, log: (m) => logs.push(m) });
    const summary = await run;
    return { s, c, logs, summary, dir, manifest: read("manifest") as Manifest, list: read("list") as BuildDatasets["list"], read, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw Object.assign(e as Error, { s, c, logs });
  }
}

test("step: every dataset, one request at a time, the turf pages it could read, and the manifest last", async () => {
  const r = await step({ pages: { "turf-2": { found: false } } });
  try {
    assert.equal(r.manifest.db, DB);
    assert.equal(r.manifest.v, 7);
    assert.deepEqual(Object.keys(r.manifest.datasets).sort(), ["cities", "games", "ground-peers", "list", "sitemap", "sport-bands", "trending", "turf-facts", "turf-pages"]);
    assert.equal(r.list.parts!.length, 3);
    assert.equal(r.list.rows, null);
    const pages = r.read("turf-pages") as BuildDatasets["turf-pages"];
    assert.equal(pages.keys.length, 299);
    assert.ok(!pages.keys.includes("turf-2"), "found: false is skipped, never a 404");
    // Turf 7 has no slug: its key is its id.
    assert.ok(pages.keys.includes(r.s.rows[7].id as string));
    assert.deepEqual(Object.keys(pages.managers), [r.s.rows[1].id]);
    const games = r.read("games") as BuildDatasets["games"];
    assert.equal(games.available.turfs.length, 1);
    // Facts keep ids and keys, never a number.
    assert.doesNotMatch(JSON.stringify(r.read("turf-facts")), /9000000000/);
    // The sport bands as read: the pages shape them as they shape their own read.
    assert.deepEqual(r.read("sport-bands"), r.s.bands);
    // The ground size peers as read, once.
    assert.deepEqual(r.read("ground-peers"), r.s.peers);
    assert.equal(r.s.calls.filter((c) => c === "rpc/turf_ground_size_peers").length, 1);
    assert.equal(r.summary.moved, false);
  } finally {
    r.cleanup();
  }
});

test("step: production builds also read every turf page of the home market (Nashik), after the 300 most reviewed", async () => {
  // 40 Nashik turfs with few reviews (rows 1100 to 1139), one of them gone (found: false).
  const rows: Row[] = Array.from({ length: 1200 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    slug: `turf-${i}`,
    city: i >= 1100 && i < 1140 ? "nashik" : "pune",
    total_reviews: 1200 - i,
    sports: ["Football"],
    updated_at: "2026-10-20T00:00:00+00:00",
  }));
  const r = await step({ rows, pages: { "turf-1105": { found: false } } });
  try {
    const pages = r.read("turf-pages") as BuildDatasets["turf-pages"];
    assert.equal(pages.keys.length, 300 + 39);
    assert.deepEqual(pages.keys.slice(0, 300), rows.slice(0, 300).map((x) => x.slug));
    assert.deepEqual(pages.keys.slice(300), rows.slice(1100, 1140).map((x) => x.slug).filter((k) => k !== "turf-1105"));
    assert.equal(r.s.calls.filter((c) => c === "rpc/turf_page").length, 340, "each key read once");
  } finally {
    r.cleanup();
  }
  // Previews build no turf pages, Nashik's included.
  const p = await step({ rows }, { VERCEL_ENV: "preview" });
  try {
    assert.equal(p.s.calls.filter((c) => c === "rpc/turf_page").length, 0);
  } finally {
    p.cleanup();
  }
});

test("step: without a usable snapshot (stale, a column missing, none) it records the table's rows, as the row store would read them", async () => {
  for (const meta of [{ age_s: 20_000 }, { cols: CARD_COLUMNS.replace(", claimed", "") }, { v: 0 }, null]) {
    const r = await step({ meta: () => (meta === null ? null : { v: 7, n: 1200, parts: 3, cols: CARD_COLUMNS, age_s: 30, ...meta }) });
    try {
      assert.equal(r.list.parts, null);
      assert.equal(r.list.rows!.length, 1200);
      assert.equal(r.manifest.v, null);
      assert.ok(!r.s.calls.includes("rpc/turf_list_part"));
    } finally {
      r.cleanup();
    }
  }
});

test("step: no cities where there must be some is read again; a 4xx fails at once and says why", async () => {
  let n = 0;
  const r = await step({ cities: () => (++n === 1 ? json([]) : json([{ city: "pune", n: 1200 }])) });
  try {
    assert.equal(n, 2);
    assert.ok(r.logs.some((l) => /city_turf_counts: no live cities; reading again/.test(l)));
  } finally {
    r.cleanup();
  }
  await assert.rejects(step({ cities: () => json({ code: "PGRST205", message: "relation not found" }, 404) }), (e: Error) => e instanceof StepFailed && /city_turf_counts failed: city_turf_counts: relation not found/.test(e.message));
});

test("step: a database that never answers fails it within the 6 minutes, with the message", async () => {
  await assert.rejects(
    step({ override: () => Promise.reject(new TypeError("fetch failed")) }),
    (e: Error & { c?: { t: number } }) => e instanceof StepFailed && e.message.startsWith(UNREACHABLE) && e.c!.t - 1_000_000 <= 6 * 60_000 + 30_000,
  );
});

test("step: an outage at the start is waited out", async () => {
  let down = 3;
  const r = await step({ override: (p) => (p.endsWith("turf_list_version") && down-- > 0 ? json({ message: "timeout" }, 503) : undefined) });
  try {
    assert.equal(r.manifest.v, 7);
    assert.equal(r.summary.retries, 3);
  } finally {
    r.cleanup();
  }
});

test("step: parts of two builds start the list again", async () => {
  const r = await step({
    override: (p, _u, body, s) => {
      // Rebuilt between part 1 and part 2.
      if (p.endsWith("turf_list_part") && body.p_part === 2 && s.v === 7) s.v = 8;
      return undefined;
    },
  });
  try {
    assert.equal(r.manifest.v, 8);
    assert.ok(r.logs.some((l) => /turf list part 2 is not from v7; reading the list again/.test(l)));
  } finally {
    r.cleanup();
  }
});

test("step: a list rebuilt while turf pages are read is read again (freshen)", async () => {
  let pagesRead = 0;
  const r = await step({
    override: (p, _u, _body, s) => {
      if (p.endsWith("turf_page") && ++pagesRead === 150) s.v = 9;
      return undefined;
    },
  });
  try {
    assert.equal(r.summary.moved, true);
    assert.equal(r.list.meta!.v, 9);
    assert.ok(r.list.parts!.every((part) => part.v === 9));
    assert.equal(r.manifest.v, 9);
  } finally {
    r.cleanup();
  }
});

test("step: a database failing when the turf pages' time is up fails it (health gate); slow-but-answering does not", async () => {
  await assert.rejects(
    step({ override: (p) => (p.endsWith("turf_page") ? json({ message: "timeout" }, 503) : undefined) }),
    (e: Error) => e instanceof StepFailed && /stopped answering while turf pages were read/.test(e.message),
  );
  let n = 0;
  const r = await step({ override: (p) => (p.endsWith("turf_page") && ++n % 10 === 0 ? json({ message: "timeout" }, 503) : undefined) });
  try {
    assert.equal((r.read("turf-pages") as BuildDatasets["turf-pages"]).keys.length, 300);
  } finally {
    r.cleanup();
  }
});

test("step: a turf_managers read that fails is recorded as failed (the page's own rule), and never fails it", async () => {
  // Two claimed turfs among the top 300 whose turf_managers keeps failing (a statement timeout, a revoked grant).
  const claimed = new Set(["turf-3", "turf-5"]);
  const r = await step({
    override: (p, _u, body, s) => {
      if (p.endsWith("turf_page") && claimed.has(String(body.p_key))) return json({ turf: s.rows.find((x) => x.slug === body.p_key), claimed: true });
      if (p.endsWith("turf_managers") && body.p_turf_id === s.rows[3].id) return json({ code: "57014", message: "canceling statement due to statement timeout" }, 500);
      if (p.endsWith("turf_managers") && body.p_turf_id === s.rows[5].id) return json({ code: "42501", message: "permission denied for function turf_managers" }, 401);
      return undefined;
    },
  });
  try {
    const pages = r.read("turf-pages") as BuildDatasets["turf-pages"];
    assert.equal(pages.keys.length, 300);
    assert.deepEqual(pages.managers[r.s.rows[3].id as string], { failed: true });
    assert.deepEqual(pages.managers[r.s.rows[5].id as string], { failed: true });
    assert.deepEqual(pages.managers[r.s.rows[1].id as string], { managers: [{ u: "owner_one", v: true }], more: 0 });
    assert.equal(r.summary.skipped, 0);
    assert.ok(r.logs.some((l) => l === "build data: turf_managers failed for turf-3 (canceling statement due to statement timeout); its page is built without the line"));
    // One read each: a failed line is no reason to read the page again.
    assert.equal(r.s.calls.filter((c) => c === "rpc/turf_managers").length, 3);
  } finally {
    r.cleanup();
  }
});

test("step: keys whose read keeps failing render on their first visit; the gate is only for time running out", async () => {
  const bad = new Set(["turf-4", "turf-6"]);
  const r = await step({ override: (p, _u, body) => (p.endsWith("turf_page") && bad.has(String(body.p_key)) ? json({ code: "XX000", message: "boom" }, 500) : undefined) });
  try {
    const pages = r.read("turf-pages") as BuildDatasets["turf-pages"];
    assert.equal(pages.keys.length, 298);
    assert.ok(!pages.keys.includes("turf-4") && !pages.keys.includes("turf-6"));
    assert.equal(r.summary.skipped, 2);
    assert.ok(r.logs.some((l) => /2 of 300 turf pages render on their first visit instead \(\{"failed":2\}\)/.test(l)));
  } finally {
    r.cleanup();
  }
});

test("step: a database down for the last turf pages is waited out by the list re-check, or fails it there", async () => {
  // Unreachable from the 299th turf_page on: the last 2 keys use up their tries inside the outage.
  const outage = (ms: number) => {
    const ck = clock();
    let n = 0;
    let downUntil = -1;
    const over: Partial<FakeState> = {
      override: (p) => {
        if (p.endsWith("turf_page") && ++n === 299) downUntil = ck.c.t + ms;
        return ck.c.t < downUntil ? Promise.reject(new TypeError("fetch failed")) : undefined;
      },
    };
    return { ck, over };
  };
  const brief = outage(3 * 60_000);
  const r = await step(brief.over, {}, brief.ck);
  try {
    assert.equal((r.read("turf-pages") as BuildDatasets["turf-pages"]).keys.length, 298);
    assert.equal(r.summary.skipped, 2);
    assert.ok(r.logs.some((l) => /retry \/rest\/v1\/rpc\/turf_list_version \(fetch failed\)/.test(l)), "the re-check waited");
  } finally {
    r.cleanup();
  }
  const lasting = outage(Infinity);
  await assert.rejects(step(lasting.over, {}, lasting.ck), (e: Error) => e instanceof StepFailed && e.message.startsWith(UNREACHABLE) && /turf_list_version \(again\)/.test(e.message));
});

test("step: turf facts that cannot be read never fail it: noted, and pages build without them", async () => {
  const facts = (u: URL) => (u.searchParams.get("select") ?? "").startsWith("id,name,city,owner_phone");
  // A column privilege taken away answers at once; a statement that keeps timing out is given 2 minutes.
  for (const [res, most] of [[() => json({ code: "42501", message: "permission denied for table turfs" }, 401), 0], [() => json({ code: "57014", message: "canceling statement due to statement timeout" }, 503), 2 * 60_000]] as const) {
    let factsRead = 0;
    const r = await step({ override: (_p, u) => (facts(u) ? (factsRead++, res()) : undefined) });
    try {
      assert.deepEqual(r.read("turf-facts"), { failed: true });
      assert.ok(r.manifest.datasets["turf-facts"]);
      assert.ok(r.logs.some((l) => /^build data: turf facts not recorded \(Paged fetch failed at row 0\); pages build without them/.test(l)));
      assert.equal((r.read("turf-pages") as BuildDatasets["turf-pages"]).keys.length, 300);
      assert.ok(r.summary.ms <= most + 1000, `${r.summary.ms} ms`);
      assert.ok(most === 0 ? factsRead === 1 : factsRead > 5, `${factsRead} facts reads`);
    } finally {
      r.cleanup();
    }
  }
});

test("step: the sport bands are read the way getSportBands reads them, paged by id, and named in the summary line", async () => {
  const bands = Array.from({ length: 620 }, (_, i) => ({ id: `00000000-0000-4000-9000-${String(i).padStart(12, "0")}`, pricing_bands: [{ band: "day", days: "all", format: "5-a-side", price_per_hour: 900 + i }], price_owner_confirmed: i === 3 }));
  const urls: URL[] = [];
  const lines: string[] = [];
  const log = console.log;
  console.log = (m: string) => void lines.push(m);
  try {
    const r = await step({ bands, override: (p, u) => void (p === "/rest/v1/turfs" && u.searchParams.get("select") === "id,pricing_bands,price_owner_confirmed" && urls.push(u)) });
    try {
      assert.deepEqual(r.read("sport-bands"), bands);
      // One query, the one the pages make: active turfs with bands, by id, 500 a page.
      assert.deepEqual(urls.map((u) => u.searchParams.get("offset")), ["0", "500"]);
      for (const u of urls) {
        assert.equal(u.searchParams.get("is_active"), "eq.true");
        assert.equal(u.searchParams.get("pricing_bands"), "not.is.null");
        assert.equal(u.searchParams.get("order"), "id.asc");
      }
      assert.match(lines.join("\n"), /^build data: .*; sport bands of 620 turfs; turf pages 300 recorded/m);
    } finally {
      r.cleanup();
    }
  } finally {
    console.log = log;
  }
});

test("step: sport bands that cannot be read never fail it: noted, and the sport pages build without them", async () => {
  const banded = (u: URL) => u.searchParams.get("select") === "id,pricing_bands,price_owner_confirmed";
  // A column privilege taken away answers at once; a statement that keeps timing out is given 2 minutes.
  for (const [res, most] of [[() => json({ code: "42501", message: "permission denied for table turfs" }, 401), 0], [() => json({ code: "57014", message: "canceling statement due to statement timeout" }, 503), 2 * 60_000]] as const) {
    let bandReads = 0;
    const lines: string[] = [];
    const log = console.log;
    console.log = (m: string) => void lines.push(m);
    try {
      const r = await step({ override: (_p, u) => (banded(u) ? (bandReads++, res()) : undefined) });
      try {
        assert.deepEqual(r.read("sport-bands"), { failed: true });
        assert.ok(r.logs.some((l) => /^build data: sport bands not recorded \(Paged fetch failed at row 0\); sport pages build without them/.test(l)));
        // Everything else is as it would be, the facts and the turf pages included.
        assert.notDeepEqual(r.read("turf-facts"), { failed: true });
        assert.equal((r.read("turf-pages") as BuildDatasets["turf-pages"]).keys.length, 300);
        assert.ok(r.summary.ms <= most + 1000, `${r.summary.ms} ms`);
        assert.ok(most === 0 ? bandReads === 1 : bandReads > 5, `${bandReads} band reads`);
        assert.match(lines.join("\n"), /; sport bands not recorded; /);
      } finally {
        r.cleanup();
      }
    } finally {
      console.log = log;
    }
  }
});

test("step: ground size peers before their migration are none; peers that cannot be read never fail it", async () => {
  const peered = (p: string) => p === "/rest/v1/rpc/turf_ground_size_peers";
  const before = await step({ override: (p) => (peered(p) ? json({ code: "PGRST202", message: "Could not find the function public.turf_ground_size_peers" }, 404) : undefined) });
  try {
    assert.deepEqual(before.read("ground-peers"), [], "no function yet: no turf has sizes");
    assert.ok(!before.logs.some((l) => /ground size peers/.test(l)));
  } finally {
    before.cleanup();
  }
  for (const [res, most] of [[() => json({ code: "42501", message: "permission denied for function turf_ground_size_peers" }, 401), 0], [() => json({ code: "57014", message: "canceling statement due to statement timeout" }, 503), 2 * 60_000]] as const) {
    let reads = 0;
    const r = await step({ override: (p) => (peered(p) ? (reads++, res()) : undefined) });
    try {
      assert.deepEqual(r.read("ground-peers"), { failed: true });
      assert.ok(r.logs.some((l) => /^build data: ground size peers not recorded \(turf_ground_size_peers: .*\); turf pages build without benchmarks/.test(l)));
      // Everything else as it would be.
      assert.equal((r.read("turf-pages") as BuildDatasets["turf-pages"]).keys.length, 300);
      assert.deepEqual(r.read("sport-bands"), r.s.bands);
      assert.ok(r.summary.ms <= most + 1000, `${r.summary.ms} ms`);
      assert.ok(most === 0 ? reads === 1 : reads > 5, `${reads} peer reads`);
    } finally {
      r.cleanup();
    }
  }
});

test("buildData: sport bands the step could not read come back as failed, never as none", () => {
  const dir = folder({ "sport-bands": FAILED });
  try {
    withEnv(building(dir), () => {
      assert.ok(isFailed(buildData("sport-bands")));
      assert.equal(buildData("turf-facts"), undefined);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("step: previews record no turf pages, and the sport bands as every build does", async () => {
  for (const env of [{ VERCEL_ENV: "preview" }, { VERCEL_ENV: "" }]) {
    let bandReads = 0;
    const lines: string[] = [];
    const log = console.log;
    console.log = (m: string) => void lines.push(m);
    try {
      const r = await step({ override: (_p, u) => void (u.searchParams.get("select") === "id,pricing_bands,price_owner_confirmed" && bandReads++) }, env);
      try {
        assert.equal(r.manifest.datasets["turf-pages"], undefined);
        assert.ok(!r.s.calls.includes("rpc/turf_page"));
        // No turf page prerenders: no benchmarks to read for them.
        assert.equal(r.manifest.datasets["ground-peers"], undefined);
        assert.ok(!r.s.calls.includes("rpc/turf_ground_size_peers"));
        // The court near-me pages prerender in previews and local builds too, and read the bands.
        assert.ok(r.manifest.datasets["sport-bands"]);
        assert.deepEqual(r.read("sport-bands"), r.s.bands);
        assert.equal(bandReads, 1);
        assert.match(lines.join("\n"), /; sport bands of 2 turfs; turf pages none \(not production\); /);
      } finally {
        r.cleanup();
      }
    } finally {
      console.log = log;
    }
  }
});

// ---------------------------------------------------------------- old id links (lib/turfIds.ts, lib/build/turfIds.ts)

const ID = (n: number) => `0000000${n}-aaaa-4bbb-8ccc-${String(n).padStart(12, "0")}`;

test("old id links: turfIdMap keeps turfs with a slug, ids lower-cased and sorted; a bad id, a missing, malformed or id-like slug and a repeat are left out", () => {
  const map = turfIdMap([
    { id: ID(3), slug: "turf-up-hinjewadi" },
    { id: ID(1).toUpperCase(), slug: "kick-off-arena-baner" },
    { id: ID(2), slug: null },
    { id: ID(4), slug: "" },
    { id: ID(5), slug: "Has Space" },
    { id: ID(6), slug: ID(9) },
    { id: "not-a-uuid", slug: "x" },
    { id: 7, slug: "number-id" },
    { id: ID(3), slug: "second-of-a-repeat" },
    { slug: "no-id" },
  ]);
  assert.deepEqual(map, { [ID(1)]: "kick-off-arena-baner", [ID(3)]: "turf-up-hinjewadi" });
  assert.deepEqual(Object.keys(map), [ID(1), ID(3)]);
  assert.ok(Object.keys(map).every((k) => TURF_UUID.test(k)));
});

test("old id links: turfIdTarget answers /turf/<uuid> in any case, that path only, ids in the map only", () => {
  const ids = new Map([[ID(1), "kick-off-arena-baner"]]);
  assert.equal(turfIdTarget(`/turf/${ID(1)}`, ids), "/turf/kick-off-arena-baner");
  assert.equal(turfIdTarget(`/turf/${ID(1).toUpperCase()}`, ids), "/turf/kick-off-arena-baner");
  // Not in the map (no slug, inactive, added after the build): the page answers.
  assert.equal(turfIdTarget(`/turf/${ID(2)}`, ids), null);
  for (const p of ["/turf/kick-off-arena-baner", `/turf/${ID(1)}/`, `/turf/${ID(1)}x`, `/turfs/${ID(1)}`, `/x/turf/${ID(1)}`, `/turf/${ID(1)}/reviews`, "/turf/", "/"]) {
    assert.equal(turfIdTarget(p, ids), null, p);
  }
});

test("old id links: the map comes from the step's own sitemap read (no request of its own), and the committed file comes back", async () => {
  const r = await step({}, { VERCEL_ENV: "preview" });
  const project = mkdtempSync(join(tmpdir(), "tapturf-ids-test-"));
  try {
    const calls = r.s.calls.length;
    const file = join(project, TURF_IDS_FILE);
    mkdirSync(join(project, "lib"), { recursive: true });
    // A map an earlier, killed build left: this build's restore still puts {} back.
    writeFileSync(file, `{"${ID(1)}":"left-by-a-killed-build"}\n`);
    const got = writeTurfIds(r.dir, project);
    // 1,200 active turfs in the fake database, turf 7 without a slug.
    assert.equal(got.count, 1199);
    assert.equal(got.leftOut, 0);
    const text = readFileSync(file, "utf8");
    const map = JSON.parse(text) as Record<string, string>;
    assert.equal(map[r.s.rows[0].id as string], "turf-0");
    assert.equal(map[r.s.rows[7].id as string], undefined);
    assert.equal(got.bytes, Buffer.byteLength(text));
    assert.equal(got.md5, turfIdsDigest(map));
    assert.equal(r.s.calls.length, calls, "no database request");
    got.restore();
    assert.equal(readFileSync(file, "utf8"), TURF_IDS_EMPTY);
    got.restore();
    assert.equal(readFileSync(file, "utf8"), TURF_IDS_EMPTY);
  } finally {
    rmSync(project, { recursive: true, force: true });
    r.cleanup();
  }
});

test("old id links: the md5 is the database's: id,slug lines in id order (the owner's query, run on Postgres for these rows)", () => {
  // select md5(string_agg(id::text || ',' || slug, E'\n' order by id)) from turfs where is_active and slug is not null,
  // run on PGlite with these four rows plus one without a slug and one switched off.
  const map = turfIdMap([
    { id: ID(3), slug: "turf-up-hinjewadi" },
    { id: "f0000000-aaaa-4bbb-8ccc-000000000001", slug: "last-by-id" },
    { id: ID(1), slug: "kick-off-arena-baner" },
    { id: "A0000000-AAAA-4BBB-8CCC-000000000001", slug: "a-before-f" },
  ]);
  assert.equal(turfIdsDigest(map), "d059d9cb8f77482afdec882df320cac1");
  // The order of the keys does not matter.
  assert.equal(turfIdsDigest(Object.fromEntries(Object.entries(map).reverse())), "d059d9cb8f77482afdec882df320cac1");
});

test("old id links: a build first puts {} back when a killed build left its map in the project", () => {
  const project = mkdtempSync(join(tmpdir(), "tapturf-ids-test-"));
  try {
    const file = join(project, TURF_IDS_FILE);
    mkdirSync(join(project, "lib"), { recursive: true });
    writeFileSync(file, `{"${ID(1)}":"left-by-a-killed-build"}\n`);
    assert.equal(resetTurfIds(project), true);
    assert.equal(readFileSync(file, "utf8"), TURF_IDS_EMPTY);
    assert.equal(resetTurfIds(project), false);
    assert.equal(readFileSync(file, "utf8"), TURF_IDS_EMPTY);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("old id links: the map in the project (the proxy's import) is the committed {}, not one a build left", () => {
  // npm run build writes the real map just before `next build` and puts {} back after; a
  // map here means a build was stopped before it could (the next npm run build puts {} back).
  assert.equal(readFileSync(join(process.cwd(), TURF_IDS_FILE), "utf8"), TURF_IDS_EMPTY);
  assert.deepEqual(JSON.parse(TURF_IDS_EMPTY), {});
});

// ---------------------------------------------------------------- error pages in every app function

/** A .next folder as Next 16 with Turbopack writes it: the pages router's error pages, app traces, shared chunks. */
function distFixture(manifest: Record<string, string> = { "/500": "pages/500.js", "/_app": "pages/_app.js", "/_error": "pages/_error.js", "/_document": "pages/_document.js", "/404": "pages/404.html" }) {
  const root = mkdtempSync(join(tmpdir(), "tapturf-errpages-test-"));
  const dist = join(root, ".next");
  const put = (rel: string, text = "x") => {
    const file = join(root, rel);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, text);
  };
  const trace = (rel: string, files: string[]) => put(rel, JSON.stringify({ version: 1, files }));
  put(".next/server/pages-manifest.json", JSON.stringify(manifest));
  for (const page of ["500", "_app", "_error", "_document"]) put(`.next/server/pages/${page}.js`, `module.exports = "${page}"`);
  put(".next/server/pages/404.html", "<html>404</html>");
  put(".next/server/pages/500.html", "<html>500</html>");
  put(".next/server/pages/500/react-loadable-manifest.json", "{}");
  for (const c of ["err500", "shared", "turf", "home"]) put(`.next/server/chunks/ssr/${c}.js`, `/* ${c} */`);
  put("node_modules/react/index.js", "module.exports = {}");
  // The 500 page's own chunk and loadable manifest, a package, and a file the trace lists that is not there.
  trace(".next/server/pages/500.js.nft.json", ["../chunks/ssr/err500.js", "./500/react-loadable-manifest.json", "../../../node_modules/react/index.js", "../chunks/ssr/gone.js"]);
  trace(".next/server/pages/_error.js.nft.json", ["../chunks/ssr/shared.js", "../../../node_modules/react/index.js"]);
  trace(".next/server/pages/_app.js.nft.json", []);
  trace(".next/server/pages/_document.js.nft.json", ["../chunks/ssr/shared.js"]);
  trace(".next/server/app/turf/[id]/page.js.nft.json", ["../../../chunks/ssr/turf.js", "../../../chunks/ssr/shared.js"]);
  trace(".next/server/app/api/cities/route.js.nft.json", ["../../../chunks/ssr/shared.js"]);
  trace(".next/server/app/page.js.nft.json", ["../chunks/ssr/home.js"]);
  put(".next/server/app/turf/[id]/page.js", "/* not a trace */");
  return { root, dist, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const traceOf = (file: string) => JSON.parse(readFileSync(file, "utf8")) as { version: number; files: string[] };

test("error pages: every app trace (pages and route handlers) gains the 500 page, its chunk and loadable manifest, and _error, _app, _document", () => {
  const f = distFixture();
  try {
    const turf = join(f.dist, "server/app/turf/[id]/page.js.nft.json");
    const got = includeErrorPages(f.dist);
    assert.equal(got.traces, 3);
    // 500.js, err500.js, its loadable manifest, react; _error.js, shared.js; _app.js; _document.js. Not gone.js, not 500.html.
    assert.equal(got.files, 8);
    assert.ok(got.added > 0);
    const t = traceOf(turf);
    assert.equal(t.version, 1);
    // What the trace listed comes first, as it was; nothing twice.
    assert.deepEqual(t.files.slice(0, 2), ["../../../chunks/ssr/turf.js", "../../../chunks/ssr/shared.js"]);
    assert.equal(new Set(t.files).size, t.files.length);
    for (const p of [
      "../../../pages/500.js",
      "../../../chunks/ssr/err500.js",
      "../../../pages/500/react-loadable-manifest.json",
      "../../../pages/_error.js",
      "../../../pages/_app.js",
      "../../../pages/_document.js",
      "../../../../../node_modules/react/index.js",
    ]) {
      assert.ok(t.files.includes(p), `${p} in the turf page's trace`);
    }
    assert.ok(!t.files.some((p) => p.endsWith("gone.js")), "only files that exist (Vercel stats each one)");
    assert.ok(traceOf(join(f.dist, "server/app/page.js.nft.json")).files.includes("../pages/500.js"));
    assert.ok(traceOf(join(f.dist, "server/app/api/cities/route.js.nft.json")).files.includes("../../../pages/500.js"));
    // Every path in every trace names a file that is there, from that trace's folder.
    for (const file of appTraceFiles(f.dist)) for (const p of traceOf(file).files) assert.ok(existsSync(join(file, "..", p)), `${p} from ${file}`);
    // A second run (a build run again on the same .next) adds nothing.
    const before = readFileSync(turf, "utf8");
    assert.equal(includeErrorPages(f.dist).added, 0);
    assert.equal(readFileSync(turf, "utf8"), before);
  } finally {
    f.cleanup();
  }
});

test("error pages: the files come from the pages manifest and each page's own trace; a static page is its .html", () => {
  const f = distFixture({ "/500": "pages/500.html", "/_error": "pages/_error.js" });
  try {
    const files = errorPageFiles(f.dist).map((p) => p.slice(f.root.length + 1).split("\\").join("/"));
    assert.deepEqual(files, [".next/server/chunks/ssr/shared.js", ".next/server/pages/500.html", ".next/server/pages/_error.js", "node_modules/react/index.js"]);
    assert.deepEqual(ERROR_PAGES, ["/500", "/_error", "/_app", "/_document"]);
  } finally {
    f.cleanup();
  }
});

test("error pages: no pages router, nothing to do; a module the manifest names that is missing, or has no trace, fails the build", () => {
  const f = distFixture();
  try {
    rmSync(join(f.dist, "server/pages-manifest.json"));
    assert.deepEqual(includeErrorPages(f.dist), { traces: 0, files: 0, bytes: 0, added: 0 });
  } finally {
    f.cleanup();
  }
  const g = distFixture();
  try {
    rmSync(join(g.dist, "server/pages/500.js"));
    assert.throws(() => includeErrorPages(g.dist), /pages\/500\.js for \/500, and it is not in/);
  } finally {
    g.cleanup();
  }
  const h = distFixture();
  try {
    rmSync(join(h.dist, "server/pages/500.js.nft.json"));
    assert.throws(() => includeErrorPages(h.dist), /pages\/500\.js \(\/500\) has no trace file/);
  } finally {
    h.cleanup();
  }
});

test("error pages: npm run build (what Vercel runs) adds them after every next build that passed, with the build-data step or without", () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { scripts: Record<string, string> };
  assert.match(pkg.scripts.build, /node \.test-out\/build-data\/scripts\/build\.js$/);
  const src = readFileSync(join(process.cwd(), "scripts/build.ts"), "utf8");
  const start = src.indexOf("async function nextBuild(");
  const end = src.indexOf("\nfunction runNextBuild(", start);
  assert.ok(start >= 0 && end > start, "scripts/build.ts has nextBuild, then runNextBuild");
  assert.match(
    src.slice(start, end),
    /const code = await runNextBuild\(env, args\);\n\s+if \(code !== 0\) return code;\n\s+const done = includeErrorPages\(join\(process\.cwd\(\), "\.next"\)\);/,
  );
  // `next build` starts only there: both paths (TAPTURF_BUILD_DATA=off and the step) call nextBuild.
  assert.equal(src.match(/runNextBuild\(/g)?.length, 2, "runNextBuild is defined once and called once, by nextBuild");
  assert.equal(src.match(/(?:await|return) nextBuild\(/g)?.length, 2);
  assert.equal(src.match(/spawn\(/g)?.length, 1, "one place starts next build");
});
