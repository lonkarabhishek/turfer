import { test } from "node:test";
import assert from "node:assert/strict";
import { exchangeWhy, hasSessionCookie, loginErrorText, providerWhy, readWhy } from "./callback";
import { chromeIntent, inAppBrowser } from "./inApp";
import { safeNext } from "./next";

test("safeNext keeps site paths only", () => {
  for (const ok of ["/", "/turf/abc", "/my?claim=1", "/u/asha#x"]) assert.equal(safeNext(ok), ok, ok);
  for (const bad of [null, undefined, "", "https://x.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "/login", "/login/complete", "/login?next=/", "/api/auth/callback", "/a\nb"]) assert.equal(safeNext(bad), "/", String(bad));
});

test("providerWhy", () => {
  assert.equal(providerWhy("access_denied", null, null), "denied");
  assert.equal(providerWhy("server_error", "unexpected_failure", "Database error saving new user"), "again");
  assert.equal(providerWhy("invalid_request", "bad_oauth_state", "OAuth state not found or expired"), "used");
  assert.equal(providerWhy("server_error", null, "something else"), "google");
});

test("exchangeWhy", () => {
  assert.equal(exchangeWhy({ name: "AuthPKCECodeVerifierMissingError", message: "PKCE code verifier not found in storage." }), "lost");
  assert.equal(exchangeWhy({ name: "AuthApiError", code: "bad_code_verifier" }), "lost");
  assert.equal(exchangeWhy({ name: "AuthApiError", code: "flow_state_expired" }), "expired");
  assert.equal(exchangeWhy({ name: "AuthApiError", code: "flow_state_not_found" }), "used");
  assert.equal(exchangeWhy({ name: "AuthApiError", message: "invalid flow state, no valid flow state found" }), "used");
  assert.equal(exchangeWhy(null), "other");
  assert.equal(exchangeWhy({ name: "AuthRetryableFetchError" }), "other");
});

test("hasSessionCookie", () => {
  const ref = "hwfsbpzercuoshodmnuf";
  assert.ok(hasSessionCookie([`sb-${ref}-auth-token`], ref));
  assert.ok(hasSessionCookie(["x", `sb-${ref}-auth-token.0`, `sb-${ref}-auth-token.1`], ref));
  assert.ok(!hasSessionCookie([`sb-${ref}-auth-token-code-verifier`], ref), "the verifier is not a session");
  assert.ok(!hasSessionCookie(["sb-otherproject-auth-token"], ref));
  assert.ok(!hasSessionCookie([], ref));
});

test("loginErrorText", () => {
  assert.match(loginErrorText("oauth", null) ?? "", /cancelled/);
  assert.match(loginErrorText("callback", null) ?? "", /Couldn't finish/);
  assert.match(loginErrorText("callback", "lost") ?? "", /lost the sign-in/);
  assert.match(loginErrorText("callback", "nonsense") ?? "", /Couldn't finish/);
  assert.equal(loginErrorText(null, "lost"), null);
  assert.equal(readWhy("slow"), "slow");
  assert.equal(readWhy("x"), null);
});

const UA = {
  instaAndroid: "Mozilla/5.0 (Linux; Android 13; SM-A536E Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 Instagram 350.0.0.0 Android",
  instaIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0",
  fbIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0]",
  webview: "Mozilla/5.0 (Linux; Android 12; RMX3085; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0 Mobile Safari/537.36",
  chrome: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
  safari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  crios: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1",
  gsaIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/330.0 Mobile/15E148",
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
};

test("inAppBrowser", () => {
  assert.deepEqual(inAppBrowser(UA.instaAndroid), { app: "Instagram", os: "android" });
  assert.deepEqual(inAppBrowser(UA.instaIos), { app: "Instagram", os: "ios" });
  assert.deepEqual(inAppBrowser(UA.fbIos), { app: "Facebook", os: "ios" });
  assert.deepEqual(inAppBrowser(UA.webview), { app: null, os: "android" });
  for (const k of ["chrome", "safari", "crios", "gsaIos", "desktop"] as const) assert.equal(inAppBrowser(UA[k]), null, k);
  assert.equal(inAppBrowser(null), null);
});

test("chromeIntent keeps the host fixed", () => {
  assert.equal(chromeIntent("/login?next=%2Fmy"), "intent://www.tapturf.in/login?next=%2Fmy#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fwww.tapturf.in%2Flogin%3Fnext%3D%252Fmy;end");
  assert.ok(chromeIntent("//evil.com").startsWith("intent://www.tapturf.in/#Intent"));
});
