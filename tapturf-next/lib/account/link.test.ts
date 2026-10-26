import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loginErrorText, readWhy, type Why } from "../auth/callback";
import { safeNext } from "../auth/next";
import {
  authorizeUrl,
  challengeOf,
  exchangePkce,
  legHash,
  linkCallbackPlan,
  linkCookie,
  linkCookieOptions,
  linkDoneCookie,
  newVerifier,
  packLinkCookie,
  pkceErrorWhy,
  readCookie,
  readLinkCookie,
  revokeSession,
} from "./link";
import { STATUS } from "./route";
import {
  googleFresh,
  linkAttach,
  linkGoogle,
  linkLeg,
  linkStart,
  linkStatus,
  removePhone,
  resolveAccount,
  setPhone,
  toProfile,
  unlinkGoogle,
} from "./server";
import type { GoogleIdentity, PhoneIdentity } from "./identity";
import type { AccountError } from "./types";
import { dbProfile, installNet, net, oldDbProfile, testEnv } from "./testkit";

testEnv();
installNet();

const V = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"; // RFC 7636 appendix B

/* ------------------------------------------------------------------ */
/* The leg's verifier and cookie                                       */
/* ------------------------------------------------------------------ */

test("challengeOf matches RFC 7636's example; legHash is 64 hex and differs from it", () => {
  assert.equal(challengeOf(V), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  const h = legHash(V);
  assert.match(h ?? "", /^[0-9a-f]{64}$/);
  assert.equal(h, createHash("sha256").update(`tt-link:${V}`).digest("hex"));
  assert.notEqual(h, createHash("sha256").update(V).digest("hex"), "not the plain hash of the verifier");
  for (const bad of [null, undefined, "", V.slice(1), `${V}a`, `${V.slice(1)}.`, `${V.slice(1)}=`]) assert.equal(legHash(bad), null, String(bad));
});

test("newVerifier: 43 base64url characters, random", () => {
  const a = newVerifier();
  const b = newVerifier();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  assert.ok(legHash(a));
});

test("the link cookie: verifier and then, then always through safeNext", () => {
  const packed = packLinkCookie(V, "/dashboard?tab=profile");
  assert.deepEqual(readLinkCookie(packed), { verifier: V, then: "/dashboard?tab=profile" });
  assert.deepEqual(readLinkCookie(packLinkCookie(V, "/game/abc?x=1#y")), { verifier: V, then: "/game/abc?x=1#y" });
  for (const evil of ["https://evil.example", "//evil.example", "/\\evil.example", "/account/link", "/account/link?then=/x", "/login", "javascript:alert(1)", null]) {
    assert.equal(readLinkCookie(packLinkCookie(V, evil))?.then, "/", String(evil));
  }
  assert.equal(readLinkCookie(packLinkCookie(V, `/${"a".repeat(600)}`))?.then, "/", "too long");
  // A then planted around the packing is still checked when read.
  assert.equal(readLinkCookie(`${V}.${Buffer.from("//evil.example").toString("base64url")}`)?.then, "/");
  for (const bad of [undefined, "", V, `${V}`.slice(2) + ".Lw", `${V}.a+b`, `${V}.a.b`, `x${V}.Lw`, `${V}.${"A".repeat(2000)}`]) {
    assert.equal(readLinkCookie(bad), null, String(bad));
  }
});

test("cookie names and options: __Host- on https, Lax, HttpOnly, Path=/, 10 minutes", () => {
  assert.equal(linkCookie(true), "__Host-tt_link");
  assert.equal(linkCookie(false), "tt_link");
  assert.equal(linkDoneCookie(true), "__Host-tt_link_done");
  assert.equal(linkDoneCookie(false), "tt_link_done");
  assert.deepEqual(linkCookieOptions(true), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  assert.deepEqual(linkCookieOptions(false, 0), { httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: 0 });
});

test("readCookie", () => {
  const r = new Request("http://x/", { headers: { cookie: "a=1; tt_link=abc.def ;b=2" } });
  assert.equal(readCookie(r, "tt_link"), "abc.def");
  assert.equal(readCookie(r, "b"), "2");
  assert.equal(readCookie(r, "link"), undefined);
  assert.equal(readCookie(new Request("http://x/"), "a"), undefined);
});

test("authorizeUrl: supabase-js's parameters, S256, Google's account picker", () => {
  const u = authorizeUrl("https://example.supabase.co/", "https://www.tapturf.in/api/account/link/google/callback", challengeOf(V));
  assert.equal(
    u,
    "https://example.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fwww.tapturf.in%2Fapi%2Faccount%2Flink%2Fgoogle%2Fcallback" +
      "&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=s256&prompt=select_account",
  );
  const p = new URL(u).searchParams;
  assert.equal(p.get("redirect_to"), "https://www.tapturf.in/api/account/link/google/callback");
  assert.equal(p.get("code_challenge_method"), "s256");
});

/* ------------------------------------------------------------------ */
/* GoTrue                                                              */
/* ------------------------------------------------------------------ */

test("exchangePkce: posts the code and verifier; maps GoTrue's error codes", async () => {
  const sent: Array<{ url: string; body: unknown; headers: Headers }> = [];
  const stub = (status: number, body: unknown) =>
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({ url: String(input), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
      return Response.json(body, { status });
    }) as typeof fetch;

  const ok = await exchangePkce("https://example.supabase.co", "anon", "code-1", V, stub(200, { access_token: "at", user: { id: "u" } }));
  assert.deepEqual(ok, { ok: { accessToken: "at", user: { id: "u" } } });
  assert.equal(sent[0].url, "https://example.supabase.co/auth/v1/token?grant_type=pkce");
  assert.deepEqual(sent[0].body, { auth_code: "code-1", code_verifier: V });
  assert.equal(sent[0].headers.get("apikey"), "anon");
  assert.equal(sent[0].headers.get("x-supabase-api-version"), "2024-01-01");

  const why = async (status: number, body: unknown) => {
    const r = await exchangePkce("https://example.supabase.co", "anon", "c", V, stub(status, body));
    return "why" in r ? r.why : "ok";
  };
  assert.equal(await why(404, { code: "flow_state_not_found", message: "invalid flow state, no valid flow state found" }), "used");
  assert.equal(await why(400, { error_code: "flow_state_not_found" }), "used", "older answers: error_code");
  assert.equal(await why(400, { error: "invalid_grant", error_description: "invalid flow state, no valid flow state found" }), "used");
  assert.equal(await why(400, { code: "flow_state_expired" }), "expired");
  assert.equal(await why(400, { code: "bad_code_verifier" }), "lost");
  assert.equal(await why(400, { code: "validation_failed" }), "google");
  assert.equal(await why(500, { code: "unexpected_failure" }), "unavailable");
  assert.equal(await why(200, { access_token: "at" }), "google", "no user");
  const offline = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  assert.deepEqual(await exchangePkce("https://example.supabase.co", "anon", "c", V, offline), { why: "unavailable" });
  assert.equal(pkceErrorWhy(429, {}), "unavailable");
});

test("revokeSession: logout with that session's token, never throws", async () => {
  const seen: Array<{ url: string; auth: string | null }> = [];
  await revokeSession("https://example.supabase.co", "anon", "at-1", 1000, (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(input), auth: new Headers(init?.headers).get("authorization") });
    return new Response(null, { status: 204 });
  }) as typeof fetch);
  assert.deepEqual(seen, [{ url: "https://example.supabase.co/auth/v1/logout?scope=local", auth: "Bearer at-1" }]);
  const quiet = console.warn;
  console.warn = () => {};
  try {
    await revokeSession("https://example.supabase.co", "anon", "at-1", 1000, (async () => {
      throw new Error("down");
    }) as typeof fetch);
  } finally {
    console.warn = quiet;
  }
});

test("linkCallbackPlan: every return from Google", () => {
  const plan = (hasCookie: boolean, hasDone: boolean, providerWhy: Why | null, hasCode: boolean) => linkCallbackPlan({ hasCookie, hasDone, providerWhy, hasCode });
  // No link cookie: the code is never used.
  assert.equal(plan(false, true, null, true), "page", "a Back after a finished link");
  assert.equal(plan(false, false, null, true), "lost", "another browser");
  // This browser started an attempt lately (tt_link_seen), but its 10-minute cookie ran out: that took too long here.
  assert.equal(linkCallbackPlan({ hasCookie: false, hasDone: false, hasSeen: true, providerWhy: null, hasCode: true }), "expired", "the same browser, after 10 minutes");
  assert.equal(linkCallbackPlan({ hasCookie: false, hasDone: true, hasSeen: true, providerWhy: null, hasCode: true }), "page", "a Back after a finished link still");
  assert.equal(linkCallbackPlan({ hasCookie: true, hasDone: false, hasSeen: true, providerWhy: null, hasCode: true }), "exchange", "with the cookie, as before");
  assert.equal(plan(false, true, "denied", false), "page");
  assert.equal(plan(false, false, "denied", false), "lost");
  // Google or GoTrue said no.
  assert.equal(plan(true, false, "used", false), "page");
  assert.equal(plan(true, false, "again", false), "page");
  assert.equal(plan(true, false, "denied", false), "err_denied");
  assert.equal(plan(true, false, "google", false), "err_google");
  assert.equal(plan(true, false, "other", true), "err_google");
  assert.equal(plan(true, false, null, false), "err_google", "no code");
  assert.equal(plan(true, false, null, true), "exchange");
  assert.equal(plan(true, true, null, true), "exchange");
});

/* ------------------------------------------------------------------ */
/* Sign-in text, next, statuses                                        */
/* ------------------------------------------------------------------ */

test("safeNext refuses /account/link as a sign-in's next", () => {
  for (const bad of ["/account/link", "/account/link?then=/dashboard", "/account/link/", "/account/link#x"]) assert.equal(safeNext(bad), "/", bad);
  assert.equal(safeNext("/account/linked"), "/account/linked");
  assert.equal(safeNext("/dashboard?tab=profile"), "/dashboard?tab=profile");
});

test("loginErrorText: error=account with linking and replaced", () => {
  assert.match(loginErrorText("account", "linking") ?? "", /adding this Google account to a TapTurf account that logs in with a phone number/);
  assert.match(loginErrorText("account", "replaced") ?? "", /taken off your TapTurf account/);
  assert.match(loginErrorText("account", "nonsense") ?? "", /Couldn't finish/);
  assert.equal(readWhy("replaced"), "replaced");
  assert.equal(loginErrorText("other", "linking"), null);
});

test("STATUS: each new error", () => {
  const want: Partial<Record<AccountError, number>> = {
    linking: 409,
    replaced: 409,
    not_allowed: 409,
    has_account: 409,
    other_account: 409,
    mismatch: 409,
    used: 409,
    expired: 410,
    unverified: 422,
    proof: 422,
    reauth: 403,
    stale: 403,
  };
  for (const [k, v] of Object.entries(want)) assert.equal(STATUS[k as AccountError], v, k);
});

/* ------------------------------------------------------------------ */
/* The database calls                                                  */
/* ------------------------------------------------------------------ */

test("toProfile: the five new keys, only true counts", () => {
  const p = toProfile({
    id: "u",
    name: "A",
    google_email: "asha.p@example.com",
    google_linkable: true,
    phone_confirmed: true,
    phone_settable: true,
    ask_google: true,
  });
  assert.equal(p?.google_email, "asha.p@example.com");
  assert.equal(p?.google_linkable, true);
  assert.equal(p?.phone_confirmed, true);
  assert.equal(p?.phone_settable, true);
  assert.equal(p?.ask_google, true);
  const q = toProfile({ id: "u", name: "A", google_email: 5, google_linkable: "true", phone_confirmed: 1, phone_settable: "yes", ask_google: null });
  assert.deepEqual(
    [q?.google_email, q?.google_linkable, q?.phone_confirmed, q?.phone_settable, q?.ask_google],
    [null, false, false, false, false],
  );
});

const phoneId: PhoneIdentity = { kind: "phone", phone: "+919000000001", sub: "fb", authTime: 1, iat: 1, provider: "phone" };
const googleId: GoogleIdentity = { kind: "google", uid: "11111111-2222-3333-4444-555555555555", email: "g@example.com", name: "G", avatar: null, oauthAt: 1 };

test("resolveAccount: linking, replaced and wasUsed; p_log follows opts.log for both kinds", async () => {
  net.reset();
  let answer: unknown = { r: "linking" };
  net.rpc.account_resolve = () => answer;
  assert.deepEqual(await resolveAccount(googleId, { create: true, log: true }), { r: "linking" });
  answer = { r: "replaced" };
  assert.deepEqual(await resolveAccount(googleId), { r: "replaced" });
  answer = { r: "name", was_used: true };
  assert.deepEqual(await resolveAccount(phoneId, { create: true }), { r: "name", wasUsed: true });
  answer = { r: "new" };
  assert.deepEqual(await resolveAccount(phoneId), { r: "new", wasUsed: false });
  answer = { r: "unavailable" };
  assert.deepEqual(await resolveAccount(phoneId), { unavailable: true });
  answer = dbProfile({ created: true });
  const ok = await resolveAccount(googleId, { create: true, log: true });
  assert.ok("ok" in ok && ok.created === true && ok.ok.id === "acc-1" && ok.knowsLinks === true);

  const [g1, , , , , g2] = net.calls("account_resolve").map((c) => c.args);
  assert.equal(g1.p_log, true, "a Google sign-in logged when asked (the callback)");
  assert.equal(g1.p_create, true);
  assert.equal(g1.p_kind, "google");
  assert.equal(g1.p_uid, googleId.uid);
  assert.equal(g2.p_log, true);
  assert.equal(net.calls("account_resolve")[1].args.p_log, false, "not asked: not logged");
  assert.equal(net.calls("account_resolve")[2].args.p_log, false);
  assert.equal(net.calls("account_resolve")[0].args.p_key, "test-account-key");
});

test("resolveAccount: knowsLinks says whether the database has the account links", async () => {
  net.reset();
  net.rpc.account_resolve = () => oldDbProfile();
  const old = await resolveAccount(googleId, { create: true, log: true });
  assert.ok("ok" in old && old.knowsLinks === false);
  assert.equal("ok" in old && old.ok.google_linkable, false, "no new keys: nothing new offered");
});

test("googleFresh: account_google_fresh with the Google profile", async () => {
  net.reset();
  net.rpc.account_google_fresh = () => dbProfile({ created: true, id: googleId.uid });
  const r = await googleFresh(googleId);
  assert.ok("ok" in r && r.created && r.ok.id === googleId.uid);
  assert.deepEqual(net.calls("account_google_fresh")[0].args, { p_key: "test-account-key", p_uid: googleId.uid, p_email: "g@example.com", p_name: "G", p_avatar: null });
  net.rpc.account_google_fresh = () => ({ r: "linking" });
  assert.deepEqual(await googleFresh(googleId), { r: "linking" });
});

test("linkStart, linkLeg: arguments and answers", async () => {
  net.reset();
  const key = "a".repeat(64);
  const hash = "b".repeat(64);
  let answer: unknown = { r: "ok", expires_at: "2026-10-26T10:10:00+00:00" };
  net.rpc.account_link_start = () => answer;
  assert.deepEqual(await linkStart("+919000000001", "fb", 1_790_000_000, key, hash), { ok: { expiresAt: "2026-10-26T10:10:00+00:00" } });
  assert.deepEqual(net.calls("account_link_start")[0].args, {
    p_key: "test-account-key",
    p_phone: "+919000000001",
    p_fb_sub: "fb",
    p_auth_time: new Date(1_790_000_000_000).toISOString(),
    p_proof_key: key,
    p_secret_hash: hash,
  });
  answer = { r: "limit", until: "2026-10-26T11:00:00+00:00" };
  assert.deepEqual(await linkStart("+919000000001", "fb", 1, key, hash), { r: "limit", until: "2026-10-26T11:00:00+00:00" });
  for (const r of ["new", "conflict", "not_allowed", "stale", "used", "bad"]) {
    answer = { r };
    assert.deepEqual(await linkStart("+919000000001", "fb", 1, key, hash), { r });
  }
  answer = { r: "ok" };
  assert.deepEqual(await linkStart("+919000000001", "fb", 1, key, hash), { unavailable: true }, "ok without expires_at");
  answer = { r: "surprise" };
  assert.deepEqual(await linkStart("+919000000001", "fb", 1, key, hash), { unavailable: true });

  net.rpc.account_link_leg = () => ({ r: "mismatch" });
  assert.deepEqual(await linkLeg(hash, "fb", key), { r: "mismatch" });
  assert.deepEqual(net.calls("account_link_leg")[0].args, { p_key: "test-account-key", p_secret_hash: hash, p_fb_sub: "fb", p_new_secret_hash: key });
});

test("linkAttach, linkStatus, linkGoogle: the brief passes through", async () => {
  net.reset();
  net.rpc.account_link_attach = () => ({ r: "ok", other_empty: true, other_made_on: "2026-10-01" });
  assert.deepEqual(await linkAttach("h".repeat(64), googleId.uid), { r: "ok", otherEmpty: true, otherMadeOn: "2026-10-01" });
  net.rpc.account_link_attach = () => ({ r: "ok" });
  assert.deepEqual(await linkAttach("h".repeat(64), googleId.uid), { r: "ok" });
  net.rpc.account_link_attach = () => ({ r: "has_account", other_empty: false, other_made_on: "2026-09-01" });
  assert.deepEqual(await linkAttach("h".repeat(64), googleId.uid), { r: "has_account", otherEmpty: false, otherMadeOn: "2026-09-01" });

  net.rpc.account_link_status = () => ({
    r: "ok",
    state: "attached",
    google_email: "asha.p@example.com",
    expires_at: "2026-10-26T10:10:00+00:00",
    legs_left: 4,
    other_empty: true,
    other_made_on: "2026-10-01",
  });
  assert.deepEqual(await linkStatus("h".repeat(64), "fb"), {
    state: "attached",
    googleEmail: "asha.p@example.com",
    expiresAt: "2026-10-26T10:10:00+00:00",
    legsLeft: 4,
    otherEmpty: true,
    otherMadeOn: "2026-10-01",
  });
  net.rpc.account_link_status = () => ({ r: "ok", state: "refused", problem: "other_account", expires_at: "x", legs_left: 3 });
  assert.deepEqual(await linkStatus("h".repeat(64), "fb"), { state: "refused", problem: "other_account", expiresAt: "x", legsLeft: 3 });
  net.rpc.account_link_status = () => ({ r: "ok", state: "closed", outcome: "linked", google_email: "asha.p@example.com" });
  assert.deepEqual(await linkStatus("h".repeat(64), "fb"), { state: "closed", outcome: "linked", googleEmail: "asha.p@example.com" });
  net.rpc.account_link_status = () => ({ r: "ok", state: "closed", outcome: "expired" });
  assert.deepEqual(await linkStatus("h".repeat(64), "fb"), { state: "closed", outcome: "expired", googleEmail: null });
  net.rpc.account_link_status = () => ({ r: "ok", state: "odd" });
  assert.deepEqual(await linkStatus("h".repeat(64), "fb"), { unavailable: true });

  net.rpc.account_link_google = () => dbProfile({ google_email: "asha.p@example.com" });
  const done = await linkGoogle("h".repeat(64), "+919000000001", "fb");
  assert.ok("ok" in done && done.ok.google_email === "asha.p@example.com");
  assert.deepEqual(net.calls("account_link_google")[0].args, { p_key: "test-account-key", p_secret_hash: "h".repeat(64), p_phone: "+919000000001", p_fb_sub: "fb" });
  net.rpc.account_link_google = () => ({ r: "has_account", other_empty: false, other_made_on: "2026-09-01" });
  assert.deepEqual(await linkGoogle("h".repeat(64), "+919000000001", "fb"), { r: "has_account", otherEmpty: false, otherMadeOn: "2026-09-01" });
});

test("unlinkGoogle, setPhone, removePhone: arguments and answers", async () => {
  net.reset();
  net.rpc.account_unlink_google = () => ({ r: "stale" });
  assert.deepEqual(await unlinkGoogle("+919000000001", "fb", 1_790_000_000, "a".repeat(64)), { r: "stale" });
  assert.equal(net.calls("account_unlink_google")[0].args.p_auth_time, new Date(1_790_000_000_000).toISOString());

  net.rpc.account_set_phone = () => ({ r: "taken", holder_opens: true, holder_empty: false, holder_made_on: "2026-09-01" });
  assert.deepEqual(await setPhone(googleId.uid, "+919000000099", "a".repeat(64)), { r: "taken", holderOpens: true, holderEmpty: false, holderMadeOn: "2026-09-01" });
  assert.deepEqual(net.calls("account_set_phone")[0].args, { p_key: "test-account-key", p_auth_uid: googleId.uid, p_phone: "+919000000099", p_proof_key: "a".repeat(64) });
  net.rpc.account_set_phone = () => ({ r: "taken", holder_opens: false });
  assert.deepEqual(await setPhone(googleId.uid, "+919000000099", "a".repeat(64)), { r: "taken", holderOpens: false }, "the unique-violation answer has no brief");
  net.rpc.account_set_phone = () => ({ r: "limit", until: "2026-11-20T00:00:00+00:00" });
  assert.deepEqual(await setPhone(googleId.uid, "+919000000099", "a".repeat(64)), { r: "limit", until: "2026-11-20T00:00:00+00:00" });
  net.rpc.account_set_phone = () => ({ r: "not_allowed" });
  assert.deepEqual(await setPhone(googleId.uid, "+919000000099", "a".repeat(64)), { r: "not_allowed" });

  net.rpc.account_remove_phone = () => dbProfile({ phone: null });
  const r = await removePhone(googleId.uid);
  assert.ok("ok" in r && r.ok.phone === null);
  net.rpc.account_remove_phone = () => ({ r: "new" });
  assert.deepEqual(await removePhone(googleId.uid), { r: "new" });
});
