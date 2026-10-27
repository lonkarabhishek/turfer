import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONSENT_MAX_AGE_S,
  consentCookie,
  consentOf,
  cookieDomains,
  expiredCookie,
  gaCookieNames,
  parseConsentCookie,
} from "./consent";
import { freshModules, installBrowser, type FakeBrowser } from "./consentTestkit";
import { mapsSearchUrl } from "./utils/maps";

type ConsentModule = typeof import("./consent");

/** A fresh consent store in a fresh fake browser. */
function boot(o: Parameters<typeof installBrowser>[0] = {}): { b: FakeBrowser; c: ConsentModule } {
  freshModules();
  const b = installBrowser(o);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const c = require("./consent") as ConsentModule;
  return { b, c };
}

// ---------------------------------------------------------------------------
// The cookie

test("parse: accepted.v1 and rejected.v1, among other cookies", () => {
  assert.equal(parseConsentCookie("tt_consent=accepted.v1"), "accepted");
  assert.equal(parseConsentCookie("tt_city=pune; tt_consent=rejected.v1; _ga=GA1.1.1.1"), "rejected");
  assert.equal(parseConsentCookie(" tt_consent = accepted.v1 "), "accepted");
});

test("parse: nothing, garbage and look-alikes are no choice", () => {
  for (const c of [null, undefined, "", "tt_consent=", "tt_consent=yes", "tt_consent=accepted", "tt_consent=ACCEPTED.v1", "xtt_consent=accepted.v1", "tt_consentx=accepted.v1", "tt_consent=accepted.v1x"]) {
    assert.equal(parseConsentCookie(c), null, String(c));
  }
});

test("parse: an Accept for another version asks again, a Reject for any version holds", () => {
  assert.equal(parseConsentCookie("tt_consent=accepted.v0"), null);
  assert.equal(parseConsentCookie("tt_consent=accepted.v2"), null);
  assert.equal(parseConsentCookie("tt_consent=rejected.v0"), "rejected");
  // A bad copy first does not hide a good one.
  assert.equal(parseConsentCookie("tt_consent=junk; tt_consent=accepted.v1"), "accepted");
});

test("the cookie: first party, whole site, about six months, Lax, Secure on https", () => {
  const c = consentCookie("accepted", true);
  assert.match(c, /^tt_consent=accepted\.v1; /);
  assert.match(c, /; Path=\/(;|$)/);
  assert.match(c, /; SameSite=Lax/);
  assert.match(c, /; Secure$/);
  assert.match(c, new RegExp(`; Max-Age=${CONSENT_MAX_AGE_S}(;|$)`));
  assert.ok(CONSENT_MAX_AGE_S >= 180 * 86400 && CONSENT_MAX_AGE_S <= 186 * 86400, "about six months");
  assert.doesNotMatch(consentCookie("rejected", false), /Secure|Domain/);
  assert.equal(parseConsentCookie(consentCookie("rejected", false).split(";")[0]), "rejected", "reads back");
});

test("consentOf: a stored choice wins, Global Privacy Control is a Reject, else ask", () => {
  assert.equal(consentOf(null, false), "unset");
  assert.equal(consentOf(null, true), "denied");
  assert.equal(consentOf("accepted", false), "granted");
  assert.equal(consentOf("accepted", true), "granted", "an explicit Accept beats GPC");
  assert.equal(consentOf("rejected", false), "denied");
  assert.equal(consentOf("rejected", true), "denied");
});

test("GA's cookies: _ga, _ga_<id>, _gid, _gat; not ours or look-alikes", () => {
  assert.deepEqual(
    gaCookieNames("_ga=GA1.1.2.3; _ga_KRDVP16TSM=GS1; tt_city=pune; _gid=x; _gat_gtag_UA_1=1; _gac_x=1; _gcl_au=1; tt_consent=accepted.v1; _gallery=1; ga=1"),
    ["_ga", "_ga_KRDVP16TSM", "_gid", "_gat_gtag_UA_1", "_gac_x", "_gcl_au"],
  );
  assert.deepEqual(gaCookieNames(""), []);
});

test("cookie domains: host-only first, then every parent with and without the dot; none for IPs and localhost", () => {
  assert.deepEqual(cookieDomains("www.tapturf.in"), [null, "www.tapturf.in", ".www.tapturf.in", "tapturf.in", ".tapturf.in"]);
  assert.deepEqual(cookieDomains("localhost"), [null]);
  assert.deepEqual(cookieDomains("127.0.0.1"), [null]);
  assert.match(expiredCookie("_ga", ".tapturf.in"), /^_ga=; Path=\/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Domain=\.tapturf\.in$/);
  assert.doesNotMatch(expiredCookie("_ga", null), /Domain/);
});

// ---------------------------------------------------------------------------
// The store

test("server: unknown, nothing allowed, no banner", () => {
  freshModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const c = require("./consent") as ConsentModule;
  assert.equal(c.getConsent(), "unknown");
  assert.equal(c.analyticsAllowed(), false);
  assert.equal(c.bannerShown(), false);
  c.setConsent("accepted"); // no browser: a no-op, never a throw
  assert.equal(c.getConsent(), "unknown");
});

test("first visit: unset, the banner shows, nothing allowed", () => {
  const { b, c } = boot();
  try {
    assert.equal(c.getConsent(), "unset");
    assert.equal(c.analyticsAllowed(), false);
    assert.equal(c.bannerShown(), true);
  } finally {
    b.uninstall();
  }
});

test("Accept: the cookie is set, consent is granted at once, listeners hear it, the banner goes", () => {
  const { b, c } = boot();
  try {
    let heard = 0;
    const off = c.subscribeConsent(() => heard++);
    c.setConsent("accepted");
    assert.equal(c.getConsent(), "granted");
    assert.equal(c.analyticsAllowed(), true);
    assert.equal(c.bannerShown(), false);
    assert.equal(heard, 1);
    assert.equal(parseConsentCookie(b.jar.header), "accepted");
    off();
    c.setConsent("rejected");
    assert.equal(heard, 1, "unsubscribed");
  } finally {
    b.uninstall();
  }
});

test("a stored choice is read on the next page load", () => {
  const { b, c } = boot();
  try {
    b.jar.put("tt_consent", "accepted.v1");
    assert.equal(c.getConsent(), "granted");
    assert.equal(c.bannerShown(), false);
  } finally {
    b.uninstall();
  }
  const again = boot();
  try {
    again.b.jar.put("tt_consent", "rejected.v1");
    assert.equal(again.c.getConsent(), "denied");
    assert.equal(again.c.bannerShown(), false);
  } finally {
    again.b.uninstall();
  }
});

test("Global Privacy Control: denied with no banner, until the visitor accepts in Cookie settings", () => {
  const { b, c } = boot({ gpc: true });
  try {
    assert.equal(c.gpcOn(), true);
    assert.equal(c.getConsent(), "denied");
    assert.equal(c.bannerShown(), false, "GPC is a choice already");
    c.openCookieSettings();
    assert.equal(c.bannerShown(), true);
    assert.equal(c.cookieSettingsOpen(), true);
    c.setConsent("accepted");
    assert.equal(c.getConsent(), "granted");
    assert.equal(c.cookieSettingsOpen(), false, "a choice closes the settings");
    assert.equal(c.storedChoice(), "accepted");
  } finally {
    b.uninstall();
  }
  const later = boot({ gpc: true });
  try {
    later.b.jar.put("tt_consent", "accepted.v1");
    assert.equal(later.c.getConsent(), "granted", "the explicit Accept still holds on the next load");
  } finally {
    later.b.uninstall();
  }
});

test("Reject after Accept (withdrawal): GA stops, its cookies on every domain and the local notes are deleted", () => {
  const { b, c } = boot();
  try {
    c.setConsent("accepted");
    const calls: unknown[][] = [];
    b.win.gtag = (...a: unknown[]) => void calls.push(a);
    b.jar.put("_ga", "GA1.1.123.456", "tapturf.in");
    b.jar.put("_ga_KRDVP16TSM", "GS1.1.1", "tapturf.in");
    b.jar.put("_gid", "GA1.1.9", null);
    b.jar.put("tt_city", "pune");
    for (const k of c.CONSENTED_LOCAL_KEYS) b.local.setItem(k, "x");
    b.local.setItem("tapturf_city", "pune");
    b.local.setItem("tapturf_ask_anon", "a-b-c");
    b.session.setItem("tt_viewed_abc", "1");
    b.session.setItem("tapturf_ask_thread_v1", "[]");

    c.setConsent("rejected");

    assert.equal(c.getConsent(), "denied");
    assert.equal(b.win["ga-disable-G-KRDVP16TSM"], true, "GA's own off switch");
    assert.deepEqual(calls, [["consent", "update", { analytics_storage: "denied" }]]);
    assert.equal("gtag" in b.win, false, "window.gtag is gone, so every gtag?.() is a no-op");
    assert.deepEqual(b.jar.names().sort(), ["tt_city", "tt_consent"], "GA's cookies gone, ours kept");
    assert.equal(parseConsentCookie(b.jar.header), "rejected");
    assert.deepEqual(b.local.keys().sort(), ["tapturf_ask_anon", "tapturf_city"], "only the notes that need consent go");
    assert.deepEqual(b.session.keys(), ["tapturf_ask_thread_v1"]);
  } finally {
    b.uninstall();
  }
});

test("a Reject made in another tab applies here when this tab comes back", () => {
  const { b, c } = boot();
  try {
    c.setConsent("accepted");
    b.win.gtag = () => {};
    let heard = 0;
    c.subscribeConsent(() => heard++);
    b.jar.put("tt_consent", "rejected.v1"); // the other tab
    b.fire("visibilitychange");
    assert.equal(c.getConsent(), "denied");
    assert.equal(heard, 1);
    assert.equal(b.win["ga-disable-G-KRDVP16TSM"], true);
  } finally {
    b.uninstall();
  }
});

test("Cookie settings opens and closes the banner over a stored choice", () => {
  const { b, c } = boot();
  try {
    c.setConsent("rejected");
    assert.equal(c.bannerShown(), false);
    c.openCookieSettings();
    assert.equal(c.bannerShown(), true);
    c.closeCookieSettings();
    assert.equal(c.bannerShown(), false);
    assert.equal(c.getConsent(), "denied", "closing changes nothing");
  } finally {
    b.uninstall();
  }
});

test("cookies blocked: the choice still holds for this page", () => {
  const { b, c } = boot();
  try {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        get cookie() {
          throw new Error("SecurityError");
        },
        set cookie(_v: string) {
          throw new Error("SecurityError");
        },
        addEventListener() {},
      },
    });
    assert.equal(c.getConsent(), "unset");
    c.setConsent("accepted");
    assert.equal(c.getConsent(), "granted");
  } finally {
    b.uninstall();
  }
});

// ---------------------------------------------------------------------------
// "Open in Google Maps"

test("maps link: the point, else the name and address, else none", () => {
  assert.equal(mapsSearchUrl({ lat: 18.52, lng: 73.85, name: "X" }), "https://www.google.com/maps/search/?api=1&query=18.52,73.85");
  assert.equal(mapsSearchUrl({ lat: "20", lng: "73.78" }), "https://www.google.com/maps/search/?api=1&query=20,73.78");
  assert.equal(mapsSearchUrl({ lat: null, lng: 73, name: "Kings Turf & Box", address: "College Road, Nashik" }), "https://www.google.com/maps/search/?api=1&query=Kings%20Turf%20%26%20Box%2C%20College%20Road%2C%20Nashik");
  assert.equal(mapsSearchUrl({ lat: 200, lng: 73, address: "Baner" }), "https://www.google.com/maps/search/?api=1&query=Baner");
  assert.equal(mapsSearchUrl({ name: "  ", address: null }), null);
});
