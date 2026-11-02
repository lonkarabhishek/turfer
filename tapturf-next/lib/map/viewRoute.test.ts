import { test } from "node:test";
import assert from "node:assert/strict";
import { postMapUse } from "./viewRoute";
import { dbProfile, googleSession, installNet, net, phoneToken, PHONE, req, settle, testEnv } from "../account/testkit";

testEnv();
installNet();

const PHONE_UA = "Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
let n = 0;
/** A fresh random-looking tag per event, as the browser makes them. */
const tag = () => (++n).toString(16).padStart(16, "0");
const page = { "user-agent": PHONE_UA, "sec-fetch-site": "same-origin" };
const post = (body: unknown, o: { token?: string; headers?: Record<string, string> } = {}) =>
  postMapUse(req("/api/map/views", { method: "POST", body, token: o.token, headers: { ...page, ...o.headers } }));

function reset() {
  net.reset();
  net.rpc.map_view_add = (a) => ({ r: "ok", signed: a.p_user_id != null });
}
const added = () => net.calls("map_view_add").map((c) => c.args);

test("a guest's view: 204 at once, then counted with the server key, unique as the browser said, no account", async () => {
  reset();
  const res = await post({ k: "view", u: true, v: tag() });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(await res.text(), "", "nothing to read");
  await settle();
  assert.deepEqual(added(), [{ p_key: "test-account-key", p_kind: "view", p_unique: true, p_user_id: null }]);
  assert.equal(net.calls("account_resolve").length, 0, "no sign-in, no account lookup");
});

test("taps and the turf page's map: counted, never unique", async () => {
  reset();
  await post({ k: "tap", u: true, v: tag() });
  await post({ k: "mini", v: tag() });
  await settle();
  assert.deepEqual(
    added().map((a) => [a.p_kind, a.p_unique]),
    [
      ["tap", false],
      ["mini", false],
    ],
  );
});

test("signed in with a phone: the verified account, never made, and not a sign-in", async () => {
  reset();
  net.rpc.account_resolve = () => dbProfile({ id: "acc-phone" });
  const res = await post({ k: "view", u: false, v: tag() }, { token: phoneToken() });
  assert.equal(res.status, 204);
  await settle();
  const [resolve] = net.calls("account_resolve");
  assert.equal(resolve.args.p_kind, "phone");
  assert.equal(resolve.args.p_phone, PHONE);
  assert.equal(resolve.args.p_create, false, "a map view never makes an account");
  assert.equal(resolve.args.p_log, false, "and is not a sign-in");
  assert.deepEqual(added(), [{ p_key: "test-account-key", p_kind: "view", p_unique: false, p_user_id: "acc-phone" }]);
});

test("signed in with Google: the account its verified session opens", async () => {
  reset();
  net.rpc.account_resolve = () => dbProfile({ id: "acc-google" });
  await post({ k: "tap", v: tag() }, { token: googleSession() });
  await settle();
  assert.equal(net.calls("account_resolve")[0].args.p_kind, "google");
  assert.equal(added()[0].p_user_id, "acc-google");
});

test("a sign-in that doesn't check out, or opens no account, is a guest's: still 204, never a sign-in prompt", async () => {
  reset();
  net.rpc.account_resolve = () => ({ r: "new", was_used: false });
  const a = await post({ k: "view", v: tag() }, { token: "not.a.token" });
  const b = await post({ k: "view", v: tag() }, { token: phoneToken({ sub: "fb-uid-no-account" }) });
  assert.equal(a.status, 204);
  assert.equal(b.status, 204);
  await settle();
  assert.deepEqual(added().map((x) => x.p_user_id), [null, null]);
});

test("a signed-in browser's next events reuse its account: one lookup for a view and a tap", async () => {
  reset();
  net.rpc.account_resolve = () => dbProfile({ id: "acc-reuse" });
  const token = phoneToken({ sub: "fb-uid-reuse" });
  await post({ k: "view", u: true, v: tag() }, { token });
  await settle();
  await post({ k: "tap", v: tag() }, { token });
  await settle();
  assert.equal(net.calls("account_resolve").length, 1, "the account is looked up once");
  assert.deepEqual(added().map((a) => [a.p_kind, a.p_user_id]), [
    ["view", "acc-reuse"],
    ["tap", "acc-reuse"],
  ]);
});

test("bots, previews, prefetches and other sites' pages are not counted, and are told nothing", async () => {
  reset();
  const cases: Record<string, string>[] = [
    { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
    { "user-agent": "WhatsApp/2.23.20.0" },
    { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0 Safari/537.36" },
    { "sec-purpose": "prefetch;prerender" },
    { purpose: "prefetch" },
    { "sec-fetch-site": "cross-site" },
  ];
  for (const h of cases) {
    const res = await post({ k: "view", u: true, v: tag() }, { headers: h });
    assert.equal(res.status, 204, JSON.stringify(h));
  }
  // A form from another site can post text/plain without asking first; only this site's JSON counts.
  const plain = await postMapUse(new Request("http://localhost:3000/api/map/views", { method: "POST", headers: { ...page, "content-type": "text/plain" }, body: JSON.stringify({ k: "view", v: tag() }) }));
  assert.equal(plain.status, 204);
  await settle();
  assert.equal(added().length, 0);
});

test("a body that isn't a use: 400, nothing counted", async () => {
  reset();
  for (const body of [{ k: "open" }, { k: "VIEW" }, {}, [], "view"]) assert.equal((await post(body)).status, 400, JSON.stringify(body));
  const big = await post({ k: "view", v: tag(), pad: "x".repeat(400) });
  assert.equal(big.status, 400, "past 200 bytes");
  await settle();
  assert.equal(added().length, 0);
});

test("the same event sent twice is counted once", async () => {
  reset();
  const v = tag();
  await post({ k: "view", u: true, v });
  await post({ k: "view", u: true, v });
  await post({ k: "tap", v });
  await settle();
  assert.deepEqual(added().map((a) => a.p_kind), ["view", "tap"]);
});

test("no server key: nothing counted, still 204", async () => {
  reset();
  const was = process.env.ACCOUNT_KEY;
  delete process.env.ACCOUNT_KEY;
  try {
    assert.equal((await post({ k: "view", v: tag() })).status, 204);
    await settle();
    assert.equal(added().length, 0);
  } finally {
    process.env.ACCOUNT_KEY = was;
  }
});

// Last: it leaves this instance waiting before it asks again.
test("before 20261102_map_views.sql: the function is missing, nothing breaks, and it is not asked again for a while", async () => {
  reset();
  net.rpc.map_view_add = () => Response.json({ code: "PGRST202", message: "Could not find the function public.map_view_add", details: null, hint: null }, { status: 404 });
  assert.equal((await post({ k: "view", u: true, v: tag() })).status, 204);
  await settle();
  assert.equal(added().length, 1);
  assert.equal((await post({ k: "view", u: true, v: tag() })).status, 204);
  await settle();
  assert.equal(added().length, 1, "not asked again");
});
