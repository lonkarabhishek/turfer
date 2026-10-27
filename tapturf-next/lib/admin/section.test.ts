import { test } from "node:test";
import assert from "node:assert/strict";
import {
  READ_TIMEOUT_MS,
  ReadFailed,
  both,
  countOf,
  createLimiter,
  createReadContext,
  firstFailure,
  mapSection,
  readAllPages,
  reasonOf,
  reasonText,
  rowsOf,
  settle,
} from "./section";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("reasonOf: what PostgREST, supabase-js and fetch failures mean for the page", () => {
  assert.equal(reasonOf({ code: "42501", message: "not allowed" }), "not_allowed");
  assert.equal(reasonOf({ code: "PGRST202", message: "Could not find the function" }), "not_set_up");
  assert.equal(reasonOf({ code: "42883", message: "function does not exist" }), "not_set_up");
  // 27 Oct: the turfs page read was cancelled by the statement timeout.
  assert.equal(reasonOf({ code: "57014", message: "canceling statement due to statement timeout" }), "timeout");
  // supabase-js turns a failed fetch into an error whose message starts with the error's name.
  assert.equal(reasonOf({ code: "", message: "AbortError: This operation was aborted" }), "timeout");
  assert.equal(reasonOf({ code: "", message: "TimeoutError: The operation timed out." }), "timeout");
  assert.equal(reasonOf({ code: "", message: "CircuitOpenError: Database circuit open: failing fast" }), "timeout");
  assert.equal(reasonOf(Object.assign(new Error("x"), { name: "AbortError" })), "timeout");
  assert.equal(reasonOf(new ReadFailed("not_set_up", "x")), "not_set_up");
  assert.equal(reasonOf({ code: "PGRST116", message: "JSON object requested" }), "error");
  assert.equal(reasonOf(new Error("boom")), "error");
  assert.equal(reasonOf(null), "error");
  assert.equal(reasonOf("statement timeout"), "timeout");
});

test("rowsOf, countOf: an error or a missing count is a ReadFailed, never [] or 0", () => {
  assert.deepEqual(rowsOf({ data: [1, 2], error: null }, "t"), [1, 2]);
  assert.deepEqual(rowsOf({ data: null, error: null }, "t"), []);
  assert.throws(() => rowsOf({ data: null, error: { code: "57014", message: "timeout" } }, "turfs"), (e: unknown) => e instanceof ReadFailed && e.reason === "timeout" && e.code === "57014" && /turfs/.test(e.message));
  assert.equal(countOf({ count: 3466, error: null }, "t"), 3466);
  assert.equal(countOf({ count: 0, error: null }, "t"), 0);
  // The 27 Oct "Active turfs 0": the head count failed and the page showed 0.
  assert.throws(() => countOf({ count: null, error: { code: "57014", message: "x" } }, "active turfs"), (e: unknown) => e instanceof ReadFailed && e.reason === "timeout");
  assert.throws(() => countOf({ count: null, error: null }, "active turfs"), (e: unknown) => e instanceof ReadFailed && e.reason === "error");
});

test("readAllPages: every page until a short one; a failed page fails the whole read", async () => {
  const rows = Array.from({ length: 2500 }, (_, i) => i);
  const asked: [number, number][] = [];
  const all = await readAllPages(async (from, to) => (asked.push([from, to]), { data: rows.slice(from, to + 1), error: null }), "t");
  assert.equal(all.length, 2500);
  assert.deepEqual(asked, [[0, 999], [1000, 1999], [2000, 2999]]);
  // An exact multiple asks once more and stops on the empty page.
  const two = await readAllPages(async (from, to) => ({ data: rows.slice(0, 2000).slice(from, to + 1), error: null }), "t");
  assert.equal(two.length, 2000);
  let n = 0;
  await assert.rejects(
    readAllPages(async (from, to) => (n++ === 1 ? { data: null, error: { code: "57014", message: "statement timeout" } } : { data: rows.slice(from, to + 1), error: null }), "turfs"),
    (e: unknown) => e instanceof ReadFailed && e.reason === "timeout" && /rows 1000/.test(e.message),
  );
});

test("settle: the data, or why it failed, and never a throw", async () => {
  const logs: string[] = [];
  const log = (m: string) => logs.push(m);
  assert.deepEqual(await settle("ok", async () => 42, { log }), { ok: true, data: 42 });
  assert.deepEqual(await settle("throws", async () => { throw new Error("boom"); }, { log }), { ok: false, reason: "error" });
  assert.deepEqual(await settle("denied", async () => { throw { code: "42501", message: "not allowed" }; }, { log }), { ok: false, reason: "not_allowed" });
  assert.deepEqual(await settle("sync throw", () => { throw new Error("sync"); }, { log }), { ok: false, reason: "error" });
  // A function that isn't on the database yet is expected: no log line for it.
  assert.deepEqual(await settle("missing", async () => { throw new ReadFailed("not_set_up", "PGRST202"); }, { log }), { ok: false, reason: "not_set_up" });
  assert.equal(logs.length, 3);
  assert.match(logs[0], /admin read throws failed \(error\)/);
  assert.ok(logs.every((l) => !/missing/.test(l)));
});

test("settle: a slow read times out, its request is aborted, and the page moves on", async () => {
  let aborted = false;
  const t0 = Date.now();
  const s = await settle(
    "slow",
    (signal) =>
      new Promise((resolve) => {
        signal.addEventListener("abort", () => (aborted = true));
        setTimeout(() => resolve("late"), 500);
      }),
    { timeoutMs: 30, log: () => {} },
  );
  assert.deepEqual(s, { ok: false, reason: "timeout" });
  assert.ok(aborted, "the read's signal fired");
  assert.ok(Date.now() - t0 < 400, "settled at the timeout, not when the read ended");
  assert.equal(READ_TIMEOUT_MS < 8000, true, "under the authenticated role's 8 s statement timeout");
});

test("settle with a read context: at most N at once, the timeout starts when the read does, and nothing starts after the deadline", async () => {
  let t = 0;
  const ctx = createReadContext({ max: 2, budgetMs: 1000, now: () => t });
  let active = 0;
  let peak = 0;
  const read = (ms: number) => async () => {
    active++;
    peak = Math.max(peak, active);
    await sleep(ms);
    active--;
    return ms;
  };
  // Four reads of 30 ms with a 50 ms timeout each: queued ones don't time out while they wait.
  const out = await Promise.all([1, 2, 3, 4].map(() => settle("r", read(30), { ctx, timeoutMs: 50, log: () => {} })));
  assert.deepEqual(out.map((s) => s.ok), [true, true, true, true]);
  assert.equal(peak, 2);
  // Past the render's deadline a read doesn't start: it fails at once.
  t = 1001;
  let started = false;
  const late = await settle("late", async () => ((started = true), 1), { ctx, log: () => {} });
  assert.deepEqual(late, { ok: false, reason: "timeout" });
  assert.equal(started, false);
});

test("settle: a read's timeout never runs past the render's deadline", async () => {
  const start = Date.now();
  const ctx = createReadContext({ max: 4, budgetMs: 40 });
  const s = await settle("long", (signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))), { ctx, timeoutMs: 5000, log: () => {} });
  assert.deepEqual(s, { ok: false, reason: "timeout" });
  assert.ok(Date.now() - start < 1000);
});

test("createLimiter: runs in order, at most max at once, and a failing task frees its slot", async () => {
  const limit = createLimiter(2);
  const order: string[] = [];
  let active = 0;
  let peak = 0;
  const task = (name: string, ms: number, fail = false) => async () => {
    active++;
    peak = Math.max(peak, active);
    order.push(name);
    await sleep(ms);
    active--;
    if (fail) throw new Error(name);
    return name;
  };
  const results = await Promise.allSettled([limit(task("a", 20, true)), limit(task("b", 10)), limit(task("c", 5)), limit(task("d", 5))]);
  assert.deepEqual(order, ["a", "b", "c", "d"]);
  assert.equal(peak, 2);
  assert.deepEqual(results.map((r) => r.status), ["rejected", "fulfilled", "fulfilled", "fulfilled"]);
});

test("both, mapSection, firstFailure, reasonText", () => {
  const a = { ok: true as const, data: 1 };
  const b = { ok: true as const, data: "x" };
  const f = { ok: false as const, reason: "timeout" as const };
  assert.deepEqual(both(a, b), { ok: true, data: [1, "x"] });
  assert.deepEqual(both(a, f), f);
  assert.deepEqual(both(f, { ok: false, reason: "error" }), f);
  assert.deepEqual(mapSection(a, (n) => n + 1), { ok: true, data: 2 });
  assert.deepEqual(mapSection(f, (n: number) => n + 1), f);
  assert.equal(firstFailure(a, b), null);
  assert.equal(firstFailure(a, f), "timeout");
  assert.equal(reasonText("timeout"), "Took too long to load");
  assert.equal(reasonText("error"), "Couldn't load");
  assert.equal(reasonText("not_set_up"), "Not set up in the database yet");
});
