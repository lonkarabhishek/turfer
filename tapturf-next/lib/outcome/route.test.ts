import { test } from "node:test";
import assert from "node:assert/strict";
import { OUTCOMES_PER_NET, postOutcome } from "./route";
import { installNet, net, phoneToken, req, testEnv } from "../account/testkit";

testEnv();
installNet();

// POST /api/contact-outcome. Made-up turfs.

const TURF = "eeeeeeee-eeee-4eee-8eee-000000000001";
const PHONE_UA = "Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const page = { "user-agent": PHONE_UA, "sec-fetch-site": "same-origin" };
const body = (o: Record<string, unknown> = {}) => ({ turf: TURF, kind: "call", source: "turf_bar", outcome: "got_slot", signed: false, ...o });
const post = (b: unknown, o: { headers?: Record<string, string>; token?: string; hasFree?: (city: string) => Promise<boolean>; limit?: (net: string) => boolean } = {}) =>
  postOutcome(req("/api/contact-outcome", { method: "POST", body: b, token: o.token, headers: { ...page, ...o.headers } }), { hasFree: o.hasFree, limit: o.limit });

function reset(answer: unknown = { r: "ok", city: "hyderabad" }) {
  net.reset();
  net.rpc.contact_outcome_add = () => answer;
}
const added = () => net.calls("contact_outcome_add").map((c) => c.args);

test("an answer is stored with the server key and nothing about the player", async () => {
  reset();
  const res = await post(body({ day: "today", hour: 19, signed: true }), { token: phoneToken() });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("x-robots-tag"), "noindex");
  assert.deepEqual(added(), [{ p_key: "test-account-key", p_turf_id: TURF, p_kind: "call", p_source: "turf_bar", p_outcome: "got_slot", p_reason: null, p_day: "today", p_hour: 19, p_signed: true }]);
  assert.equal(net.rpcCalls.length, 1, "no sign-in is checked and no account is looked up, even when a token is sent");
});

test("each kind of answer, as the card sends it", async () => {
  reset();
  await post(body({ outcome: "not_this_time", reason: "full", day: "tomorrow", hour: 21, kind: "whatsapp", source: "turf_slots" }));
  await post(body({ outcome: "not_this_time", reason: "wrong_number" }));
  await post(body({ outcome: "deciding" }));
  await post(body({ outcome: "dismissed" }));
  assert.deepEqual(
    added().map((a) => [a.p_kind, a.p_source, a.p_outcome, a.p_reason, a.p_day, a.p_hour]),
    [["whatsapp", "turf_slots", "not_this_time", "full", "tomorrow", 21], ["call", "turf_bar", "not_this_time", "wrong_number", null, null], ["call", "turf_bar", "deciding", null, null, null], ["call", "turf_bar", "dismissed", null, null, null]],
  );
});

test("a body that isn't an answer: 400, nothing stored", async () => {
  reset();
  for (const b of [{}, body({ outcome: "booked" }), body({ reason: "full" }), body({ hour: 19 }), body({ day: "2026-11-20" }), body({ turf: "x" }), body({ name: "Asha" }), [body()], "x".repeat(400)]) {
    const res = await post(b);
    assert.equal(res.status, 400, JSON.stringify(b).slice(0, 60));
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

test("a flood from one network is dropped after the limit, quietly", async () => {
  reset();
  const headers = { "x-forwarded-for": "203.0.113.7" };
  for (let i = 0; i < OUTCOMES_PER_NET; i++) assert.equal((await post(body(), { headers })).status, 200, `answer ${i + 1}`);
  assert.equal((await post(body(), { headers })).status, 204, "one more is not stored");
  assert.equal(added().length, OUTCOMES_PER_NET);
  assert.equal((await post(body(), { headers: { "x-forwarded-for": "203.0.113.8" } })).status, 200, "another network is not held back by it");
  assert.equal(OUTCOMES_PER_NET, 20);
  // The limit is asked with a keyed hash, never the address.
  let seen = "";
  await post(body(), { headers, limit: (n) => ((seen = n), true) });
  assert.match(seen, /^[0-9a-f]{32}$/);
  assert.ok(!seen.includes("203"));
});

test("not stored (before the migration, capped, a turf that is gone, the database down): ok false, and the card carries on", async () => {
  for (const a of [{ r: "capped" }, { r: "not_found" }, { r: "bad" }, { r: "unavailable" }, null, "x", new Response(JSON.stringify({ code: "PGRST202", message: "no function" }), { status: 404 }), new Response("{}", { status: 500 })]) {
    reset(a);
    const res = await post(body({ outcome: "not_this_time", reason: "full" }), { hasFree: async () => true });
    assert.deepEqual([res.status, await res.json()], [200, { ok: false }], JSON.stringify(a));
  }
});

test("after Slot was full: a link to the city's turfs with free hours, only when there are some", async () => {
  const full = body({ outcome: "not_this_time", reason: "full", day: "today", hour: 20 });
  reset({ r: "ok", city: "Pune " });
  const asked: string[] = [];
  const yes = async (c: string) => (asked.push(c), true);
  assert.deepEqual(await (await post(full, { hasFree: yes })).json(), { ok: true, free: { href: "/pune?f=free", city: "Pune" } });
  assert.deepEqual(asked, ["pune"]);
  assert.deepEqual(await (await post(full, { hasFree: async () => false })).json(), { ok: true }, "no free hours marked there: no link");
  assert.deepEqual(await (await post(full, { hasFree: async () => { throw new Error("down"); } })).json(), { ok: true }, "the free hours read failed: no link");
  assert.deepEqual(await (await post(full)).json(), { ok: true }, "nothing to ask: no link");
  // Only for a full slot.
  asked.length = 0;
  for (const b of [body(), body({ outcome: "not_this_time", reason: "price" }), body({ outcome: "deciding" }), body({ outcome: "dismissed" })]) assert.deepEqual(await (await post(b, { hasFree: yes })).json(), { ok: true });
  assert.deepEqual(asked, [], "the free hours are not even read for another answer");
  // A turf with no city, or one that isn't a city page: no link.
  for (const city of [null, "", "admin", "not a city!", 5]) {
    reset({ r: "ok", city });
    assert.deepEqual(await (await post(full, { hasFree: yes })).json(), { ok: true }, String(city));
  }
});
