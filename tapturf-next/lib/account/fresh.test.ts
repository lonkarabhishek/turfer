import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { checkFirebaseIdToken } from "../firebase/verifyIdToken";
import { freshGoogle, freshPhone, GOOGLE_FRESH_S, oauthAmrAt, PHONE_FRESH_S, proofKeyOf } from "./fresh";
import { createIdentityChecker } from "./identity";
import { b64, googleUser, installNet, net, phoneToken, SUPABASE, supabaseToken, testEnv } from "./testkit";

testEnv();
installNet();

const NOW = 1_790_000_000;
const claims = (over: Record<string, unknown> = {}) => ({
  sub: "fb-1",
  phone_number: "+919000000001",
  sign_in_provider: "phone",
  auth_time: NOW - 10,
  iat: NOW - 10,
  ...over,
});

test("freshPhone: an OTP sign-in in the last 5 minutes, minted at that sign-in", () => {
  const ok = freshPhone(claims({ auth_time: NOW - 299, iat: NOW - 299 }), NOW);
  assert.deepEqual(ok, { phone: "+919000000001", sub: "fb-1", authTime: NOW - 299, proofKey: proofKeyOf("fb-1", NOW - 299) });
  assert.ok(freshPhone(claims({ auth_time: NOW - PHONE_FRESH_S, iat: NOW - PHONE_FRESH_S }), NOW), "300 s is still fresh");
  assert.equal(freshPhone(claims({ auth_time: NOW - 301, iat: NOW - 301 }), NOW), null, "301 s");
  assert.equal(freshPhone(claims({ auth_time: NOW - 100, iat: NOW - 39 }), NOW), null, "iat - auth_time = 61: a refreshed token");
  assert.ok(freshPhone(claims({ auth_time: NOW - 100, iat: NOW - 40 }), NOW), "iat - auth_time = 60");
  assert.equal(freshPhone(claims({ sign_in_provider: "password" }), NOW), null, "not an OTP");
  assert.equal(freshPhone(claims({ sign_in_provider: null }), NOW), null, "no provider");
  assert.equal(freshPhone(claims({ phone_number: "+19000000001" }), NOW), null, "+1");
  assert.equal(freshPhone(claims({ phone_number: undefined }), NOW), null, "no number");
  assert.equal(freshPhone(claims({ auth_time: undefined }), NOW), null, "no auth_time");
  assert.equal(freshPhone(claims({ auth_time: null }), NOW), null, "null auth_time");
  assert.equal(freshPhone(claims({ auth_time: NOW - 10.5 }), NOW), null, "not whole seconds");
  assert.equal(freshPhone(claims({ sub: "" }), NOW), null, "no Firebase user");
  assert.ok(freshPhone(claims({ auth_time: NOW + 60, iat: NOW + 60 }), NOW), "a minute of clock skew");
  assert.equal(freshPhone(claims({ auth_time: NOW + 61, iat: NOW + 61 }), NOW), null, "further in the future");
  assert.equal(freshPhone(null, NOW), null);
});

test("proofKey: sha256 hex of sub:auth_time, the same for every token of one sign-in", () => {
  const k = proofKeyOf("fb-1", 1700000000);
  assert.equal(k, createHash("sha256").update("fb-1:1700000000").digest("hex"));
  assert.match(k, /^[0-9a-f]{64}$/);
  const a = freshPhone(claims({ auth_time: NOW - 50, iat: NOW - 50 }), NOW);
  const b = freshPhone(claims({ auth_time: NOW - 50, iat: NOW - 20 }), NOW);
  assert.equal(a?.proofKey, b?.proofKey, "two tokens of one OTP sign-in count once");
  assert.notEqual(a?.proofKey, freshPhone(claims({ auth_time: NOW - 51, iat: NOW - 51 }), NOW)?.proofKey);
  assert.notEqual(a?.proofKey, freshPhone(claims({ sub: "fb-2", auth_time: NOW - 50, iat: NOW - 50 }), NOW)?.proofKey);
});

test("freshGoogle: a Google sign-in in the last 10 minutes", () => {
  assert.equal(freshGoogle({ oauthAt: NOW - 599 }, NOW), true);
  assert.equal(freshGoogle({ oauthAt: NOW - GOOGLE_FRESH_S }, NOW), true);
  assert.equal(freshGoogle({ oauthAt: NOW - 601 }, NOW), false);
  assert.equal(freshGoogle({ oauthAt: NOW + 30 }, NOW), true, "small clock skew");
  assert.equal(freshGoogle({ oauthAt: NOW + 3600 }, NOW), false);
  assert.equal(freshGoogle({ oauthAt: Number.NaN }, NOW), false);
});

test("oauthAmrAt: the amr oauth timestamp, null for any other sign-in", () => {
  const tok = (payload: object) => `${b64({ alg: "HS256" })}.${b64(payload)}.sig`;
  assert.equal(oauthAmrAt(tok({ amr: [{ method: "oauth", timestamp: 1700 }] })), 1700);
  assert.equal(oauthAmrAt(tok({ amr: [{ method: "password", timestamp: 1900 }, { method: "oauth", timestamp: 1700 }] })), 1700);
  assert.equal(oauthAmrAt(tok({ amr: [{ method: "oauth", timestamp: 1700 }, { method: "oauth", timestamp: 1800 }] })), 1800, "the latest");
  assert.equal(oauthAmrAt(tok({ amr: [{ method: "password", timestamp: 1700 }] })), null);
  assert.equal(oauthAmrAt(tok({ amr: [{ method: "oauth" }] })), null, "no timestamp");
  assert.equal(oauthAmrAt(tok({ amr: [{ method: "oauth", timestamp: "1700" }] })), null);
  assert.equal(oauthAmrAt(tok({})), null);
  assert.equal(oauthAmrAt("a.b.c"), null);
  assert.equal(oauthAmrAt("nope"), null);
  assert.equal(oauthAmrAt(null), null);
});

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

const check = createIdentityChecker({
  supabaseUrl: SUPABASE,
  anonKey: "anon",
  checkFirebase: checkFirebaseIdToken,
  fetchImpl: (input, init) => fetch(input, init),
  now: Date.now,
});

test("identity: Google means a Google sign-in (amr oauth), never an email and password session", async () => {
  net.reset();
  const password = supabaseToken({ method: "password" });
  net.users.set(password, googleUser());
  assert.deepEqual(await check(password), { invalid: true }, "providers google, amr password");

  const noAmr = supabaseToken({ amr: [] });
  net.users.set(noAmr, googleUser());
  assert.deepEqual(await check(noAmr), { invalid: true });

  const oauth = supabaseToken({ ageS: 120 });
  net.users.set(oauth, googleUser());
  const r = await check(oauth);
  assert.ok("ok" in r && r.ok.kind === "google");
  if ("ok" in r && r.ok.kind === "google") {
    assert.equal(r.ok.uid, googleUser().id);
    assert.ok(Math.abs(r.ok.oauthAt - (Math.floor(Date.now() / 1000) - 120)) <= 2, "oauthAt is the Google sign-in's time");
  }
});

test("identity: a phone token carries the Firebase user, its sign-in time, mint time and provider", async () => {
  net.reset();
  const t = phoneToken({ ageS: 200, mintS: 5, sub: "fb-ravi", phone: "+919000000002" });
  const r = await check(t);
  assert.ok("ok" in r && r.ok.kind === "phone");
  if ("ok" in r && r.ok.kind === "phone") {
    const now = Math.floor(Date.now() / 1000);
    assert.equal(r.ok.phone, "+919000000002");
    assert.equal(r.ok.sub, "fb-ravi");
    assert.equal(r.ok.provider, "phone");
    assert.ok(r.ok.authTime !== null && Math.abs(r.ok.authTime - (now - 200)) <= 2);
    assert.equal(r.ok.iat - (r.ok.authTime ?? 0), 5);
  }
  const anon = await check(phoneToken({ provider: null, sub: "fb-x", phone: "+919000000003" }));
  assert.ok("ok" in anon && anon.ok.kind === "phone" && anon.ok.provider === null, "no firebase.sign_in_provider: null, so never fresh");
});

test("checkFirebaseIdToken reads auth_time, iat and firebase.sign_in_provider", async () => {
  const r = await checkFirebaseIdToken(phoneToken({ ageS: 30, provider: "phone" }));
  assert.ok("ok" in r);
  if ("ok" in r) {
    assert.equal(r.ok.sign_in_provider, "phone");
    assert.equal(typeof r.ok.auth_time, "number");
    assert.equal(r.ok.iat, r.ok.auth_time);
  }
  const other = await checkFirebaseIdToken(phoneToken({ provider: "anonymous" }));
  assert.ok("ok" in other && other.ok.sign_in_provider === "anonymous");
});
