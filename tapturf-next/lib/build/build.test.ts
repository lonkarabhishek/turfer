import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildData, FIRST_LIFE_S, firstLifeOf, manifestProblem, MANIFEST, MANIFEST_MAX_AGE_MS, recorded, type BuildDatasets, type Manifest } from "./data";
import { buildDataDir } from "./env";
import { backoffMs, createPatientFetch, readEach, retryAfterMs } from "./patient";
import { CARD_COLUMNS, livePicks, topTurfKeys, type TrendingRow } from "./reads";
import { buildTripwire, createGuardedFetch } from "../supabase/guard";
import { unusable, type ListMeta } from "../cache/rowStore";
import { runBuildData, StepFailed, UNREACHABLE } from "../../scripts/build-data";

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
  /** Answers before the defaults (an outage, a rebuild...). */
  override?: (path: string, u: URL, body: Row, s: FakeState) => Response | Promise<Response> | undefined;
  calls: string[];
};

function fakeDb(over: Partial<FakeState> = {}) {
  const rows: Row[] = Array.from({ length: 1200 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    slug: i === 7 ? null : `turf-${i}`,
    city: i % 2 ? "pune" : "nashik",
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
      case "/rest/v1/rpc/turf_managers":
        return json(s.managers[String(body.p_turf_id)] ?? { managers: [{ u: "owner_one", v: true }], more: 0 });
      default:
        return json({ message: `no route ${p}` }, 404);
    }
  }) as typeof fetch;
  return { s, fetchImpl };
}

async function step(over: Partial<FakeState> = {}, env: Record<string, string> = {}) {
  const { s, fetchImpl } = fakeDb(over);
  const { c, now, sleep } = clock();
  const logs: string[] = [];
  const dir = mkdtempSync(join(tmpdir(), "tapturf-step-test-"));
  const read = (name: string) => JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));
  try {
    const run = runBuildData(dir, { env: { NEXT_PUBLIC_SUPABASE_URL: DB, NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", VERCEL_ENV: "production", ...env }, fetchImpl, now, sleep, log: (m) => logs.push(m) });
    const summary = await run;
    return { s, c, logs, summary, manifest: read("manifest") as Manifest, list: read("list") as BuildDatasets["list"], read, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
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
    assert.deepEqual(Object.keys(r.manifest.datasets).sort(), ["cities", "games", "list", "sitemap", "trending", "turf-facts", "turf-pages"]);
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
    assert.equal(r.summary.moved, false);
  } finally {
    r.cleanup();
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

test("step: previews record no turf pages", async () => {
  const r = await step({}, { VERCEL_ENV: "preview" });
  try {
    assert.equal(r.manifest.datasets["turf-pages"], undefined);
    assert.ok(!r.s.calls.includes("rpc/turf_page"));
  } finally {
    r.cleanup();
  }
});
