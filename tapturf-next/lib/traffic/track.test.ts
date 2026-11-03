import { test } from "node:test";
import assert from "node:assert/strict";
import { beaconBody, freshModules, installBrowser, type FakeBrowser } from "../consentTestkit";

/**
 * The browser's side of the traffic counts (lib/traffic/track.ts) in a fake
 * browser: what it sends for a page load, a move inside the site, a reload,
 * Back, a background tab, a page that doesn't exist, a bot and the admin;
 * that a signed-in view carries the sign-in and goes as a fetch; and that it
 * keeps nothing on the device, with or without cookie consent.
 */

type Mods = { track: typeof import("./track"); account: typeof import("../account/client"); consent: typeof import("../consent") };

const PHONE_UA = "Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

function boot(o: { href?: string; referrer?: string; nav?: string; ua?: string; webdriver?: boolean; hidden?: boolean; title?: string; signedIn?: boolean; status?: number } = {}) {
  freshModules();
  const b = installBrowser({ href: o.href ?? "https://www.tapturf.in/pune", ua: o.ua ?? PHONE_UA });
  const doc = globalThis.document as unknown as Record<string, unknown>;
  doc.referrer = o.referrer ?? "";
  doc.title = o.title ?? "Turfs in Pune | TapTurf";
  if (o.hidden) doc.visibilityState = "hidden";
  b.nav.webdriver = o.webdriver === true;
  // The page load's navigation type, as the browser's Navigation Timing says it.
  const saved = Object.getOwnPropertyDescriptor(globalThis, "performance");
  Object.defineProperty(globalThis, "performance", {
    value: { getEntriesByType: (t: string) => (t === "navigation" && o.nav !== "none" ? [{ type: o.nav ?? "navigate", responseStatus: o.status ?? 200 }] : []) },
    configurable: true,
    writable: true,
  });
  /* eslint-disable @typescript-eslint/no-require-imports */
  const m: Mods = { track: require("./track"), account: require("../account/client"), consent: require("../consent") };
  /* eslint-enable @typescript-eslint/no-require-imports */
  m.account.setSignInToken(o.signedIn ? async () => ({ token: "signed-in-token" }) : null);
  const uninstall = () => {
    b.uninstall();
    if (saved) Object.defineProperty(globalThis, "performance", saved);
  };
  return { b, m, doc, uninstall };
}

/** A view goes a moment after its page shows (track.ts SETTLE_MS), then when the browser is idle. */
const wait = (ms = 700) => new Promise((r) => setTimeout(r, ms));
const go = (b: FakeBrowser, href: string) => {
  b.win.location = new URL(href, "https://www.tapturf.in");
};
const bodies = (b: FakeBrowser) => Promise.all(b.beacons.map(beaconBody));

test("a page load from Google: its first page is the visit; moves inside the site are views from that arrival", async () => {
  const { b, m, uninstall } = boot({ href: "https://www.tapturf.in/pune?utm_campaign=x", referrer: "https://www.google.com/" });
  try {
    m.track.countPageView();
    await wait();
    go(b, "/turf/kick-off-arena");
    m.track.countPageView();
    await wait();
    go(b, "/pune");
    m.track.countPageView();
    await wait();
    assert.deepEqual(await bodies(b), [
      { p: "/pune", s: "google", v: 1 },
      { p: "/turf/kick-off-arena", s: "google" },
      { p: "/pune", s: "google" },
    ]);
    assert.ok(b.beacons.every((x) => x.url === "/api/traffic" && x.body.type === "application/json"), "a beacon to this site's own route, as JSON");
    assert.equal(b.fetches.length, 0, "signed out: no fetch");
  } finally {
    uninstall();
  }
});

test("the same route's effect run twice (React's development double run) is one view", async () => {
  const { b, m, uninstall } = boot();
  try {
    m.track.countPageView();
    m.track.countPageView();
    await wait();
    assert.equal(b.beacons.length, 1);
  } finally {
    uninstall();
  }
});

test("a reload or Back is a view inside a visit already counted: internal, not a visit", async () => {
  for (const nav of ["reload", "back_forward"]) {
    const { b, m, uninstall } = boot({ referrer: "android-app://com.whatsapp/", nav });
    try {
      m.track.countPageView();
      await wait();
      assert.deepEqual(await bodies(b), [{ p: "/pune", s: "internal" }], nav);
    } finally {
      uninstall();
    }
  }
});

test("a full page load from another TapTurf page, or back from a sign-in, is internal", async () => {
  for (const referrer of ["https://www.tapturf.in/turfs", "https://tapturf.in/", "https://accounts.google.com/"]) {
    const { b, m, uninstall } = boot({ referrer });
    try {
      m.track.countPageView();
      await wait();
      assert.deepEqual(await bodies(b), [{ p: "/pune", s: "internal" }], referrer);
    } finally {
      uninstall();
    }
  }
});

test("typed in, a utm_source, another site: direct, the named source, the other site's host name only", async () => {
  const cases: [string, string, Record<string, unknown>][] = [
    ["https://www.tapturf.in/", "", { p: "/", s: "direct", v: 1 }],
    ["https://www.tapturf.in/turf/x?utm_source=whatsapp", "", { p: "/turf/x", s: "whatsapp", v: 1 }],
    ["https://www.tapturf.in/blog/best?utm_source=chatgpt.com", "https://chatgpt.com/", { p: "/blog/best", s: "ai", v: 1 }],
    ["https://www.tapturf.in/blog/best", "https://www.reddit.com/r/pune/comments/abc?x=1", { p: "/blog/best", s: "other_site", v: 1, h: "reddit.com" }],
  ];
  for (const [href, referrer, want] of cases) {
    const { b, m, uninstall } = boot({ href, referrer });
    try {
      m.track.countPageView();
      await wait();
      assert.deepEqual(await bodies(b), [want], href);
    } finally {
      uninstall();
    }
  }
});

test("a background tab sends nothing until it is on screen, then its view (still the visit)", async () => {
  const { b, m, doc, uninstall } = boot({ referrer: "https://www.google.com/", hidden: true });
  try {
    m.track.countPageView();
    await wait();
    assert.equal(b.beacons.length, 0, "not on screen yet");
    doc.visibilityState = "visible";
    b.fire("visibilitychange");
    await wait();
    assert.deepEqual(await bodies(b), [{ p: "/pune", s: "google", v: 1 }]);
  } finally {
    uninstall();
  }
});

test("a page that doesn't exist: counted, flagged, its address not kept by the server", async () => {
  for (const title of ["Page not found | TapTurf", "Turf not found | TapTurf", "Live score not found | TapTurf", "Not found | TapTurf"]) {
    const { b, m, uninstall } = boot({ href: "https://www.tapturf.in/old-link", title });
    try {
      m.track.countPageView();
      await wait();
      assert.deepEqual(await bodies(b), [{ p: "/old-link", s: "direct", v: 1, nf: 1 }], title);
    } finally {
      uninstall();
    }
  }
  // A real page whose title merely has the words in it is not one.
  const { b, m, uninstall } = boot({ href: "https://www.tapturf.in/blog/x", title: "Why your turf booking was not found on Google, and how to fix it | TapTurf" });
  try {
    m.track.countPageView();
    await wait();
    assert.deepEqual(await bodies(b), [{ p: "/blog/x", s: "direct", v: 1 }]);
  } finally {
    uninstall();
  }
});

test("the first page of a load that the server answered 404 is flagged even before its title says so; a later page is not", async () => {
  const { b, m, doc, uninstall } = boot({ href: "https://www.tapturf.in/turf/gone", title: "", status: 404 });
  try {
    m.track.countPageView();
    await wait();
    go(b, "/pune");
    doc.title = "Turfs in Pune | TapTurf";
    m.track.countPageView();
    await wait();
    assert.deepEqual(await bodies(b), [{ p: "/turf/gone", s: "direct", v: 1, nf: 1 }, { p: "/pune", s: "direct" }]);
  } finally {
    uninstall();
  }
});

test("a move to another page before the first one's view went: each view is its own page's", async () => {
  const { b, m, uninstall } = boot({ referrer: "https://www.google.com/" });
  try {
    m.track.countPageView();
    go(b, "/turf/x");
    m.track.countPageView();
    await wait();
    assert.deepEqual(await bodies(b), [{ p: "/pune", s: "google", v: 1 }, { p: "/turf/x", s: "google" }]);
  } finally {
    uninstall();
  }
});

test("a view still waiting goes at once when the page is hidden or closed", async () => {
  const { b, m, doc, uninstall } = boot();
  try {
    m.track.countPageView();
    assert.equal(b.beacons.length, 0, "not yet");
    doc.visibilityState = "hidden";
    b.fire("visibilitychange");
    assert.equal(b.beacons.length, 1, "sent as the page goes");
    await wait();
    assert.equal(b.beacons.length, 1, "and only once");
  } finally {
    uninstall();
  }
});

test("a bot or an automated browser sends nothing", async () => {
  for (const o of [{ ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }, { ua: "WhatsApp/2.23.20.0 A" }, { webdriver: true }]) {
    const { b, m, uninstall } = boot(o);
    try {
      m.track.countPageView();
      await wait();
      assert.equal(b.beacons.length + b.fetches.length, 0, JSON.stringify(o));
    } finally {
      uninstall();
    }
  }
});

test("the admin is never counted, and a load that starts there has no visit left for the next page", async () => {
  const { b, m, uninstall } = boot({ href: "https://www.tapturf.in/admin" });
  try {
    m.track.countPageView();
    await wait();
    assert.equal(b.beacons.length, 0);
    go(b, "/");
    m.track.countPageView();
    await wait();
    assert.deepEqual(await bodies(b), [{ p: "/", s: "direct" }]);
  } finally {
    uninstall();
  }
});

test("back from the browser's back-forward cache: a view again, never a visit", async () => {
  const { b, m, uninstall } = boot({ referrer: "https://www.google.com/" });
  try {
    m.track.countPageView();
    await wait();
    m.track.countPageView(true);
    await wait();
    assert.deepEqual(await bodies(b), [{ p: "/pune", s: "google", v: 1 }, { p: "/pune", s: "internal" }]);
  } finally {
    uninstall();
  }
});

test("signed in: a keepalive fetch carrying the sign-in, no beacon", async () => {
  const { b, m, uninstall } = boot({ signedIn: true });
  try {
    m.track.countPageView();
    await wait(800);
    assert.equal(b.beacons.length, 0);
    const [f] = b.fetches;
    assert.equal(f?.url, "/api/traffic");
    assert.equal(f.init?.keepalive, true);
    assert.equal(new Headers(f.init?.headers).get("authorization"), "Bearer signed-in-token");
    assert.deepEqual(JSON.parse(String(f.init?.body)), { p: "/pune", s: "direct", v: 1 });
  } finally {
    uninstall();
  }
});

test("nothing is kept on the device, with or without cookie consent", async () => {
  for (const choice of [null, "accepted", "rejected"] as const) {
    const { b, m, uninstall } = boot({ referrer: "https://www.google.com/" });
    try {
      if (choice) m.consent.setConsent(choice);
      const cookiesBefore = b.jar.names();
      m.track.countPageView();
      go(b, "/turf/x");
      m.track.countPageView();
      m.track.countPageView(true);
      await wait();
      assert.equal(b.beacons.length, 3, `${choice}: it runs either way`);
      assert.deepEqual(b.local.keys(), [], `${choice}: no localStorage`);
      assert.deepEqual(b.session.keys(), [], `${choice}: no sessionStorage`);
      assert.deepEqual(b.jar.names(), cookiesBefore, `${choice}: no cookie`);
      for (const body of await bodies(b)) assert.ok(Object.keys(body).every((k) => ["p", "s", "v", "h", "nf"].includes(k)), "no identifier, nothing else");
    } finally {
      uninstall();
    }
  }
});
