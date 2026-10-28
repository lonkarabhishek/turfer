import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { MANAGERS_SHOWN, NO_MANAGERS, managedByParts, managedByText, managerNote, readTurfManagers, shapeTurfManagers } from "./managers";

const m = (...us: string[]) => ({ list: us.map((u) => ({ u, v: false })), more: 0 });
const quiet = () => {};

test("managers: the line's wording", () => {
  assert.equal(managedByText(NO_MANAGERS), null, "nobody: no line");
  assert.equal(managedByText(m("asha")), "Managed by @asha");
  assert.equal(managedByText(m("asha", "ravi")), "Managed by @asha and @ravi");
  assert.equal(managedByText(m("asha", "ravi", "kiran")), "Managed by @asha, @ravi and @kiran");
  assert.equal(managedByText({ ...m("asha", "ravi", "kiran"), more: 2 }), "Managed by @asha, @ravi, @kiran and 2 more");
  assert.equal(managedByText({ ...m("asha"), more: 1 }), "Managed by @asha and 1 more");
  assert.equal(managedByText({ list: [], more: 4 }), null, "a count alone is no line");
});

test("managers: the tick stays with its name", () => {
  const parts = managedByParts({ list: [{ u: "asha", v: true }, { u: "ravi", v: false }], more: 0 });
  assert.deepEqual(parts, [{ kind: "user", u: "asha", v: true }, { kind: "text", text: " and " }, { kind: "user", u: "ravi", v: false }]);
});

test("managers: the answer is checked", () => {
  assert.deepEqual(shapeTurfManagers(null), NO_MANAGERS);
  assert.deepEqual(shapeTurfManagers("x"), NO_MANAGERS);
  assert.deepEqual(shapeTurfManagers({ managers: "x", more: 3 }), NO_MANAGERS);
  assert.deepEqual(shapeTurfManagers({ found: false }), NO_MANAGERS);
  // Only usernames in the database's own shape; each once; v only when true.
  assert.deepEqual(
    shapeTurfManagers({ managers: [{ u: "Asha" }, { u: "<b>x</b>" }, { u: "ab" }, { u: "a".repeat(21) }, { u: "ravi", v: "true" }, { u: "ravi", v: true }, null, 7], more: 0 }),
    { list: [{ u: "ravi", v: false }], more: 0 },
  );
  // Never more than MANAGERS_SHOWN names: the rest go into more.
  const five = shapeTurfManagers({ managers: ["aaa", "bbb", "ccc", "ddd", "eee"].map((u) => ({ u, v: false })), more: 1 });
  assert.equal(five.list.length, MANAGERS_SHOWN);
  assert.equal(five.more, 3);
  assert.equal(shapeTurfManagers({ managers: [{ u: "asha" }], more: -2 }).more, 0);
  assert.equal(shapeTurfManagers({ managers: [{ u: "asha" }], more: 1.5 }).more, 0);
  // Nothing but u and v comes through, whatever else is sent.
  assert.deepEqual(shapeTurfManagers({ managers: [{ u: "asha", v: true, id: "x", name: "Asha", phone: "+91" }] }), { list: [{ u: "asha", v: true }], more: 0 });
});

test("managers: the owner's note on myTapturf", () => {
  assert.deepEqual(managerNote({ username: null, taggable: undefined, shown: null }), { kind: "pick" }, "no username: pick one");
  assert.deepEqual(managerNote({ username: "", taggable: true, shown: ["asha"] }), { kind: "pick" });
  assert.deepEqual(managerNote({ username: "asha", taggable: false, shown: null }), { kind: "hidden" }, "tagging off: hidden");
  assert.deepEqual(managerNote({ username: "asha", taggable: false, shown: ["asha"] }), { kind: "hidden" }, "the switch wins over a stale read");
  assert.deepEqual(managerNote({ username: "asha", taggable: true, shown: ["ravi", "asha"] }), { kind: "shown", u: "asha" });
  assert.equal(managerNote({ username: "asha", taggable: undefined, shown: null }), null, "not read: nothing claimed");
  assert.equal(managerNote({ username: "admin", taggable: true, shown: ["asha"] }), null, "someone not on the line (the TapTurf owner): nothing");
  assert.equal(managerNote({ username: "asha", taggable: true, shown: [] }), null);
});

// The read: the real client over a stubbed database. Never throws.
const db = (fetchImpl: typeof fetch) =>
  createClient("http://db.test", "anon", { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: fetchImpl } });
const answer = (status: number, body: string): typeof fetch => async () =>
  new Response(body, { status, headers: { "content-type": "application/json" } });

test("managers read: an answer comes back shaped", async () => {
  const out = await readTurfManagers(db(answer(200, JSON.stringify({ managers: [{ u: "asha", v: true }], more: 0 }))), "t1", { warn: quiet });
  assert.deepEqual(out, { list: [{ u: "asha", v: true }], more: 0 });
});

test("managers read: a missing function, an error or a hang hides the line", async () => {
  const missing = JSON.stringify({ code: "PGRST202", message: "Could not find the function public.turf_managers(p_turf_id) in the schema cache" });
  assert.deepEqual(await readTurfManagers(db(answer(404, missing)), "t1", { warn: quiet }), NO_MANAGERS);
  assert.deepEqual(await readTurfManagers(db(answer(500, JSON.stringify({ code: "57014", message: "timeout" }))), "t1", { warn: quiet }), NO_MANAGERS);
  assert.deepEqual(await readTurfManagers(db(answer(522, "<html>522</html>")), "t1", { warn: quiet }), NO_MANAGERS);
  const hang: typeof fetch = (_i, init) => new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
  const keepAlive = setTimeout(() => {}, 5000);
  assert.deepEqual(await readTurfManagers(db(hang), "t1", { timeoutMs: 20, warn: quiet }), NO_MANAGERS);
  clearTimeout(keepAlive);
  const boom: typeof fetch = async () => { throw new TypeError("fetch failed"); };
  assert.deepEqual(await readTurfManagers(db(boom), "t1", { warn: quiet }), NO_MANAGERS);
});

test("managers read: a failure for now shortens the page's life; a missing function and a good answer do not", async () => {
  const run = async (f: typeof fetch, opts: { timeoutMs?: number } = {}) => {
    let marked = 0;
    const out = await readTurfManagers(db(f), "t1", { ...opts, warn: quiet, failedForNow: async () => void marked++ });
    return { out, marked };
  };
  const good = JSON.stringify({ managers: [{ u: "asha", v: false }], more: 0 });
  const missing = JSON.stringify({ code: "PGRST202", message: "Could not find the function public.turf_managers(p_turf_id) in the schema cache" });
  assert.deepEqual(await run(answer(200, good)), { out: { list: [{ u: "asha", v: false }], more: 0 }, marked: 0 }, "a good answer: the day-long copy");
  assert.deepEqual(await run(answer(404, missing)), { out: NO_MANAGERS, marked: 0 }, "before the migration: no line, kept as usual (the migration queues the page)");
  // Never an older answer: a rebuild after a revoke or "tagging off" must not bring the name back.
  assert.deepEqual(await run(answer(500, JSON.stringify({ code: "57014", message: "timeout" }))), { out: NO_MANAGERS, marked: 1 }, "a statement timeout");
  assert.deepEqual(await run(answer(522, "<html>522</html>")), { out: NO_MANAGERS, marked: 1 }, "a gateway error");
  const hang: typeof fetch = (_i, init) => new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
  const keepAlive = setTimeout(() => {}, 5000);
  assert.deepEqual(await run(hang, { timeoutMs: 20 }), { out: NO_MANAGERS, marked: 1 }, "the timeout");
  clearTimeout(keepAlive);
  const boom: typeof fetch = async () => { throw new TypeError("fetch failed"); };
  assert.deepEqual(await run(boom), { out: NO_MANAGERS, marked: 1 }, "the network");
  // The mark itself failing never fails the read.
  const out = await readTurfManagers(db(boom), "t1", { warn: quiet, failedForNow: async () => { throw new Error("no cache"); } });
  assert.deepEqual(out, NO_MANAGERS);
});
