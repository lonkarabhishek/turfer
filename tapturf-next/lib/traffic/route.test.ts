import { test } from "node:test";
import assert from "node:assert/strict";
import { postTraffic } from "./route";
import { googleSession, installNet, net, phoneToken, req, testEnv } from "../account/testkit";

testEnv();
installNet();

const PHONE_UA = "Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const page = { "user-agent": PHONE_UA, "sec-fetch-site": "same-origin" };
const post = (body: unknown, o: { token?: string; headers?: Record<string, string> } = {}) =>
  postTraffic(req("/api/traffic", { method: "POST", body, token: o.token, headers: { ...page, ...o.headers } }));

/** Work after the reply (Next's after, run at once here) and the token checks it waits on. */
const settle = () => new Promise((r) => setTimeout(r, 30));

function reset() {
  net.reset();
  net.rpc.traffic_add = () => ({ r: "ok" });
}
const added = () => net.calls("traffic_add").map((c) => c.args);

test("a guest's visit: 204 at once, then counted with the server key, its kind worked out here, not signed in", async () => {
  reset();
  const res = await post({ p: "/turf/kick-off-arena", s: "google", v: 1 });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(await res.text(), "", "nothing to read");
  await settle();
  assert.deepEqual(added(), [{ p_key: "test-account-key", p_kind: "turf", p_path: "/turf/kick-off-arena", p_source: "google", p_host: null, p_visit: true, p_signed: false }]);
  assert.equal(net.calls("account_resolve").length, 0, "no account is ever looked up");
});

test("another site's visit keeps its host name only; an in-site view is never a visit", async () => {
  reset();
  await post({ p: "/blog/best-turfs", s: "other_site", v: 1, h: "www.reddit.com" });
  await post({ p: "/pune", s: "internal", v: 1 });
  await post({ p: "/old", s: "direct", v: 1, nf: 1 });
  await settle();
  assert.deepEqual(
    added().map((a) => [a.p_kind, a.p_path, a.p_source, a.p_host, a.p_visit]),
    [
      ["blog", "/blog/best-turfs", "other_site", "reddit.com", true],
      ["city", "/pune", "internal", null, false],
      ["other", "(not found)", "direct", null, true],
    ],
  );
});

test("signed in with a phone or Google: counted as signed in; no account looked up or sent", async () => {
  reset();
  await post({ p: "/games", s: "whatsapp" }, { token: phoneToken() });
  await post({ p: "/map", s: "direct", v: 1 }, { token: googleSession() });
  await settle();
  assert.deepEqual(added().map((a) => [a.p_path, a.p_signed]), [["/games", true], ["/map", true]]);
  assert.equal(net.calls("account_resolve").length, 0);
  for (const a of added()) assert.deepEqual(Object.keys(a).sort(), ["p_host", "p_key", "p_kind", "p_path", "p_signed", "p_source", "p_visit"], "nothing about the person");
});

test("the site owner's own views are not counted, by phone or by Google", async () => {
  reset();
  await post({ p: "/", s: "direct", v: 1 }, { token: phoneToken({ phone: "+919403612979", sub: "fb-owner" }) });
  await post({ p: "/pune", s: "internal" }, { token: googleSession({ user: { email: "lonkarabhishek00@gmail.com" } }) });
  await settle();
  assert.deepEqual(added(), []);
});

test("a sign-in that doesn't check out is a guest's view: still counted, not signed in", async () => {
  reset();
  await post({ p: "/", s: "direct" }, { token: "not.a.token" });
  await settle();
  assert.deepEqual(added().map((a) => a.p_signed), [false]);
});

test("bots, prefetches, other sites' pages and text/plain: 204, nothing counted", async () => {
  reset();
  const body = { p: "/", s: "direct", v: 1 };
  const answers = await Promise.all([
    post(body, { headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" } }),
    post(body, { headers: { "user-agent": "WhatsApp/2.23.20.0" } }),
    post(body, { headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0 Safari/537.36" } }),
    post(body, { headers: { "sec-purpose": "prefetch" } }),
    post(body, { headers: { "sec-fetch-site": "cross-site" } }),
    postTraffic(new Request("http://localhost:3000/api/traffic", { method: "POST", headers: { ...page, "content-type": "text/plain" }, body: JSON.stringify(body) })),
  ]);
  assert.deepEqual(answers.map((r) => r.status), [204, 204, 204, 204, 204, 204]);
  await settle();
  assert.deepEqual(added(), []);
});

test("a body that isn't a view: 400, nothing counted", async () => {
  reset();
  for (const b of [{ p: "/admin", s: "direct" }, { p: "/", s: "tiktok" }, { s: "direct" }, { p: "/" + "a".repeat(500), s: "direct" }]) {
    const r = await post(b);
    assert.equal(r.status, 400, JSON.stringify(b).slice(0, 40));
  }
  await settle();
  assert.deepEqual(added(), []);
});

test("before the database has the file: quiet, asked again only after a minute", async () => {
  reset();
  let asked = 0;
  net.rpc.traffic_add = () => {
    asked++;
    return new Response(JSON.stringify({ code: "PGRST202", message: "no function" }), { status: 404, headers: { "content-type": "application/json" } });
  };
  const warn = console.warn;
  const said: unknown[] = [];
  console.warn = (...a: unknown[]) => void said.push(a);
  try {
    await post({ p: "/", s: "direct", v: 1 });
    await settle();
    await post({ p: "/pune", s: "direct", v: 1 });
    await settle();
  } finally {
    console.warn = warn;
  }
  assert.equal(asked, 1, "the second view waits out the minute");
  assert.equal(said.length, 1, "said once");
});
