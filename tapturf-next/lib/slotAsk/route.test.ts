import { test } from "node:test";
import assert from "node:assert/strict";
import { ASKS_PER_NET, postSlotAsk } from "./route";
import { ASK_MINUTES, DRAFT_MAX_MS, askBody, askedTime, isDate, parseAsk, readDraft, sportWord, type SlotAsk } from "./ask";
import { installNet, net, phoneToken, req, testEnv } from "../account/testkit";

testEnv();
installNet();

// POST /api/slot-ask, and what an ask is. Made-up turfs.

const TURF = "eeeeeeee-eeee-4eee-8eee-000000000001";
const PHONE_UA = "Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const page = { "user-agent": PHONE_UA, "sec-fetch-site": "same-origin" };
const body = (o: Record<string, unknown> = {}) => ({ turf: TURF, date: "2026-11-21", hour: 19, minutes: 60, signed: true, ...o });
const post = (b: unknown, o: { headers?: Record<string, string>; token?: string; limit?: (net: string) => boolean } = {}) =>
  postSlotAsk(req("/api/slot-ask", { method: "POST", body: b, token: o.token, headers: { ...page, ...o.headers } }), { limit: o.limit });

function reset(answer: unknown = { r: "ok" }) {
  net.reset();
  net.rpc.slot_ask_add = () => answer;
}
const added = () => net.calls("slot_ask_add").map((c) => c.args);
const ask = (o: Partial<SlotAsk> = {}): SlotAsk => ({ turf: TURF, date: "2026-11-21", hour: 19, minute: 0, minutes: 60, sport: null, players: null, signedIn: false, ...o });

test("an ask is stored with the server key and nothing about the player", async () => {
  reset();
  const res = await post(body({ sport: "football", players: 10 }), { token: phoneToken() });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("x-robots-tag"), "noindex");
  assert.deepEqual(added(), [{ p_key: "test-account-key", p_turf_id: TURF, p_date: "2026-11-21", p_hour: 19, p_minute: 0, p_minutes: 60, p_sport: "football", p_players: 10, p_signed: true }]);
  assert.equal(net.rpcCalls.length, 1, "no sign-in is checked and no account is looked up, even when a token is sent");
});

test("each shape the sheet can send", async () => {
  reset();
  await post(body({ minute: 30, minutes: 90, sport: "box cricket", signed: false }));
  await post(body({ date: "2026-11-22", hour: 0, minutes: 180 }));
  await post({ turf: TURF.toUpperCase(), date: "2026-11-21", hour: 6, minutes: 120, players: 2 });
  assert.deepEqual(
    added().map((a) => [a.p_turf_id, a.p_date, a.p_hour, a.p_minute, a.p_minutes, a.p_sport, a.p_players, a.p_signed]),
    [[TURF, "2026-11-21", 19, 30, 90, "box cricket", null, false], [TURF, "2026-11-22", 0, 0, 180, null, null, true], [TURF, "2026-11-21", 6, 0, 120, null, 2, false]],
  );
});

test("a body that isn't an ask: 400, nothing stored", async () => {
  reset();
  const bad: unknown[] = [
    {}, [body()], "x".repeat(400),
    body({ turf: "x" }), body({ turf: 5 }),
    body({ date: "21 Nov" }), body({ date: "2026-02-30" }), body({ date: null }), body({ date: 20261121 }),
    body({ hour: 24 }), body({ hour: -1 }), body({ hour: "19" }), body({ hour: 19.5 }), body({ hour: null }),
    body({ minute: 60 }), body({ minute: -1 }), body({ minute: "30" }),
    body({ minutes: 45 }), body({ minutes: 240 }), body({ minutes: "60" }), body({ minutes: null }),
    body({ sport: "Football" }), body({ sport: "" }), body({ sport: "x".repeat(31) }), body({ sport: 5 }), body({ sport: "foot\nball" }), body({ sport: "<b>" }),
    body({ players: 0 }), body({ players: 61 }), body({ players: 2.5 }), body({ players: "10" }),
    body({ signed: "yes" }),
    body({ name: "Asha" }), body({ phone: "9000000001" }), body({ message: "Hi!" }), body({ note: "x" }), body({ user: "u" }),
  ];
  for (const b of bad) {
    const res = await post(b);
    assert.equal(res.status, 400, JSON.stringify(b).slice(0, 80));
    assert.equal(await res.text(), "");
  }
  assert.equal(added().length, 0);
});

test("only a person's browser on this site: a bot, a prefetch or another site's page gets 204 and nothing is stored", async () => {
  reset();
  const others: Record<string, string>[] = [
    { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" },
    { "user-agent": "curl/8.4.0" },
    { "sec-purpose": "prefetch" },
    { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site" },
  ];
  for (const headers of others) {
    const res = await post(body(), { headers });
    assert.equal(res.status, 204, JSON.stringify(headers));
  }
  assert.equal(added().length, 0);
  const saved = process.env.ACCOUNT_KEY;
  delete process.env.ACCOUNT_KEY;
  assert.equal((await post(body())).status, 204, "no server key: quietly nothing");
  process.env.ACCOUNT_KEY = saved;
  assert.equal(added().length, 0);
});

test("a flood from one network is not kept after the limit, quietly", async () => {
  reset();
  const headers = { "x-forwarded-for": "203.0.113.7" };
  for (let i = 0; i < ASKS_PER_NET; i++) assert.equal((await post(body(), { headers })).status, 200, `ask ${i + 1}`);
  assert.equal((await post(body(), { headers })).status, 204, "one more is not stored");
  assert.equal(added().length, ASKS_PER_NET);
  assert.equal((await post(body(), { headers: { "x-forwarded-for": "203.0.113.8" } })).status, 200, "another network is not held back by it");
  assert.equal(ASKS_PER_NET, 20);
  // The limit is asked with a keyed hash, never the address; and not the hash "Did you get a slot?" uses.
  let seen = "";
  await post(body(), { headers, limit: (n) => ((seen = n), true) });
  assert.match(seen, /^[0-9a-f]{32}$/);
  assert.ok(!seen.includes("203"));
});

test("not stored (before the migration, capped, a turf that is gone, a sport it doesn't list, the database down): ok false, 200, and WhatsApp has opened anyway", async () => {
  for (const a of [{ r: "capped" }, { r: "not_found" }, { r: "bad" }, { r: "unavailable" }, null, "x", new Response(JSON.stringify({ code: "PGRST202", message: "no function" }), { status: 404 }), new Response("{}", { status: 500 })]) {
    reset(a);
    const res = await post(body());
    assert.deepEqual([res.status, await res.json()], [200, { ok: false }], JSON.stringify(a));
  }
});

test("an ask: read back whole from what the sheet sends; nothing else goes with it", () => {
  const all: SlotAsk[] = [ask(), ask({ minute: 30, minutes: 90 }), ask({ sport: "box cricket", players: 12, signedIn: true }), ask({ hour: 0, date: "2026-11-22", minutes: 180 }), ask({ players: 1 }), ask({ players: 60 })];
  for (const a of all) assert.deepEqual(parseAsk(JSON.parse(JSON.stringify(askBody(a)))), a);
  assert.deepEqual(askBody(ask()), { turf: TURF, date: "2026-11-21", hour: 19, minutes: 60, signed: false });
  assert.deepEqual(Object.keys(askBody(ask({ minute: 30, sport: "football", players: 10 }))).sort(), ["date", "hour", "minute", "minutes", "players", "signed", "sport", "turf"]);
  assert.deepEqual([...ASK_MINUTES], [60, 90, 120, 180]);
  assert.ok(JSON.stringify(askBody(ask({ sport: "ultimate frisbee", players: 30, minute: 30, signedIn: true }))).length < 300, "always under the route's body limit");
});

test("dates and sports", () => {
  assert.deepEqual(["2026-11-21", "2026-02-29", "2028-02-29", "2026-13-01", "2026-1-1", "", null, 5].map(isDate), [true, false, true, false, false, false, false, false]);
  assert.deepEqual(["Box Cricket", " Football ", "Table  Tennis", "5-a-side (Futsal)", "", "x".repeat(31), null, "Pool & Snooker"].map(sportWord), ["box cricket", "football", "table tennis", "5-a-side (futsal)", null, null, null, "pool & snooker"]);
});

test("the choice kept across the sign-in: this turf's, under 30 minutes old, well formed; else nothing", () => {
  const now = Date.parse("2026-11-18T12:50:00Z");
  const d = { turf: TURF, key: "2026-11-21T19:00", minutes: 90, sport: "Football", players: 10, at: now - 60_000 };
  assert.deepEqual(readDraft(JSON.stringify(d), TURF, now), d);
  assert.deepEqual(readDraft(JSON.stringify(d), TURF.toUpperCase(), now), d);
  assert.deepEqual(readDraft(JSON.stringify({ ...d, sport: null, players: null }), TURF, now), { ...d, sport: null, players: null });
  assert.equal(readDraft(JSON.stringify({ ...d, players: 500 }), TURF, now)?.players, null, "a group size the stepper can't show is left blank");
  assert.equal(readDraft(JSON.stringify(d), "eeeeeeee-eeee-4eee-8eee-000000000002", now), null, "another turf's");
  assert.equal(readDraft(JSON.stringify({ ...d, at: now - DRAFT_MAX_MS - 1 }), TURF, now), null, "too old");
  assert.equal(readDraft(JSON.stringify({ ...d, at: now + 5_000 }), TURF, now), null, "from the future");
  for (const bad of [null, "", "x", "[]", "{}", JSON.stringify({ ...d, key: "2026-11-21 19:00" }), JSON.stringify({ ...d, key: "2026-02-30T19:00" }), JSON.stringify({ ...d, minutes: 45 }), JSON.stringify({ ...d, at: "now" })]) assert.equal(readDraft(bad, TURF, now), null, String(bad));
  assert.equal(DRAFT_MAX_MS, 30 * 60_000);
});

test("the time a tap notes for \"Did you get a slot?\"", () => {
  assert.deepEqual(askedTime({ date: "2026-11-21", hour: 19, minute: 0 }), { date: "2026-11-21", hour: 19, minute: 0 });
  assert.deepEqual(askedTime({ date: "2026-11-21", hour: 6, minute: 30, name: "x" }), { date: "2026-11-21", hour: 6, minute: 30 }, "only the time is kept");
  assert.deepEqual(askedTime({ date: "2026-11-21", hour: 0 }), { date: "2026-11-21", hour: 0, minute: 0 });
  for (const bad of [null, undefined, "x", [], {}, { date: "2026-11-21" }, { date: "x", hour: 19 }, { date: "2026-11-21", hour: 24 }, { date: "2026-11-21", hour: 19, minute: 60 }]) assert.equal(askedTime(bad), null);
});
