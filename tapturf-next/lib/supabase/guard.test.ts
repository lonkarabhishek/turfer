import { test } from "node:test";
import assert from "node:assert/strict";
import { CircuitOpenError, createGuardedFetch, defaultGuardOptions } from "./guard";

function harness(statuses: number[] = []) {
  let t = 0;
  const calls: string[] = [];
  const logs: string[] = [];
  const queue = [...statuses];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response("{}", { status: queue.shift() ?? 200 });
  }) as typeof fetch;
  const guarded = createGuardedFetch({ fetchImpl, now: () => t, log: (m) => logs.push(m), threshold: 5, windowMs: 30_000, openMs: 30_000, timeoutMs: 50 });
  return { guarded, calls, logs, tick: (ms: number) => (t += ms) };
}

test("passes responses through, and 4xx never counts as a database failure", async () => {
  const h = harness([404, 400, 401, 404, 400, 409]);
  for (let i = 0; i < 6; i++) await h.guarded("https://db/rest/v1/turfs");
  assert.equal((await h.guarded("https://db/rest/v1/turfs")).status, 200);
  assert.equal(h.calls.length, 7);
  assert.deepEqual(h.logs, []);
});

test("five 5xx within 30 s open the breaker: later calls fail without reaching the database", async () => {
  const h = harness([500, 503, 500, 502, 500]);
  for (let i = 0; i < 5; i++) {
    await h.guarded("https://db/x");
    h.tick(1000);
  }
  assert.deepEqual(h.logs, ["supabase breaker: open"]);
  await assert.rejects(h.guarded("https://db/x"), CircuitOpenError);
  assert.equal(h.calls.length, 5);
});

test("successes in between do not reset the count (light queries pass while heavy ones time out)", async () => {
  const h = harness([500, 200, 500, 200, 500, 200, 500, 200, 500]);
  for (let i = 0; i < 9; i++) await h.guarded("https://db/x");
  await assert.rejects(h.guarded("https://db/x"), CircuitOpenError);
});

test("failures spread wider than the window do not open it", async () => {
  const h = harness([500, 500, 500, 500, 500, 500]);
  for (let i = 0; i < 6; i++) {
    await h.guarded("https://db/x");
    h.tick(10_000);
  }
  assert.deepEqual(h.logs, []);
  assert.equal((await h.guarded("https://db/x")).status, 200);
});

test("after 30 s one probe goes through; while it runs others still fail fast; success closes", async () => {
  let release: () => void = () => {};
  let t = 0;
  let n = 0;
  const logs: string[] = [];
  const fetchImpl = (async () => {
    n++;
    if (n <= 5) return new Response("", { status: 500 });
    if (n === 6) await new Promise<void>((r) => (release = r));
    return new Response("", { status: 200 });
  }) as typeof fetch;
  const g = createGuardedFetch({ fetchImpl, now: () => t, log: (m) => logs.push(m), timeoutMs: 10_000 });
  for (let i = 0; i < 5; i++) await g("https://db/x");
  await assert.rejects(g("https://db/x"), CircuitOpenError);
  t += 30_000;
  const probe = g("https://db/x");
  await assert.rejects(g("https://db/x"), CircuitOpenError);
  release();
  assert.equal((await probe).status, 200);
  assert.equal((await g("https://db/x")).status, 200);
  assert.deepEqual(logs, ["supabase breaker: open", "supabase breaker: closed"]);
});

test("a failed probe keeps it open for another period", async () => {
  const h = harness([500, 500, 500, 500, 500, 500]);
  for (let i = 0; i < 5; i++) await h.guarded("https://db/x");
  h.tick(30_000);
  await h.guarded("https://db/x"); // the probe: 500
  await assert.rejects(h.guarded("https://db/x"), CircuitOpenError);
  h.tick(29_000);
  await assert.rejects(h.guarded("https://db/x"), CircuitOpenError);
  h.tick(1_000);
  assert.equal((await h.guarded("https://db/x")).status, 200);
  assert.deepEqual(h.logs, ["supabase breaker: open", "supabase breaker: probe failed, staying open", "supabase breaker: closed"]);
});

test("a request that hangs is abandoned after the timeout and counts as a failure", async () => {
  const logs: string[] = [];
  const hang = ((_: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)))) as typeof fetch;
  const g = createGuardedFetch({ fetchImpl: hang, timeoutMs: 20, threshold: 2, log: (m) => logs.push(m) });
  // AbortSignal.timeout's timer does not hold the process open (a real
  // request's socket does), so keep the test alive until it fires.
  const keepAlive = setTimeout(() => {}, 5000);
  const t0 = Date.now();
  await assert.rejects(g("https://db/x"));
  assert.ok(Date.now() - t0 < 1000);
  await assert.rejects(g("https://db/x"));
  assert.deepEqual(logs, ["supabase breaker: open"]);
  await assert.rejects(g("https://db/x"), CircuitOpenError);
  clearTimeout(keepAlive);
});

test("the caller's own abort is passed on and does not count", async () => {
  const logs: string[] = [];
  const hang = ((_: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as typeof fetch;
  const g = createGuardedFetch({ fetchImpl: hang, timeoutMs: 5000, threshold: 1, log: (m) => logs.push(m) });
  const ctl = new AbortController();
  const p = g("https://db/x", { signal: ctl.signal });
  ctl.abort();
  await assert.rejects(p);
  assert.deepEqual(logs, []);
});

// Requests already in flight when the breaker opens: only the probe may
// change its state (review of the 20 Oct guard).
function gated() {
  let t = 0;
  const logs: string[] = [];
  const held = new Map<string, (status: number) => void>();
  let calls = 0;
  const fetchImpl = (async (input: RequestInfo | URL) => {
    calls++;
    const url = String(input);
    if (url.includes("slow")) return new Response("", { status: await new Promise<number>((r) => held.set(url, r)) });
    return new Response("", { status: url.includes("bad") ? 500 : 200 });
  }) as typeof fetch;
  const g = createGuardedFetch({ fetchImpl, now: () => t, log: (m) => logs.push(m), timeoutMs: 60_000 });
  return { g, logs, held, calls: () => calls, tick: (ms: number) => (t += ms) };
}

test("a 200 that started before the breaker opened does not close it", async () => {
  const h = gated();
  const light = h.g("https://db/slow-light");
  for (let i = 0; i < 5; i++) await h.g("https://db/bad");
  assert.deepEqual(h.logs, ["supabase breaker: open"]);
  h.held.get("https://db/slow-light")!(200);
  assert.equal((await light).status, 200);
  await assert.rejects(h.g("https://db/heavy"), CircuitOpenError);
  assert.equal(h.calls(), 6);
  assert.deepEqual(h.logs, ["supabase breaker: open"]);
});

test("a late failure from before the breaker opened is not a failed probe, and no second probe starts", async () => {
  const h = gated();
  const late = h.g("https://db/slow-late");
  for (let i = 0; i < 5; i++) await h.g("https://db/bad");
  h.tick(30_000);
  const probe = h.g("https://db/slow-probe");
  h.held.get("https://db/slow-late")!(500);
  assert.equal((await late).status, 500);
  // The probe is still running: everyone else keeps failing fast.
  await assert.rejects(h.g("https://db/x"), CircuitOpenError);
  h.held.get("https://db/slow-probe")!(200);
  assert.equal((await probe).status, 200);
  assert.equal((await h.g("https://db/x")).status, 200);
  assert.deepEqual(h.logs, ["supabase breaker: open", "supabase breaker: closed"]);
});

test("a caller abort on a request from before the breaker opened leaves the probe in charge", async () => {
  let t = 0;
  const logs: string[] = [];
  let n = 0;
  let releaseProbe: () => void = () => {};
  const fetchImpl = ((_: RequestInfo | URL, init?: RequestInit) => {
    n++;
    if (n === 1) return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    if (n <= 6) return Promise.resolve(new Response("", { status: 500 }));
    if (n === 7) return new Promise<Response>((r) => (releaseProbe = () => r(new Response("", { status: 200 }))));
    return Promise.resolve(new Response("", { status: 200 }));
  }) as typeof fetch;
  const g = createGuardedFetch({ fetchImpl, now: () => t, log: (m) => logs.push(m), timeoutMs: 60_000 });
  const ctl = new AbortController();
  const early = g("https://db/early", { signal: ctl.signal });
  for (let i = 0; i < 5; i++) await g("https://db/bad");
  t += 30_000;
  const probe = g("https://db/probe");
  ctl.abort();
  await assert.rejects(early);
  await assert.rejects(g("https://db/x"), CircuitOpenError);
  releaseProbe();
  assert.equal((await probe).status, 200);
  assert.deepEqual(logs, ["supabase breaker: open", "supabase breaker: closed"]);
});

test("next build gets no breaker (a blip must not fail the deploy), other phases do", () => {
  assert.deepEqual(defaultGuardOptions({ NEXT_PHASE: "phase-production-build" }), { threshold: Infinity });
  assert.deepEqual(defaultGuardOptions({ NEXT_PHASE: "phase-production-server" }), {});
  assert.deepEqual(defaultGuardOptions({}), {});
});

test("with the build options, failures never open it", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return new Response("", { status: 500 });
  }) as typeof fetch;
  const logs: string[] = [];
  const g = createGuardedFetch({ ...defaultGuardOptions({ NEXT_PHASE: "phase-production-build" }), fetchImpl, log: (m) => logs.push(m) });
  for (let i = 0; i < 20; i++) assert.equal((await g("https://db/x")).status, 500);
  assert.equal(calls, 20);
  assert.deepEqual(logs, []);
});
