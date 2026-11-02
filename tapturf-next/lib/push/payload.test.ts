import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ALERTS_URL, deviceFamily, endpointOk, notificationPayload, oneLine, parseSubscription, safePath, testPayload, testPushOrigin, urgencyFor } from "./payload";
import { VAPID_PUBLIC_KEY, VAPID_SUBJECT } from "./config";

const CASES = JSON.parse(fs.readFileSync(path.join(process.cwd(), "lib/push/url.cases.json"), "utf8")) as { what: string; type: string; url: string }[];
const GAME = "dddddddd-dddd-4ddd-8ddd-000000000001";
const NOTE = { id: "cccccccc-cccc-4ccc-8ccc-000000000001", type: "game_request", title: "New Join Request", message: "Ravi Kumar wants to join your Football", url: `/game/${GAME}` };
const FCM = `https://fcm.googleapis.com/fcm/send/standin:APA91b${"x".repeat(40)}`;
const P256 = `B${"A".repeat(86)}`;
const AUTH = "a".repeat(22);

/* ---------------- what the phone shows ---------------- */

test("payload: a join request opens its game, with the database's title and message", () => {
  assert.deepEqual(notificationPayload(NOTE), {
    title: "New Join Request",
    body: "Ravi Kumar wants to join your Football",
    url: `/game/${GAME}`,
    tag: `tt-game_request-${GAME}`,
  });
});

test("payload: one tag per kind and game, so a newer one replaces the older on the phone", () => {
  const a = notificationPayload(NOTE);
  const b = notificationPayload({ ...NOTE, id: "cccccccc-cccc-4ccc-8ccc-000000000002", message: "Kiran Patil wants to join your Football" });
  assert.equal(a.tag, b.tag, "two requests for one game share a tag");
  assert.notEqual(a.tag, notificationPayload({ ...NOTE, type: "game_request_accepted" }).tag, "an accepted request is its own");
  assert.notEqual(a.tag, notificationPayload({ ...NOTE, url: "/game/dddddddd-dddd-4ddd-8ddd-000000000002" }).tag, "another game is its own");
  const loose = notificationPayload({ ...NOTE, url: ALERTS_URL });
  assert.equal(loose.tag, `tt-${NOTE.id}`, "with no game: its own id");
  assert.ok(loose.tag.length <= 64 && a.tag.length <= 64, "tags stay short");
});

test("payload: every page the database builds is opened as it is (lib/push/url.cases.json)", () => {
  for (const c of CASES) {
    assert.equal(safePath(c.url), c.url, c.what);
    assert.equal(notificationPayload({ ...NOTE, type: c.type, url: c.url }).url, c.url, c.what);
  }
});

test("payload: never another site, a scheme or a strange path", () => {
  for (const bad of ["https://evil.example/x", "//evil.example/x", "/\\evil.example", "javascript:alert(1)", "game/1", "", " /game/1", "/game/1\n", "/x y",
    `/${"a".repeat(400)}`, null, 42, { url: "/" }]) {
    assert.equal(safePath(bad), ALERTS_URL, JSON.stringify(bad));
  }
  assert.equal(safePath("/dashboard?tab=requests"), "/dashboard?tab=requests");
  assert.equal(notificationPayload({ ...NOTE, url: "https://evil.example" }).url, ALERTS_URL);
});

test("payload: one line, capped; a title is never empty", () => {
  assert.equal(oneLine("  Ravi \n\t wants\u2028to   join ", 80), "Ravi wants to join");
  assert.equal(oneLine("x".repeat(300), 240).length, 240);
  assert.ok(oneLine("x".repeat(300), 240).endsWith("…"));
  assert.equal(oneLine(undefined, 10), "");
  const p = notificationPayload({ ...NOTE, title: "   ", message: "m".repeat(500) });
  assert.equal(p.title, "TapTurf");
  assert.equal(p.body.length, 240);
  assert.ok(notificationPayload({ ...NOTE, title: "T".repeat(200) }).title.length <= 80);
  assert.ok(Buffer.byteLength(JSON.stringify(notificationPayload({ ...NOTE, title: "ई".repeat(200), message: "ई".repeat(600) }))) < 3000, "well under the 4 KB a push can carry");
});

test("payload: a type that isn't a plain word is not put in the tag", () => {
  assert.equal(notificationPayload({ ...NOTE, type: "x y/<z>" }).tag, `tt-note-${GAME}`);
});

test("payload: the test opens the Alerts", () => {
  const t = testPayload();
  assert.equal(t.url, ALERTS_URL);
  assert.equal(t.tag, "tt-test");
  assert.match(t.title, /notifications are on/);
});

test("urgency: high for a join request and an accepted one, normal for the rest", () => {
  assert.equal(urgencyFor("game_request"), "high");
  assert.equal(urgencyFor("game_request_accepted"), "high");
  for (const t of ["game_request_declined", "game_venue_changed", "game_cancelled", "anything"]) assert.equal(urgencyFor(t), "normal", t);
});

/* ---------------- where we send ---------------- */

test("endpoints: https at the known push services only", () => {
  const env = {};
  for (const good of [FCM, "https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk-standin-token",
    "https://web.push.apple.com/QGuQyavXutnMH8RCE_standin", "https://wns2-pn1p.notify.windows.com/w/?token=BQYAAABstandin"]) {
    assert.ok(endpointOk(good, env), good);
  }
  for (const bad of [FCM.replace("https:", "http:"), "https://fcm.googleapis.com:8443/fcm/send/standin-token-123", "https://evil.example/fcm/send/standin-123",
    "https://fcm.googleapis.com.evil.example/send/x123456", "https://user:pw@fcm.googleapis.com/fcm/send/standin", "https://127.0.0.1:9443/push/standin-1234",
    "https://169.254.169.254/latest/meta-data/x", "https://android.googleapis.com/gcm/send/standin-old", "not a url at all, sorry", "https://x.io", `${FCM}${"x".repeat(1100)}`, null, 7]) {
    assert.equal(endpointOk(bad, env), false, String(bad));
  }
});

test("endpoints: a local stand-in push service only off Vercel, https, on this machine", () => {
  const local = "https://127.0.0.1:9443/push/standin-1234";
  assert.equal(testPushOrigin({ PUSH_TEST_ORIGIN: "https://127.0.0.1:9443" }), "https://127.0.0.1:9443");
  assert.ok(endpointOk(local, { PUSH_TEST_ORIGIN: "https://127.0.0.1:9443" }));
  assert.equal(endpointOk(local, { PUSH_TEST_ORIGIN: "https://127.0.0.1:9443", VERCEL: "1" }), false, "never on Vercel");
  assert.equal(endpointOk(local, { PUSH_TEST_ORIGIN: "https://127.0.0.1:9444" }), false, "that origin only");
  assert.equal(testPushOrigin({ PUSH_TEST_ORIGIN: "http://127.0.0.1:9443" }), null, "https only");
  assert.equal(testPushOrigin({ PUSH_TEST_ORIGIN: "https://push.example.com" }), null, "this machine only");
});

test("subscription: the browser's toJSON(), checked", () => {
  const env = {};
  assert.deepEqual(parseSubscription({ endpoint: FCM, expirationTime: null, keys: { p256dh: P256, auth: AUTH } }, env), { ok: { endpoint: FCM, p256dh: P256, auth: AUTH } });
  assert.deepEqual(parseSubscription({ endpoint: FCM, keys: { p256dh: `${P256}=`, auth: `${AUTH}==` } }, env), { ok: { endpoint: FCM, p256dh: P256, auth: AUTH } }, "padding is dropped");
  assert.deepEqual(parseSubscription({ endpoint: "https://evil.example/x/123456789", keys: { p256dh: P256, auth: AUTH } }, env), { bad: "endpoint" });
  assert.deepEqual(parseSubscription({ endpoint: FCM, keys: { p256dh: P256.slice(1), auth: AUTH } }, env), { bad: "keys" }, "65 bytes, uncompressed");
  assert.deepEqual(parseSubscription({ endpoint: FCM, keys: { p256dh: `C${"A".repeat(86)}`, auth: AUTH } }, env), { bad: "keys" }, "starts with 04");
  assert.deepEqual(parseSubscription({ endpoint: FCM, keys: { p256dh: P256, auth: "a+b/" + "a".repeat(18) } }, env), { bad: "keys" }, "base64url");
  assert.deepEqual(parseSubscription({ endpoint: FCM, keys: { p256dh: P256 } }, env), { bad: "keys" });
  assert.deepEqual(parseSubscription({ endpoint: FCM, keys: { p256dh: P256, auth: AUTH }, user_id: "someone" }, env), { bad: "endpoint" }, "nothing else, a user id least of all");
  for (const b of [null, [], "x", { keys: { p256dh: P256, auth: AUTH } }]) assert.ok("bad" in parseSubscription(b, env), JSON.stringify(b));
});

test("device: the kind only", () => {
  const ua = {
    iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    ipad: "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
    mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
    linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  } as const;
  for (const [kind, s] of Object.entries(ua)) assert.equal(deviceFamily(s), kind, kind);
  assert.equal(deviceFamily(null), "other");
  assert.equal(deviceFamily("curl/8.0"), "other");
});

test("config: a P-256 public key and an https subject", () => {
  assert.match(VAPID_PUBLIC_KEY, /^B[A-Za-z0-9_-]{86}$/);
  assert.equal(VAPID_SUBJECT, "https://www.tapturf.in");
});
