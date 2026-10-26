import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proofKeyOf } from "./fresh";
import { challengeOf, legHash, packLinkCookie, readLinkCookie } from "./link";
import { cancelLink, completeLink, linkCallback, linkState, newLeg, removeGoogle, startLink } from "./linkRoutes";
import { getMe, patchMe, postMe } from "./meRoutes";
import { addPhone, deletePhone } from "./phoneRoutes";
import { googleCallback, type CallbackSession, type PendingCookie } from "../auth/googleCallback";
import {
  ANON,
  cookieValue,
  dbProfile,
  GOOGLE_UID,
  googleSession,
  googleUser,
  installNet,
  net,
  nowS,
  oldDbProfile,
  PHONE,
  phoneToken,
  req,
  setCookies,
  settle,
  SUB,
  SUPABASE,
  supabaseToken,
  testEnv,
} from "./testkit";

testEnv();
installNet();

const V = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const linkCookieHeader = (then = "/dashboard?tab=profile", v = V) => `tt_link=${packLinkCookie(v, then)}`;
const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

test("start: a fresh OTP sign-in gets Google's URL and the link cookie (http: tt_link)", async () => {
  net.reset();
  net.rpc.account_link_start = () => ({ r: "ok", expires_at: "2026-10-26T10:10:00+00:00" });
  const token = phoneToken({ ageS: 30 });
  const res = await startLink(req("/api/account/link/google", { method: "POST", token, body: { then: "/game/abc" } }));
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.equal(body.expiresAt, "2026-10-26T10:10:00+00:00");
  const line = setCookies(res).get("tt_link") ?? "";
  assert.match(line, /; Path=\/(;|$)/);
  assert.match(line, /HttpOnly/);
  assert.match(line, /SameSite=lax/i);
  assert.match(line, /Max-Age=600/);
  assert.doesNotMatch(line, /Secure/);
  const c = readLinkCookie(cookieValue(line));
  assert.ok(c);
  assert.equal(c.then, "/game/abc");
  // The URL: GoTrue's Google sign-in, back to the link callback, with the challenge of the cookie's verifier.
  const url = new URL(String(body.url));
  assert.equal(`${url.origin}${url.pathname}`, `${SUPABASE}/auth/v1/authorize`);
  assert.equal(url.searchParams.get("provider"), "google");
  assert.equal(url.searchParams.get("redirect_to"), "http://localhost:3000/api/account/link/google/callback");
  assert.equal(url.searchParams.get("code_challenge_method"), "s256");
  assert.equal(url.searchParams.get("code_challenge"), challengeOf(c.verifier));
  assert.equal(url.searchParams.get("prompt"), "select_account");
  // The database got the leg's hash (never the verifier), the Firebase user and the sign-in it counts once.
  const args = net.calls("account_link_start")[0].args;
  assert.equal(args.p_secret_hash, legHash(c.verifier));
  assert.equal(args.p_phone, PHONE);
  assert.equal(args.p_fb_sub, SUB);
  const authTime = Date.parse(String(args.p_auth_time)) / 1000;
  assert.ok(Math.abs(authTime - (nowS() - 30)) <= 2);
  assert.equal(args.p_proof_key, proofKeyOf(SUB, authTime));
  assert.ok(!JSON.stringify(args).includes(c.verifier));
});

test("start: on https the cookie is __Host-tt_link, Secure; then defaults to the profile", async () => {
  net.reset();
  net.rpc.account_link_start = () => ({ r: "ok", expires_at: "x" });
  const res = await startLink(req("/api/account/link/google", { method: "POST", token: phoneToken(), body: {}, https: true }));
  assert.equal(res.status, 200);
  const cookies = setCookies(res);
  assert.ok(!cookies.has("tt_link"));
  const line = cookies.get("__Host-tt_link") ?? "";
  assert.match(line, /Secure/);
  assert.match(line, /HttpOnly/);
  assert.match(line, /; Path=\/(;|$)/);
  assert.doesNotMatch(line, /Domain=/i);
  assert.equal(readLinkCookie(cookieValue(line))?.then, "/dashboard?tab=profile");
  assert.equal(new URL(String((await json(res)).url)).searchParams.get("redirect_to"), "https://www.tapturf.test/api/account/link/google/callback");
});

test("start: 403 reauth for a days-old or refreshed phone token without a proof; nothing reaches the database", async () => {
  net.reset();
  for (const token of [phoneToken({ ageS: 2 * 86_400, mintS: 2 * 86_400 - 600 }), phoneToken({ ageS: 200, mintS: 61 }), phoneToken({ ageS: 301 })]) {
    const res = await startLink(req("/api/account/link/google", { method: "POST", token, body: {} }));
    assert.equal(res.status, 403);
    assert.equal((await json(res)).error, "reauth");
    assert.ok(!setCookies(res).has("tt_link"));
  }
  assert.equal(net.calls("account_link_start").length, 0);
});

test("start: a proof for the same number and Firebase user counts; for another, 422 proof", async () => {
  net.reset();
  net.rpc.account_link_start = () => ({ r: "ok", expires_at: "x" });
  const old = phoneToken({ ageS: 7_200, mintS: 7_000 });
  const proof = phoneToken({ ageS: 20 });
  const ok = await startLink(req("/api/account/link/google", { method: "POST", token: old, body: { proof } }));
  assert.equal(ok.status, 200);
  const authTime = Date.parse(String(net.calls("account_link_start")[0].args.p_auth_time)) / 1000;
  assert.ok(Math.abs(authTime - (nowS() - 20)) <= 2, "the proof's sign-in, not the Bearer's");

  const cases: Array<[string, string]> = [
    ["another number", phoneToken({ ageS: 20, phone: "+919000000002" })],
    ["another Firebase user", phoneToken({ ageS: 20, sub: "fb-other" })],
    ["not a token", "x.y.z"],
  ];
  for (const [what, p] of cases) {
    const res = await startLink(req("/api/account/link/google", { method: "POST", token: old, body: { proof: p } }));
    assert.equal(res.status, 422, what);
    assert.equal((await json(res)).error, "proof", what);
  }
  const stale = await startLink(req("/api/account/link/google", { method: "POST", token: old, body: { proof: phoneToken({ ageS: 400 }) } }));
  assert.equal(stale.status, 403, "a stale proof and a stale sign-in");
  const notString = await startLink(req("/api/account/link/google", { method: "POST", token: old, body: { proof: 5 } }));
  assert.equal(notString.status, 400);
  assert.equal(net.calls("account_link_start").length, 1);
});

test("start: who may start, and the database's answers", async () => {
  net.reset();
  assert.equal((await startLink(req("/api/account/link/google", { method: "POST", body: {} }))).status, 401);
  const google = await startLink(req("/api/account/link/google", { method: "POST", token: googleSession(), body: {} }));
  assert.equal(google.status, 400, "a Google sign-in can't start");
  assert.equal((await startLink(req("/api/account/link/google", { method: "POST", token: phoneToken(), body: { then: 5 } }))).status, 400);

  const answers: Array<[unknown, number, string, Record<string, unknown>?]> = [
    [{ r: "stale" }, 403, "reauth"],
    [{ r: "used" }, 409, "used"],
    [{ r: "new" }, 404, "new"],
    [{ r: "conflict" }, 409, "conflict"],
    [{ r: "not_allowed" }, 409, "not_allowed"],
    [{ r: "bad" }, 400, "bad"],
    [{ r: "limit", until: "2026-10-26T11:00:00+00:00" }, 429, "limit", { until: "2026-10-26T11:00:00+00:00" }],
    [{ r: "unavailable" }, 503, "unavailable"],
  ];
  for (const [answer, status, error, extra] of answers) {
    net.rpc.account_link_start = () => answer;
    const res = await startLink(req("/api/account/link/google", { method: "POST", token: phoneToken(), body: {} }));
    assert.equal(res.status, status, error);
    assert.deepEqual(await json(res), { ...extra, error });
    assert.ok(!setCookies(res).has("tt_link"), `${error}: no cookie`);
  }
});

/* ------------------------------------------------------------------ */
/* Leg, status, complete, cancel, remove                               */
/* ------------------------------------------------------------------ */

test("leg: a new verifier on the same attempt, the same then", async () => {
  net.reset();
  net.rpc.account_link_leg = () => ({ r: "ok", expires_at: "x" });
  const res = await newLeg(req("/api/account/link/google/leg", { method: "POST", token: phoneToken({ ageS: 500 }), body: {}, cookie: linkCookieHeader("/game/abc") }));
  assert.equal(res.status, 200);
  const c = readLinkCookie(cookieValue(setCookies(res).get("tt_link")));
  assert.ok(c && c.verifier !== V);
  assert.equal(c.then, "/game/abc");
  const args = net.calls("account_link_leg")[0].args;
  assert.equal(args.p_secret_hash, legHash(V));
  assert.equal(args.p_new_secret_hash, legHash(c.verifier));
  assert.equal(args.p_fb_sub, SUB);
  assert.equal(new URL(String((await json(res)).url)).searchParams.get("code_challenge"), challengeOf(c.verifier));

  net.rpc.account_link_leg = () => ({ r: "mismatch" });
  assert.equal((await newLeg(req("/x", { method: "POST", token: phoneToken(), body: {}, cookie: linkCookieHeader() }))).status, 409);
  net.rpc.account_link_leg = () => ({ r: "limit", until: "u" });
  const limited = await newLeg(req("/x", { method: "POST", token: phoneToken(), body: {}, cookie: linkCookieHeader() }));
  assert.deepEqual([limited.status, await json(limited)], [429, { until: "u", error: "limit" }]);
  const none = await newLeg(req("/x", { method: "POST", token: phoneToken(), body: {} }));
  assert.equal(none.status, 410, "no cookie");
});

test("status: none without a cookie; the attempt's state for the same phone sign-in", async () => {
  net.reset();
  const none = await linkState(req("/api/account/link/google", { token: phoneToken() }));
  assert.deepEqual(await json(none), { state: "none" });
  assert.equal(net.calls("account_link_status").length, 0);
  net.rpc.account_link_status = () => ({ r: "ok", state: "attached", google_email: "asha.p@example.com", expires_at: "x", legs_left: 4, other_empty: true, other_made_on: "2026-10-01" });
  const res = await linkState(req("/api/account/link/google", { token: phoneToken(), cookie: linkCookieHeader() }));
  assert.equal(res.status, 200);
  assert.deepEqual(await json(res), { state: "attached", googleEmail: "asha.p@example.com", expiresAt: "x", legsLeft: 4, otherEmpty: true, otherMadeOn: "2026-10-01" });
  assert.deepEqual(net.calls("account_link_status")[0].args, { p_key: "test-account-key", p_secret_hash: legHash(V), p_fb_sub: SUB });
  assert.equal((await linkState(req("/x", { token: googleSession(), cookie: linkCookieHeader() }))).status, 400);
});

test("complete: ok and every final answer clear the cookie and set tt_link_done; 503 keeps it", async () => {
  net.reset();
  net.rpc.account_link_google = () => dbProfile({ email: "asha.p@example.com", google_email: "asha.p@example.com" });
  const ok = await completeLink(req("/api/account/link/google/complete", { method: "POST", token: phoneToken({ ageS: 500 }), body: {}, cookie: linkCookieHeader() }));
  assert.equal(ok.status, 200);
  assert.equal(((await json(ok)).profile as Record<string, unknown>).google_email, "asha.p@example.com");
  const set = setCookies(ok);
  assert.match(set.get("tt_link") ?? "", /Max-Age=0/);
  assert.match(set.get("tt_link_done") ?? "", /^tt_link_done=1;.*Max-Age=300/);
  assert.deepEqual(net.calls("account_link_google")[0].args, { p_key: "test-account-key", p_secret_hash: legHash(V), p_phone: PHONE, p_fb_sub: SUB });
  await settle();
  assert.equal(net.calls("account_phone_checked").length, 1, "after the reply: the number was checked");

  net.rpc.account_link_google = () => ({ r: "has_account", other_empty: false, other_made_on: "2026-09-01" });
  const has = await completeLink(req("/x", { method: "POST", token: phoneToken(), body: {}, cookie: linkCookieHeader() }));
  assert.deepEqual([has.status, await json(has)], [409, { otherEmpty: false, otherMadeOn: "2026-09-01", error: "has_account" }]);
  assert.match(setCookies(has).get("tt_link") ?? "", /Max-Age=0/);
  assert.ok(setCookies(has).has("tt_link_done"));

  for (const [r, status] of [["mismatch", 409], ["not_allowed", 409], ["other_account", 409], ["expired", 410], ["unverified", 422], ["bad", 400]] as const) {
    net.rpc.account_link_google = () => ({ r });
    const res = await completeLink(req("/x", { method: "POST", token: phoneToken(), body: {}, cookie: linkCookieHeader() }));
    assert.deepEqual([res.status, await json(res)], [status, { error: r }]);
    assert.ok(setCookies(res).has("tt_link_done"), r);
  }

  net.rpc.account_link_google = () => ({ r: "unavailable" });
  const down = await completeLink(req("/x", { method: "POST", token: phoneToken(), body: {}, cookie: linkCookieHeader() }));
  assert.equal(down.status, 503);
  assert.equal(setCookies(down).size, 0, "the cookie stays for a retry");

  const none = await completeLink(req("/x", { method: "POST", token: phoneToken(), body: {} }));
  assert.equal(none.status, 410, "no cookie: expired");
  assert.ok(setCookies(none).has("tt_link_done"));
});

test("DELETE: same-origin only; cancels by the cookie and clears it", async () => {
  net.reset();
  const tries: Array<Record<string, string>> = [{}, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "cross-site", origin: "https://evil.example" }, { origin: "https://evil.example" }, { origin: "null" }];
  for (const headers of tries) {
    const res = await cancelLink(req("/api/account/link/google", { method: "DELETE", cookie: linkCookieHeader(), headers }));
    assert.equal(res.status, 400, JSON.stringify(headers));
    assert.equal(setCookies(res).size, 0);
  }
  assert.equal(net.calls("account_link_cancel").length, 0);

  const res = await cancelLink(req("/api/account/link/google", { method: "DELETE", cookie: linkCookieHeader(), headers: { "sec-fetch-site": "same-origin" } }));
  assert.equal(res.status, 204);
  assert.match(setCookies(res).get("tt_link") ?? "", /Max-Age=0/);
  assert.deepEqual(net.calls("account_link_cancel")[0].args, { p_key: "test-account-key", p_secret_hash: legHash(V) });
  const byOrigin = await cancelLink(req("/api/account/link/google", { method: "DELETE", headers: { origin: "http://localhost:3000", host: "localhost:3000" } }));
  assert.equal(byOrigin.status, 204, "Origin equal to the host; no cookie: nothing to cancel");
  assert.equal(net.calls("account_link_cancel").length, 1);
});

test("remove: a fresh OTP (or proof), then account_unlink_google", async () => {
  net.reset();
  const stale = await removeGoogle(req("/api/account/link/google/remove", { method: "POST", token: phoneToken({ ageS: 3_600, mintS: 3_000 }), body: {} }));
  assert.deepEqual([stale.status, await json(stale)], [403, { error: "reauth" }]);
  net.rpc.account_unlink_google = () => dbProfile({ google_email: null });
  const ok = await removeGoogle(req("/x", { method: "POST", token: phoneToken({ ageS: 3_600, mintS: 3_000 }), body: { proof: phoneToken({ ageS: 15 }) } }));
  assert.equal(ok.status, 200);
  const args = net.calls("account_unlink_google")[0].args;
  assert.equal(args.p_phone, PHONE);
  assert.equal(args.p_fb_sub, SUB);
  assert.equal(args.p_proof_key, proofKeyOf(SUB, Date.parse(String(args.p_auth_time)) / 1000));
  for (const [r, status, error] of [["stale", 403, "reauth"], ["used", 409, "used"], ["not_allowed", 409, "not_allowed"], ["new", 404, "new"]] as const) {
    net.rpc.account_unlink_google = () => ({ r });
    const res = await removeGoogle(req("/x", { method: "POST", token: phoneToken(), body: {} }));
    assert.deepEqual([res.status, await json(res)], [status, { error }]);
  }
});

/* ------------------------------------------------------------------ */
/* The link callback                                                   */
/* ------------------------------------------------------------------ */

const callbackUrl = (q: string) => `/api/account/link/google/callback?${q}`;
const location = (res: Response) => new URL(res.headers.get("location") ?? "", "http://localhost:3000");

test("link callback: no cookie never uses the code; provider errors go to the page", async () => {
  net.reset();
  const lost = await linkCallback(req(callbackUrl("code=c1")));
  assert.equal(lost.status, 302);
  assert.equal(location(lost).pathname, "/account/link");
  assert.equal(location(lost).searchParams.get("err"), "lost");
  assert.equal(location(lost).searchParams.get("then"), "/dashboard?tab=profile");
  const back = await linkCallback(req(callbackUrl("code=c1"), { cookie: "tt_link_done=1" }));
  assert.equal(location(back).searchParams.get("err"), null, "a Back after Done");
  assert.equal(net.pkceCalls.length, 0);

  const denied = await linkCallback(req(callbackUrl("error=access_denied"), { cookie: linkCookieHeader("/game/abc") }));
  assert.equal(location(denied).searchParams.get("err"), "denied");
  assert.equal(location(denied).searchParams.get("then"), "/game/abc");
  const used = await linkCallback(req(callbackUrl("error=invalid_request&error_code=flow_state_not_found"), { cookie: linkCookieHeader() }));
  assert.equal(location(used).searchParams.get("err"), null);
  const google = await linkCallback(req(callbackUrl("error=server_error"), { cookie: linkCookieHeader() }));
  assert.equal(location(google).searchParams.get("err"), "google");
  const noCode = await linkCallback(req(callbackUrl(""), { cookie: linkCookieHeader() }));
  assert.equal(location(noCode).searchParams.get("err"), "google");
  for (const r of [lost, back, denied, used, google, noCode]) assert.equal(setCookies(r).size, 0, "the cookie is kept, nothing is set");
  assert.equal(net.pkceCalls.length, 0);
});

test("link callback: exchanges with the cookie's verifier, attaches the Google account once, revokes the session", async () => {
  net.reset();
  const access = supabaseToken({ ageS: 5 });
  net.pkce = () => Response.json({ access_token: access, refresh_token: "rt", user: googleUser() });
  net.rpc.account_link_attach = () => ({ r: "ok" });
  const res = await linkCallback(req(callbackUrl("code=c2"), { cookie: linkCookieHeader("/game/abc") }));
  assert.equal(res.status, 302);
  assert.equal(location(res).pathname, "/account/link");
  assert.equal(location(res).searchParams.get("err"), null);
  assert.equal(location(res).searchParams.get("then"), "/game/abc");
  assert.equal(setCookies(res).size, 0, "no Supabase session cookie, ever");
  assert.equal(net.pkceCalls[0].auth_code, "c2");
  assert.equal(net.pkceCalls[0].code_verifier, V);
  assert.deepEqual(net.calls("account_link_attach")[0].args, { p_key: "test-account-key", p_secret_hash: legHash(V), p_auth_uid: GOOGLE_UID });
  await settle();
  assert.deepEqual(net.logouts, [access]);
  assert.equal(net.calls("log_user_login").length + net.calls("account_resolve").length, 0, "no login log, no account here");
  assert.ok(!(res.headers.get("location") ?? "").includes("c2"));
});

test("link callback: exchange and attach failures", async () => {
  const run = async (pkce: () => Response, attach?: () => unknown) => {
    net.reset();
    net.pkce = pkce;
    if (attach) net.rpc.account_link_attach = attach;
    const res = await linkCallback(req(callbackUrl("code=c3"), { cookie: linkCookieHeader() }));
    await settle();
    return location(res).searchParams.get("err");
  };
  assert.equal(await run(() => Response.json({ code: "flow_state_not_found" }, { status: 404 })), null, "used: the page reads the state");
  assert.equal(await run(() => Response.json({ code: "flow_state_expired" }, { status: 400 })), "expired");
  assert.equal(await run(() => Response.json({ code: "bad_code_verifier" }, { status: 400 })), "lost");
  assert.equal(await run(() => Response.json({ code: "validation_failed" }, { status: 400 })), "google");
  assert.equal(await run(() => Response.json({}, { status: 502 })), "unavailable");

  let attaches = 0;
  const ok = () => Response.json({ access_token: supabaseToken(), user: googleUser() });
  assert.equal(await run(ok, () => (++attaches, { r: "unavailable" })), "unavailable");
  assert.equal(attaches, 2, "tried once more");
  assert.equal(net.logouts.length, 1, "revoked anyway");
  attaches = 0;
  assert.equal(await run(ok, () => (++attaches === 1 ? { r: "unavailable" } : { r: "has_account", other_empty: false })), null, "the retry worked; the page shows the refusal");

  // An email and password session is not a Google sign-in: never attached.
  assert.equal(await run(() => Response.json({ access_token: supabaseToken({ method: "password" }), user: googleUser() }), () => ({ r: "ok" })), "google");
  assert.equal(net.calls("account_link_attach").length, 0);
  assert.equal(net.logouts.length, 1);
});

/* ------------------------------------------------------------------ */
/* A Google account's phone                                            */
/* ------------------------------------------------------------------ */

test("phone: a Google sign-in in the last 10 minutes, and a fresh OTP proof", async () => {
  net.reset();
  const proof = phoneToken({ ageS: 20, phone: "+919000000099", sub: "fb-proof" });
  const old = await addPhone(req("/api/account/phone", { method: "POST", token: googleSession({ ageS: 11 * 60 }), body: { proof } }));
  assert.deepEqual([old.status, await json(old)], [403, { error: "reauth" }]);
  assert.equal((await addPhone(req("/api/account/phone", { method: "POST", token: phoneToken(), body: { proof } }))).status, 400, "a phone sign-in");
  const pw = googleSession({ ageS: 30, method: "password" });
  assert.equal((await addPhone(req("/api/account/phone", { method: "POST", token: pw, body: { proof } }))).status, 401, "an email and password session");

  const fresh = googleSession({ ageS: 60 });
  for (const [what, p] of [
    ["a proof 6 minutes old", phoneToken({ ageS: 360, phone: "+919000000099" })],
    ["a refreshed proof", phoneToken({ ageS: 200, mintS: 100, phone: "+919000000099" })],
    ["not an OTP", phoneToken({ ageS: 20, phone: "+919000000099", provider: "anonymous" })],
    ["not a token", "a.b.c"],
  ] as const) {
    const res = await addPhone(req("/api/account/phone", { method: "POST", token: fresh, body: { proof: p } }));
    assert.deepEqual([res.status, await json(res)], [422, { error: "proof" }], what);
  }
  assert.equal((await addPhone(req("/api/account/phone", { method: "POST", token: fresh, body: {} }))).status, 400, "no proof");
  assert.equal(net.calls("account_set_phone").length, 0);

  net.rpc.account_set_phone = () => dbProfile({ phone: "+919000000099", phone_confirmed: true, phone_settable: true });
  const ok = await addPhone(req("/api/account/phone", { method: "POST", token: fresh, body: { proof } }));
  assert.equal(ok.status, 200);
  assert.equal(((await json(ok)).profile as Record<string, unknown>).phone_confirmed, true);
  const args = net.calls("account_set_phone")[0].args;
  assert.equal(args.p_auth_uid, GOOGLE_UID);
  assert.equal(args.p_phone, "+919000000099");
  assert.match(String(args.p_proof_key), /^[0-9a-f]{64}$/);
});

test("phone: the database's answers, holder fields passed through", async () => {
  net.reset();
  const answers: Array<[unknown, number, Record<string, unknown>]> = [
    [{ r: "taken", holder_opens: true, holder_empty: true, holder_made_on: "2026-10-01" }, 409, { holderOpens: true, holderEmpty: true, holderMadeOn: "2026-10-01", error: "taken" }],
    [{ r: "limit", until: "2026-11-20T00:00:00+00:00" }, 429, { until: "2026-11-20T00:00:00+00:00", error: "limit" }],
    [{ r: "not_allowed" }, 409, { error: "not_allowed" }],
    [{ r: "used" }, 409, { error: "used" }],
    [{ r: "new" }, 404, { error: "new" }],
    [{ r: "unavailable" }, 503, { error: "unavailable" }],
  ];
  for (const [answer, status, body] of answers) {
    net.rpc.account_set_phone = () => answer;
    const res = await addPhone(req("/api/account/phone", { method: "POST", token: googleSession(), body: { proof: phoneToken({ phone: "+919000000099" }) } }));
    assert.deepEqual([res.status, await json(res)], [status, body]);
  }

  assert.equal((await deletePhone(req("/api/account/phone", { method: "DELETE", token: googleSession({ ageS: 601 }) }))).status, 403);
  net.rpc.account_remove_phone = () => ({ r: "not_allowed" });
  assert.equal((await deletePhone(req("/api/account/phone", { method: "DELETE", token: googleSession() }))).status, 409);
  net.rpc.account_remove_phone = () => dbProfile({ phone: null });
  const ok = await deletePhone(req("/api/account/phone", { method: "DELETE", token: googleSession() }));
  assert.equal(ok.status, 200);
  assert.deepEqual(net.calls("account_remove_phone").at(-1)?.args, { p_key: "test-account-key", p_auth_uid: GOOGLE_UID });
});

/* ------------------------------------------------------------------ */
/* /api/account/me                                                     */
/* ------------------------------------------------------------------ */

test("me PATCH: an email string is 400 bad; email null still removes a typed one", async () => {
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ contact_email: "typed@example.com" });
  net.rpc.account_set_email = () => dbProfile();
  for (const email of ["new@example.com", "", 5]) {
    const res = await patchMe(req("/api/account/me", { method: "PATCH", token: phoneToken(), body: { email } }));
    assert.deepEqual([res.status, await json(res)], [400, { error: "bad" }], String(email));
  }
  assert.equal(net.calls("account_set_email").length, 0);
  const removed = await patchMe(req("/api/account/me", { method: "PATCH", token: phoneToken(), body: { email: null } }));
  assert.equal(removed.status, 200);
  assert.equal(net.calls("account_set_email")[0].args.p_action, "remove");
  const skipped = await patchMe(req("/api/account/me", { method: "PATCH", token: phoneToken(), body: { skipEmail: true } }));
  assert.equal(skipped.status, 200);
  assert.equal(net.calls("account_set_email")[1].args.p_action, "skip");
  // An old page still sending emailSource: ignored, the remove works.
  assert.equal((await patchMe(req("/api/account/me", { method: "PATCH", token: phoneToken(), body: { email: null, emailSource: "prompt" } }))).status, 200);
});

test("me POST: ignores email; logs phone sign-ins only; was_used and linking pass through", async () => {
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ created: true });
  const res = await postMe(req("/api/account/me", { method: "POST", token: phoneToken(), body: { name: "Asha", email: "asha@example.com" } }));
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.equal(body.created, true);
  assert.equal("emailError" in body, false);
  assert.equal(net.calls("account_set_email").length, 0, "the sign-up email is gone");
  assert.equal(net.calls("account_resolve")[0].args.p_log, true);

  await postMe(req("/api/account/me", { method: "POST", token: googleSession(), body: {} }));
  const g = net.calls("account_resolve")[1].args;
  assert.equal(g.p_kind, "google");
  assert.equal(g.p_create, true);
  assert.equal(g.p_log, false, "app loads never log a Google sign-in; the callback does");

  net.rpc.account_resolve = () => ({ r: "name", was_used: true });
  const name = await postMe(req("/api/account/me", { method: "POST", token: phoneToken(), body: {} }));
  assert.deepEqual([name.status, await json(name)], [422, { wasUsed: true, error: "name" }]);
  for (const r of ["linking", "replaced"]) {
    net.rpc.account_resolve = () => ({ r });
    const res2 = await postMe(req("/api/account/me", { method: "POST", token: googleSession(), body: {} }));
    assert.deepEqual([res2.status, await json(res2)], [409, { error: r }]);
  }
  net.rpc.account_resolve = () => ({ r: "new", was_used: false });
  const gone = await getMe(req("/api/account/me", { token: phoneToken() }));
  assert.deepEqual([gone.status, await json(gone)], [404, { wasUsed: false, error: "new" }]);
});

/* ------------------------------------------------------------------ */
/* The normal Google sign-in callback                                  */
/* ------------------------------------------------------------------ */

const REF = "hwfsbpzercuoshodmnuf";
const VERIFIER_GONE: PendingCookie = { name: `sb-${REF}-auth-token-code-verifier`, value: "", options: { path: "/", maxAge: 0 } };
const SESSION_SET: PendingCookie = { name: `sb-${REF}-auth-token`, value: "base64-session", options: { path: "/", maxAge: 34_560_000 } };

function signIn(o: { accessToken?: string | null; error?: unknown; cookie?: string; uid?: string } = {}) {
  const logs: string[] = [];
  const access = o.accessToken === undefined ? supabaseToken({ ageS: 2 }) : o.accessToken;
  const deps = {
    supabaseUrl: SUPABASE,
    anonKey: ANON,
    session(pending: PendingCookie[]): CallbackSession {
      return {
        async exchange() {
          if (o.error) return { error: o.error };
          pending.push(VERIFIER_GONE, SESSION_SET);
          return { user: googleUser({ id: o.uid ?? GOOGLE_UID }), accessToken: access };
        },
        async logLogin(uid: string) {
          logs.push(uid);
        },
      };
    },
  };
  const request = new NextRequest(`https://www.tapturf.test/api/auth/callback?code=abc&next=%2Fgames`, { headers: o.cookie ? { cookie: o.cookie } : {} });
  return { run: () => googleCallback(request, deps), logs, access };
}

test("sign-in callback: ok sends the session, logs through account_resolve only", async () => {
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ id: "acc-phone" });
  const s = signIn();
  const res = await s.run();
  assert.equal(new URL(res.headers.get("location") ?? "").pathname, "/login/complete");
  assert.equal(new URL(res.headers.get("location") ?? "").searchParams.get("next"), "/games");
  const set = setCookies(res);
  assert.equal(cookieValue(set.get(SESSION_SET.name)), "base64-session");
  assert.ok(set.has(VERIFIER_GONE.name));
  assert.match(set.get("tt_g_done") ?? "", /Path=\/api\/auth/);
  const args = net.calls("account_resolve")[0].args;
  assert.deepEqual([args.p_kind, args.p_uid, args.p_create, args.p_log], ["google", GOOGLE_UID, true, true]);
  assert.deepEqual(s.logs, [], "account_resolve logged it, on the account it opened");
  assert.deepEqual(net.logouts, []);
});

test("sign-in callback: before the account-links migration, the old log too (that account_resolve logs phone only)", async () => {
  net.reset();
  net.rpc.account_resolve = () => oldDbProfile({ id: GOOGLE_UID });
  const s = signIn();
  const res = await s.run();
  assert.equal(new URL(res.headers.get("location") ?? "").pathname, "/login/complete");
  assert.ok(setCookies(res).has(SESSION_SET.name));
  assert.deepEqual(s.logs, [GOOGLE_UID]);
});

test("sign-in callback: linking and replaced get no session cookie and a revoke", async () => {
  for (const r of ["linking", "replaced"]) {
    net.reset();
    net.rpc.account_resolve = () => ({ r });
    const s = signIn();
    const res = await s.run();
    const to = new URL(res.headers.get("location") ?? "");
    assert.equal(to.pathname, "/login");
    assert.deepEqual([to.searchParams.get("error"), to.searchParams.get("why"), to.searchParams.get("next")], ["account", r, "/games"]);
    const set = setCookies(res);
    assert.ok(!set.has(SESSION_SET.name), `${r}: no session`);
    assert.match(set.get(VERIFIER_GONE.name) ?? "", /Max-Age=0/, "only the verifier's removal");
    assert.ok(!set.has("tt_g_done"));
    assert.deepEqual(net.logouts, [s.access], `${r}: revoked`);
    assert.deepEqual(s.logs, []);
    assert.equal(net.calls("account_google_fresh").length, 0, "no new account unasked");
  }
});

test("sign-in callback: tt_g_new asks for a new account (account_google_fresh) and is cleared", async () => {
  net.reset();
  net.rpc.account_resolve = () => ({ r: "replaced" });
  net.rpc.account_google_fresh = () => dbProfile({ id: GOOGLE_UID, created: true });
  const s = signIn({ cookie: "tt_g_new=1" });
  const res = await s.run();
  assert.equal(new URL(res.headers.get("location") ?? "").pathname, "/login/complete");
  assert.equal(net.calls("account_google_fresh")[0].args.p_uid, GOOGLE_UID);
  const set = setCookies(res);
  assert.ok(set.has(SESSION_SET.name));
  assert.match(set.get("tt_g_new") ?? "", /Max-Age=0/);
  assert.match(set.get("tt_g_new") ?? "", /Path=\/api\/auth/);

  // Not replaced: the cookie is only cleared.
  net.reset();
  net.rpc.account_resolve = () => dbProfile();
  const plain = await signIn({ cookie: "tt_g_new=1" }).run();
  assert.equal(net.calls("account_google_fresh").length, 0);
  assert.match(setCookies(plain).get("tt_g_new") ?? "", /Max-Age=0/);
});

test("sign-in callback: account calls down (or no amr oauth): today's log_user_login, session sent", async () => {
  net.reset();
  let n = 0;
  net.rpc.account_resolve = () => (++n, { r: "unavailable" });
  const s = signIn();
  const res = await s.run();
  assert.equal(n, 2, "tried once more");
  assert.equal(new URL(res.headers.get("location") ?? "").pathname, "/login/complete");
  assert.ok(setCookies(res).has(SESSION_SET.name));
  assert.deepEqual(s.logs, [GOOGLE_UID]);

  net.reset();
  const noAmr = signIn({ accessToken: supabaseToken({ method: "password" }) });
  await noAmr.run();
  assert.equal(net.calls("account_resolve").length, 0);
  assert.deepEqual(noAmr.logs, [GOOGLE_UID]);
});

test("sign-in callback: an exchange error goes back to /login as before", async () => {
  net.reset();
  const s = signIn({ error: { name: "AuthApiError", code: "flow_state_expired" } });
  const quiet = console.warn;
  console.warn = () => {};
  try {
    const res = await s.run();
    const to = new URL(res.headers.get("location") ?? "");
    assert.deepEqual([to.pathname, to.searchParams.get("error"), to.searchParams.get("why")], ["/login", "callback", "expired"]);
    assert.equal(setCookies(res).size, 0);
  } finally {
    console.warn = quiet;
  }
});
