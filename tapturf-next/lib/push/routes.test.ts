import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import Module from "node:module";
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify, type ECDH } from "node:crypto";
import * as config from "./config";
import { dispatch, keyPairMatches, postStatus, postSubscribe, postTest, postUnsubscribe, topicFor, vapidPrivateKey } from "./server";
import { notificationPayload, testPayload } from "./payload";
import { dbProfile, installNet, net, phoneToken, req, testEnv } from "../account/testkit";

testEnv();
installNet();

// The app's own secret check (lib/cache/secret.ts, as /api/revalidate uses it): its "@/" import resolved to the compiled copy.
const OUT = path.resolve(__dirname, "../..");
const resolve = (Module as unknown as { _resolveFilename: (r: string, ...rest: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: (r: string, ...rest: unknown[]) => string })._resolveFilename = function (r: string, ...rest: unknown[]) {
  return resolve.call(this, r.startsWith("@/") ? path.join(OUT, r.slice(2)) : r, ...rest);
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { revalidateSecretOk } = require("../cache/secret") as { revalidateSecretOk: (h: string | null) => Promise<boolean> };

// A VAPID pair of the tests' own (the real private key is only in Vercel): the config's public half is swapped for its.
const vapid = createECDH("prime256v1");
vapid.generateKeys();
const PRIVATE = vapid.getPrivateKey().toString("base64url");
(config as unknown as Record<string, string>).VAPID_PUBLIC_KEY = vapid.getPublicKey().toString("base64url");

const LOCAL = "https://127.0.0.1:9443";
process.env.PUSH_TEST_ORIGIN = LOCAL;
const withKey = () => (process.env.VAPID_PRIVATE_KEY = PRIVATE);
const noKey = () => delete process.env.VAPID_PRIVATE_KEY;

/** A browser's subscription: its own key pair and auth secret, so the test can read what was sent to it. */
function browser(endpoint: string) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return { ecdh, auth, endpoint, p256dh: ecdh.getPublicKey().toString("base64url"), authB64: auth.toString("base64url") };
}
type Browser = ReturnType<typeof browser>;

/** RFC 8291 (aes128gcm): what the browser reads. */
function decrypt(body: Buffer, ecdh: ECDH, auth: Buffer): string {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const sender = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), ecdh.getPublicKey(), sender]);
  const ikm = Buffer.from(hkdfSync("sha256", ecdh.computeSecret(sender), auth, info, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  let end = plain.length - 1;
  while (end > 0 && plain[end] === 0) end--;
  assert.equal(plain[end], 2, "the last record's delimiter");
  return plain.subarray(0, end).toString("utf8");
}

/** The VAPID header: an ES256 JWT for the push service's origin, signed by our key. */
function checkVapid(authorization: string | null, endpoint: string) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(authorization ?? "");
  assert.ok(m, `a VAPID Authorization header (${authorization?.slice(0, 12)})`);
  const [t, k] = [m[1], m[2]];
  assert.equal(k, config.VAPID_PUBLIC_KEY, "k is our public key");
  const [h, p, s] = t.split(".");
  const raw = Buffer.from(k, "base64url");
  const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: raw.subarray(1, 33).toString("base64url"), y: raw.subarray(33).toString("base64url") }, format: "jwk" });
  assert.ok(verify("sha256", Buffer.from(`${h}.${p}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")), "the JWT is signed by our private key");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), { typ: "JWT", alg: "ES256" });
  const claims = JSON.parse(Buffer.from(p, "base64url").toString()) as { aud: string; exp: number; sub: string };
  assert.equal(claims.aud, new URL(endpoint).origin, "for that push service");
  assert.equal(claims.sub, "https://www.tapturf.in");
  const now = Date.now() / 1000;
  assert.ok(claims.exp > now && claims.exp <= now + 24 * 3600, "expires within a day");
}

// The push services: every post to one is kept; `answer` says what each answers.
type Hit = { url: string; headers: Headers; body: Buffer };
let hits: Hit[] = [];
let answer: (url: string) => number = () => 201;
const fakeNet = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith(`${LOCAL}/`) || url.startsWith("https://fcm.googleapis.com/") || url.startsWith("https://web.push.apple.com/")) {
    hits.push({ url, headers: new Headers(init?.headers), body: Buffer.from(init?.body as Uint8Array) });
    return new Response(null, { status: answer(url) });
  }
  if (url.startsWith("https://evil.example")) throw new Error("never fetched");
  return fakeNet(input, init);
}) as typeof fetch;

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;
const missing = () => Response.json({ code: "PGRST202", message: "Could not find the function" }, { status: 404 });
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const target = (id: number, b: Browser) => ({ id: `11111111-1111-4111-8111-${String(id).padStart(12, "0")}`, endpoint: b.endpoint, p256dh: b.p256dh, auth: b.authB64 });
const sub = (b: Browser) => ({ endpoint: b.endpoint, expirationTime: null, keys: { p256dh: b.p256dh, auth: b.authB64 } });

function signedIn(id = "acc-1") {
  net.reset();
  hits = [];
  answer = () => 201;
  net.rpc.account_resolve = () => dbProfile({ id });
}

/* ---------------- the VAPID key ---------------- */

test("key: only the private half of the committed public key turns push on; it is never logged", () => {
  assert.ok(keyPairMatches(PRIVATE, config.VAPID_PUBLIC_KEY));
  const other = createECDH("prime256v1");
  other.generateKeys();
  const wrong = other.getPrivateKey().toString("base64url");
  const logged: string[] = [];
  const err = console.error;
  console.error = (...a: unknown[]) => logged.push(a.map(String).join(" "));
  try {
    assert.equal(vapidPrivateKey({ VAPID_PRIVATE_KEY: wrong }), null, "a key from another pair: off");
    assert.equal(vapidPrivateKey({ VAPID_PRIVATE_KEY: "not a key" }), null);
  } finally {
    console.error = err;
  }
  assert.equal(vapidPrivateKey({}), null, "unset: off");
  assert.equal(vapidPrivateKey({ VAPID_PRIVATE_KEY: ` ${PRIVATE}\n` }), PRIVATE, "the right one (trimmed): on");
  assert.ok(logged.length >= 1 && logged.every((l) => !l.includes(wrong) && !l.includes(PRIVATE)), "says so without the key");
});

test("topic: 32 URL-safe characters at most, one per tag", () => {
  const t = topicFor("tt-game_request-dddddddd-dddd-4ddd-8ddd-000000000001");
  assert.match(t, /^[A-Za-z0-9_-]{1,32}$/);
  assert.equal(t, topicFor("tt-game_request-dddddddd-dddd-4ddd-8ddd-000000000001"));
  assert.notEqual(t, topicFor("tt-test"));
});

/* ---------------- status, on, off ---------------- */

test("status: before the VAPID key, not ready, and nothing is asked of anyone", async () => {
  signedIn();
  noKey();
  const res = await postStatus(req("/api/push/status", { method: "POST", body: { endpoint: null } }));
  assert.equal(res.status, 200);
  assert.deepEqual(await json(res), { ready: false, on: false, devices: 0 });
  assert.equal(net.rpcCalls.length, 0);
});

test("status: before the database has the push functions, not ready", async () => {
  signedIn();
  withKey();
  net.rpc.push_state = missing;
  const res = await postStatus(req("/api/push/status", { method: "POST", token: phoneToken(), body: { endpoint: null } }));
  assert.deepEqual(await json(res), { ready: false, on: false, devices: 0 });
});

test("status: the caller's own, from the account the sign-in opens", async () => {
  signedIn("acc-7");
  withKey();
  net.rpc.push_state = () => ({ r: "ok", on: true, devices: 2 });
  const b = browser(`${LOCAL}/push/a1`);
  const res = await postStatus(req("/api/push/status", { method: "POST", token: phoneToken(), body: { endpoint: b.endpoint, user_id: "acc-9" } }));
  assert.deepEqual(await json(res), { ready: true, on: true, devices: 2 });
  assert.deepEqual(net.calls("push_state")[0].args, { p_key: "test-account-key", p_user_id: "acc-7", p_endpoint: b.endpoint });
  assert.equal(res.headers.get("cache-control"), "private, no-store");
});

test("status: signed out, refused", async () => {
  signedIn();
  withKey();
  const res = await postStatus(req("/api/push/status", { method: "POST", body: { endpoint: null } }));
  assert.equal(res.status, 401);
  assert.equal(net.calls("push_state").length, 0);
});

test("subscribe: this browser's subscription for the verified caller, with the kind of device only", async () => {
  signedIn("acc-3");
  withKey();
  net.rpc.push_subscribe = () => ({ r: "ok", devices: 1 });
  const b = browser("https://web.push.apple.com/QGuQyavXutnMH8RCE_standin");
  const res = await postSubscribe(req("/api/push/subscribe", { method: "POST", token: phoneToken(), body: sub(b), headers: { "user-agent": IPHONE } }));
  assert.equal(res.status, 200);
  assert.deepEqual(await json(res), { r: "ok", devices: 1 });
  assert.deepEqual(net.calls("push_subscribe")[0].args, {
    p_key: "test-account-key", p_user_id: "acc-3", p_endpoint: b.endpoint, p_p256dh: b.p256dh, p_auth: b.authB64, p_device: "iphone",
  });
});

test("subscribe: refused before push is ready, signed out, or with a bad address or keys", async () => {
  const b = browser(`${LOCAL}/push/a2`);
  signedIn();
  noKey();
  let res = await postSubscribe(req("/api/push/subscribe", { method: "POST", token: phoneToken(), body: sub(b) }));
  assert.equal(res.status, 503);
  assert.deepEqual(await json(res), { reason: "not_ready", error: "unavailable" });
  withKey();
  res = await postSubscribe(req("/api/push/subscribe", { method: "POST", body: sub(b) }));
  assert.equal(res.status, 401);
  for (const [body, field] of [
    [{ ...sub(b), endpoint: "https://evil.example/push/123456789" }, "endpoint"],
    [{ ...sub(b), endpoint: "http://127.0.0.1:9443/push/a2" }, "endpoint"],
    [{ ...sub(b), keys: { p256dh: "short", auth: b.authB64 } }, "keys"],
    [{ ...sub(b), user_id: "acc-9" }, "endpoint"],
  ] as const) {
    res = await postSubscribe(req("/api/push/subscribe", { method: "POST", token: phoneToken(), body }));
    assert.equal(res.status, 400);
    assert.equal((await json(res)).field, field);
  }
  assert.equal(net.calls("push_subscribe").length, 0, "the database is never asked");
});

test("subscribe: the database's 20 a day, and a database without the functions", async () => {
  signedIn();
  withKey();
  const b = browser(`${LOCAL}/push/a3`);
  net.rpc.push_subscribe = () => ({ r: "limit" });
  assert.equal((await postSubscribe(req("/api/push/subscribe", { method: "POST", token: phoneToken(), body: sub(b) }))).status, 429);
  net.rpc.push_subscribe = missing;
  const res = await postSubscribe(req("/api/push/subscribe", { method: "POST", token: phoneToken(), body: sub(b) }));
  assert.equal(res.status, 503);
  assert.equal((await json(res)).reason, "not_ready");
});

test("unsubscribe: off for the caller's address, whether or not push is on yet", async () => {
  signedIn("acc-4");
  noKey();
  net.rpc.push_unsubscribe = () => ({ r: "ok", devices: 0 });
  const res = await postUnsubscribe(req("/api/push/unsubscribe", { method: "POST", token: phoneToken(), body: { endpoint: `${LOCAL}/push/a4` } }));
  assert.deepEqual(await json(res), { r: "ok", devices: 0 });
  assert.deepEqual(net.calls("push_unsubscribe")[0].args, { p_key: "test-account-key", p_user_id: "acc-4", p_endpoint: `${LOCAL}/push/a4` });
  net.rpc.push_unsubscribe = missing;
  assert.deepEqual(await json(await postUnsubscribe(req("/api/push/unsubscribe", { method: "POST", token: phoneToken(), body: { endpoint: `${LOCAL}/push/a4` } }))), { r: "ok", devices: 0 },
    "no push functions yet: nothing was on");
  assert.equal((await postUnsubscribe(req("/api/push/unsubscribe", { method: "POST", token: phoneToken(), body: {} }))).status, 400);
  assert.equal((await postUnsubscribe(req("/api/push/unsubscribe", { method: "POST", body: { endpoint: `${LOCAL}/push/a4` } }))).status, 401);
});

/* ---------------- Send me a test ---------------- */

test("test: encrypted for each of the caller's phones, signed with our VAPID key; an ended one is reported gone", async () => {
  signedIn("acc-5");
  withKey();
  const a = browser(`${LOCAL}/push/t1`);
  const b = browser(`${LOCAL}/push/t2`);
  const c = browser(`${LOCAL}/push/t3`);
  net.rpc.push_test_targets = (args) => {
    assert.equal(args.p_user_id, "acc-5");
    return { r: "ok", send_id: "22222222-2222-4222-8222-000000000001", targets: [target(1, a), target(2, b), target(3, c)] };
  };
  answer = (url) => (url.endsWith("/t2") ? 410 : url.endsWith("/t3") ? 500 : 201);
  const res = await postTest(req("/api/push/test", { method: "POST", token: phoneToken() }));
  assert.deepEqual(await json(res), { r: "ok", sent: 1, gone: 1, failed: 1 });
  assert.equal(hits.length, 3);
  const hit = hits.find((h) => h.url === a.endpoint)!;
  checkVapid(hit.headers.get("authorization"), a.endpoint);
  assert.equal(hit.headers.get("content-encoding"), "aes128gcm");
  assert.equal(hit.headers.get("ttl"), "86400", "kept a day for a phone that is off");
  assert.equal(hit.headers.get("urgency"), "normal");
  assert.equal(hit.headers.get("topic"), topicFor("tt-test"));
  assert.deepEqual(JSON.parse(decrypt(hit.body, a.ecdh, a.auth)), testPayload(), "the phone reads the test");
  assert.ok(!hit.body.includes(Buffer.from("TapTurf")), "and nobody on the way can");
  assert.deepEqual(net.calls("push_report")[0].args, {
    p_key: "test-account-key",
    p_send_id: "22222222-2222-4222-8222-000000000001",
    p_results: [{ id: target(1, a).id, result: "ok" }, { id: target(2, b).id, result: "gone" }, { id: target(3, c).id, result: "failed" }],
  });
});

test("test: nothing on, the hourly limit, not ready", async () => {
  signedIn();
  withKey();
  net.rpc.push_test_targets = () => ({ r: "none" });
  let res = await postTest(req("/api/push/test", { method: "POST", token: phoneToken() }));
  assert.equal(res.status, 409);
  assert.equal((await json(res)).reason, "none");
  net.rpc.push_test_targets = () => ({ r: "limit" });
  assert.equal((await postTest(req("/api/push/test", { method: "POST", token: phoneToken() }))).status, 429);
  noKey();
  res = await postTest(req("/api/push/test", { method: "POST", token: phoneToken() }));
  assert.equal(res.status, 503);
  assert.equal(hits.length, 0);
});

/* ---------------- dispatch, from the database ---------------- */

const NID = "cccccccc-cccc-4ccc-8ccc-000000000001";
const GAME = "dddddddd-dddd-4ddd-8ddd-000000000001";
const dispatchReq = (secret: string | null, body: unknown = { id: NID }) =>
  req("/api/push/dispatch", { method: "POST", body, headers: secret === null ? {} : { "x-revalidate-secret": secret } });

test("dispatch: the revalidate secret, checked as /api/revalidate checks it", async () => {
  signedIn();
  withKey();
  process.env.REVALIDATE_SECRET = "reval-secret";
  net.rpc.push_targets = () => ({ r: "none" });
  for (const s of [null, "", "wrong", "reval-secreT", "reval-secret-2"]) {
    const res = await dispatch(dispatchReq(s), revalidateSecretOk);
    assert.equal(res.status, 401, `secret ${JSON.stringify(s)}`);
  }
  assert.equal(net.calls("push_targets").length, 0, "nothing read without it");
  const ok = await dispatch(dispatchReq("reval-secret"), revalidateSecretOk);
  assert.equal(ok.status, 200);
  assert.deepEqual(await json(ok), { ok: true, skipped: "none" });
  // No REVALIDATE_SECRET in the environment: Supabase checks it (check_revalidate_secret), as for /api/revalidate.
  delete process.env.REVALIDATE_SECRET;
  net.rpc.check_revalidate_secret = (args) => args.p_secret === "db-secret";
  assert.equal((await dispatch(dispatchReq("nope"), revalidateSecretOk)).status, 401);
  assert.equal((await dispatch(dispatchReq("db-secret"), revalidateSecretOk)).status, 200);
});

const allow = async (h: string | null) => h === "s";

test("dispatch: a notification to its account's phones, urgent for a join request; an ended one is reported gone", async () => {
  signedIn();
  withKey();
  const a = browser(`${LOCAL}/push/d1`);
  const b = browser(`${LOCAL}/push/d2`);
  const n = { id: NID, type: "game_request", title: "New Join Request", message: "Ravi Kumar wants to join your Football", url: `/game/${GAME}` };
  net.rpc.push_targets = (args) => {
    assert.equal(args.p_notification_id, NID);
    return { r: "ok", send_id: "22222222-2222-4222-8222-000000000002", notification: n, targets: [target(1, a), target(2, b)] };
  };
  answer = (url) => (url.endsWith("/d2") ? 410 : 201);
  const res = await dispatch(dispatchReq("s", { id: NID.toUpperCase() }), allow);
  assert.deepEqual(await json(res), { ok: true, sent: 1, gone: 1, failed: 0 });
  const hit = hits.find((h) => h.url === a.endpoint)!;
  checkVapid(hit.headers.get("authorization"), a.endpoint);
  assert.equal(hit.headers.get("urgency"), "high");
  const shown = JSON.parse(decrypt(hit.body, a.ecdh, a.auth));
  assert.deepEqual(shown, notificationPayload(n));
  assert.deepEqual(shown, { title: "New Join Request", body: "Ravi Kumar wants to join your Football", url: `/game/${GAME}`, tag: `tt-game_request-${GAME}` });
  assert.deepEqual(net.calls("push_report")[0].args.p_results, [{ id: target(1, a).id, result: "ok" }, { id: target(2, b).id, result: "gone" }]);
});

test("dispatch: a cancelled game is not urgent; an address that isn't a push service's is never fetched", async () => {
  signedIn();
  withKey();
  const a = browser(`${LOCAL}/push/d3`);
  const evil = { ...target(9, a), endpoint: "https://evil.example/collect/123456789" };
  net.rpc.push_targets = () => ({ r: "ok", send_id: "22222222-2222-4222-8222-000000000003",
    notification: { id: NID, type: "game_cancelled", title: "Game cancelled", message: "Asha cancelled Football on Sat 7 Nov", url: `/game/${GAME}` }, targets: [target(3, a), evil] });
  const res = await dispatch(dispatchReq("s"), allow);
  assert.deepEqual(await json(res), { ok: true, sent: 1, gone: 0, failed: 1 });
  assert.deepEqual(hits.map((h) => h.url), [a.endpoint]);
  assert.equal(hits[0].headers.get("urgency"), "normal");
});

test("dispatch: nothing to send, a bad body, not ready", async () => {
  signedIn();
  withKey();
  for (const r of ["sent", "none", "old", "gone"]) {
    net.rpc.push_targets = () => ({ r });
    assert.deepEqual(await json(await dispatch(dispatchReq("s"), allow)), { ok: true, skipped: r });
  }
  assert.equal(hits.length, 0);
  for (const body of [{}, { id: "x" }, { id: 7 }, []]) assert.equal((await dispatch(dispatchReq("s", body), allow)).status, 400, JSON.stringify(body));
  net.rpc.push_targets = missing;
  assert.equal((await dispatch(dispatchReq("s"), allow)).status, 503, "no push functions yet");
  noKey();
  assert.equal((await dispatch(dispatchReq("s"), allow)).status, 503, "no VAPID key");
  assert.equal(net.calls("push_report").length, 0);
});
