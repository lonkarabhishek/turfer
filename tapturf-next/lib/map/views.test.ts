import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAP_GAP_MS,
  MAP_KIND_WINDOW_MS,
  MAP_PER_MIN,
  MAP_PER_NET_KIND,
  MAP_SEEN_KEY,
  MAP_UNIQUES_PER_NET,
  createMapLimiter,
  mapCardKind,
  mapUseBody,
  parseMapUse,
  personHere,
  planMapView,
  readMapSeen,
} from "./views";
import { VIEW_AGAIN_MS } from "../live/views";
import { beaconBody, freshModules, installBrowser, type FakeBrowser } from "../consentTestkit";

const MIN = 60_000;
// 2 Nov 2026, 12:00 in India (06:30 UTC); India's day turns at 18:30 UTC.
const NOON = Date.UTC(2026, 10, 2, 6, 30);
const BEFORE_MIDNIGHT = Date.UTC(2026, 10, 2, 18, 29);
const AFTER_MIDNIGHT = Date.UTC(2026, 10, 2, 18, 31);
const PHONE = "Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

test("the note: read as stored, anything malformed is none", () => {
  assert.deepEqual(readMapSeen(JSON.stringify({ d: "2026-11-02", at: NOON })), { d: "2026-11-02", at: NOON });
  for (const raw of [null, "", "{", "[]", "null", JSON.stringify({ d: "2 Nov", at: NOON }), JSON.stringify({ d: "2026-11-02", at: "x" }), JSON.stringify({ d: "2026-11-02" })]) {
    assert.equal(readMapSeen(raw), null, String(raw));
  }
});

test("a view: the first of the day is unique, the same browser within 30 minutes is the same view", () => {
  const first = planMapView(null, NOON);
  assert.deepEqual(first, { send: true, unique: true, next: { d: "2026-11-02", at: NOON } });
  assert.deepEqual(planMapView({ d: "2026-11-02", at: NOON }, NOON + 5 * MIN), { send: false }, "a reload or Back");
  assert.deepEqual(planMapView({ d: "2026-11-02", at: NOON }, NOON + VIEW_AGAIN_MS - 1), { send: false }, "just inside 30 minutes");
  assert.deepEqual(planMapView({ d: "2026-11-02", at: NOON }, NOON + VIEW_AGAIN_MS), { send: true, unique: false, next: { d: "2026-11-02", at: NOON + VIEW_AGAIN_MS } }, "30 minutes on: a view, not unique");
  assert.equal(VIEW_AGAIN_MS, 30 * MIN);
});

test("a view: unique again on India's next day, not UTC's", () => {
  const late = planMapView(null, BEFORE_MIDNIGHT);
  assert.ok(late.send && late.next.d === "2026-11-02");
  const next = planMapView({ d: "2026-11-02", at: BEFORE_MIDNIGHT - 40 * MIN }, AFTER_MIDNIGHT);
  assert.deepEqual(next, { send: true, unique: true, next: { d: "2026-11-03", at: AFTER_MIDNIGHT } }, "past India's midnight: a new day");
  assert.deepEqual(planMapView({ d: "2026-11-02", at: BEFORE_MIDNIGHT }, AFTER_MIDNIGHT), { send: false }, "but still within 30 minutes of the last: the same view");
  assert.equal(planMapView({ d: "2026-11-02", at: NOON + 60 * MIN }, NOON).send, true, "a clock that went back counts again");
});

test("a person: never a bot, a link preview, a headless or automated browser", () => {
  assert.equal(personHere(PHONE, false), true);
  assert.equal(personHere(PHONE, true), false, "webdriver");
  for (const ua of ["Googlebot/2.1", "WhatsApp/2.23.20.0", "Mozilla/5.0 HeadlessChrome/130.0", "curl/8.4", "", null, undefined]) assert.equal(personHere(ua, false), false, String(ua));
});

test("a card: a turf's or a game's page on this site, nothing else", () => {
  const o = "https://www.tapturf.in";
  assert.equal(mapCardKind("/turf/o2-turf-pune", o), "turf");
  assert.equal(mapCardKind("https://www.tapturf.in/turf/o2-turf-pune", o), "turf");
  assert.equal(mapCardKind("/game/7b9c2f9e-0000-4000-8000-000000000001", o), "game");
  for (const href of ["/game/create", "/turfs", "/turf/a/b", "/map?show=games", "tel:+919000000001", "https://wa.me/919000000001", "https://openfreemap.org/", "https://evil.example/turf/x", "/pune", "javascript:void(0)"]) {
    assert.equal(mapCardKind(href, o), null, href);
  }
});

test("the body: a known kind, unique only for a view, a tag only when it is one", () => {
  const tag = "0123456789abcdef";
  assert.deepEqual(JSON.parse(mapUseBody("view", true, tag)), { k: "view", u: true, v: tag });
  assert.deepEqual(JSON.parse(mapUseBody("tap", true, tag)), { k: "tap", v: tag }, "a tap carries no unique");
  assert.deepEqual(parseMapUse(JSON.parse(mapUseBody("view", true, tag))), { kind: "view", unique: true, tag });
  assert.deepEqual(parseMapUse({ k: "tap", u: true, v: tag }), { kind: "tap", unique: false, tag }, "unique is a view's only");
  assert.deepEqual(parseMapUse({ k: "mini" }), { kind: "mini", unique: false, tag: null });
  assert.deepEqual(parseMapUse({ k: "view", u: "yes", v: "not-a-tag" }), { kind: "view", unique: false, tag: null });
  for (const raw of [null, [], "view", { k: "open" }, { k: "VIEW" }, {}]) assert.equal(parseMapUse(raw), null, JSON.stringify(raw));
});

test("limits: the same event again, a network's minute, one kind per network, uniques per network", () => {
  let t = NOON;
  const take = createMapLimiter(() => t);
  assert.deepEqual(take("n1", "w1", "view", true), { count: true, unique: true });
  assert.deepEqual(take("n1", "w1", "view", true), { count: false, why: "again" }, "the same view sent twice");
  assert.deepEqual(take("n1", "w1", "tap", false), { count: true, unique: false }, "another kind from the same browser");
  t += MAP_GAP_MS;
  assert.equal(take("n1", "w1", "view", false).count, true, "past the gap");
  // A network's minute, of every kind together.
  t += MAP_KIND_WINDOW_MS;
  let n = 0;
  for (let i = 0; i < MAP_PER_MIN + 5; i++) if (take("n2", `w${i}`, (["view", "tap", "mini"] as const)[i % 3], false).count) n++;
  assert.equal(n, MAP_PER_MIN, "past the minute: shed");
  assert.deepEqual(take("n2", "fresh", "mini", false), { count: false, why: "slow" });
  assert.equal(take("n3", "fresh", "mini", false).count, true, "another network is not held up");
  // One kind per network in 10 minutes: a script changing its tag gets no further.
  t += MAP_KIND_WINDOW_MS;
  let views = 0;
  for (let i = 0; i < MAP_PER_NET_KIND + 10; i++) {
    if (i % 50 === 49) t += MIN; // under the minute's limit
    if (take("n4", `s${i}`, "view", false).count) views++;
  }
  assert.equal(views, MAP_PER_NET_KIND);
  assert.deepEqual(take("n4", "next", "view", false), { count: false, why: "many" });
  assert.equal(take("n4", "next", "tap", false).count, true, "taps have their own");
  // Uniques: believed for the first MAP_UNIQUES_PER_NET views of a network a day; past it a view counts, not unique.
  t += 24 * 60 * MIN;
  const u = createMapLimiter(() => t);
  let uniques = 0;
  for (let i = 0; i < MAP_UNIQUES_PER_NET + 3; i++) {
    t += MIN; // keeps under the minute and the 10-minute limits
    const r = u(`net-${Math.floor(i / 50)}`, `u${i}`, "view", true);
    if (r.count && r.unique) uniques++;
  }
  assert.equal(uniques, MAP_UNIQUES_PER_NET + 3, "different networks each have their own");
  const one = createMapLimiter(() => t);
  let seen = 0;
  for (let i = 0; i < MAP_UNIQUES_PER_NET + 3; i++) {
    t += 12_000; // 50 in each 10 minutes, all within the day
    const r = one("carrier", `c${i}`, "view", true);
    assert.equal(r.count, true);
    if (r.count && r.unique) seen++;
  }
  assert.equal(seen, MAP_UNIQUES_PER_NET, "one network: unique for the first 300 a day, then counted as not unique");
  assert.deepEqual(one("carrier", "tap-1", "tap", true), { count: true, unique: false }, "a tap is never unique");
});

/* ------------------------------------------------------------------ */
/* The browser's side (lib/map/track.ts), in the consent tests' fake browser */

type Mods = { track: typeof import("./track"); account: typeof import("../account/client") };

function boot(o: Parameters<typeof installBrowser>[0] = {}): { b: FakeBrowser; m: Mods } {
  freshModules();
  const b = installBrowser({ href: "https://www.tapturf.in/map", ...o });
  /* eslint-disable @typescript-eslint/no-require-imports */
  const m: Mods = { track: require("./track"), account: require("../account/client") };
  /* eslint-enable @typescript-eslint/no-require-imports */
  return { b, m };
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const sent = (b: FakeBrowser) => b.beacons.filter((x) => x.url === "/api/map/views");

test("track: a view as a beacon, with no consent asked, the note kept; again within 30 minutes, nothing", async () => {
  const { b, m } = boot();
  try {
    m.account.setSignInToken(null);
    m.track.countMapView(NOON);
    assert.equal(sent(b).length, 1);
    const body = await beaconBody(sent(b)[0]);
    assert.equal(body.k, "view");
    assert.equal(body.u, true, "the first of the day");
    assert.match(String(body.v), /^[0-9a-f]{16}$/, "a random tag for this one view");
    assert.deepEqual(Object.keys(body).sort(), ["k", "u", "v"], "nothing else about the browser");
    assert.equal(sent(b)[0].body.type, "application/json");
    assert.deepEqual(JSON.parse(b.local.getItem(MAP_SEEN_KEY) ?? "null"), { d: "2026-11-02", at: NOON }, "the day and the time, nothing else");
    assert.equal(b.jar.header, "", "no cookie");
    m.track.countMapView(NOON + 10 * MIN);
    assert.equal(sent(b).length, 1, "a reload or Back: the same view");
    m.track.countMapView(NOON + 31 * MIN);
    assert.equal(sent(b).length, 2);
    assert.equal((await beaconBody(sent(b)[1])).u, false, "later the same day: not unique");
    m.track.countMapView(AFTER_MIDNIGHT);
    assert.equal((await beaconBody(sent(b)[2])).u, true, "India's next day: unique again");
    assert.equal(b.fetches.length, 0, "no other request");
  } finally {
    b.uninstall();
  }
});

test("track: a second tab (the note in storage) is the same view; storage that throws still counts once", () => {
  const { b, m } = boot();
  try {
    m.account.setSignInToken(null);
    b.local.setItem(MAP_SEEN_KEY, JSON.stringify({ d: "2026-11-02", at: NOON - 5 * MIN }));
    m.track.countMapView(NOON);
    assert.equal(sent(b).length, 0, "another tab counted it a moment ago");
  } finally {
    b.uninstall();
  }
  const x = boot();
  try {
    x.m.account.setSignInToken(null);
    const boom = () => {
      throw new Error("blocked");
    };
    Object.assign(x.b.local, { getItem: boom, setItem: boom });
    x.m.track.countMapView(NOON);
    x.m.track.countMapView(NOON + MIN);
    assert.equal(sent(x.b).length, 1, "counted once in this page, from the note in memory");
  } finally {
    x.b.uninstall();
  }
});

test("track: never for an automated browser or a bot", () => {
  for (const o of [{ webdriver: true }, { ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }, { ua: "Mozilla/5.0 HeadlessChrome/130.0.0.0 Safari/537.36" }]) {
    const { b, m } = boot("ua" in o ? { ua: o.ua } : {});
    try {
      if ("webdriver" in o) b.nav.webdriver = true;
      m.account.setSignInToken(null);
      m.track.countMapView(NOON);
      m.track.countMapTap("/turf/o2-turf-pune", NOON);
      m.track.countMiniMapOpen();
      assert.equal(sent(b).length + b.fetches.length, 0, JSON.stringify(o));
      assert.equal(b.local.getItem(MAP_SEEN_KEY), null, "and no note");
    } finally {
      b.uninstall();
    }
  }
});

test("track: a card opened is a tap (a double tap is one); other links are not; a turf page's map opened is a mini", async () => {
  const { b, m } = boot();
  try {
    m.account.setSignInToken(null);
    m.track.countMapView(NOON - MIN);
    m.track.countMapTap("https://www.tapturf.in/turf/o2-turf-pune", NOON);
    m.track.countMapTap("https://www.tapturf.in/turf/o2-turf-pune", NOON + 500);
    m.track.countMapTap("https://www.tapturf.in/game/7b9c2f9e-0000-4000-8000-000000000001", NOON + 600);
    m.track.countMapTap("tel:+919000000001", NOON + 700);
    m.track.countMapTap("https://openfreemap.org/", NOON + 800);
    m.track.countMapTap("https://www.tapturf.in/turf/o2-turf-pune", NOON + 5_000);
    const kinds = await Promise.all(sent(b).map(async (x) => (await beaconBody(x)).k));
    assert.deepEqual(kinds, ["view", "tap", "tap", "tap"], "the view, then two turf taps (one a double tap) and a game");
    m.track.countMiniMapOpen();
    assert.equal((await beaconBody(sent(b)[4])).k, "mini");
    assert.deepEqual(JSON.parse(b.local.getItem(MAP_SEEN_KEY) ?? "null"), { d: "2026-11-02", at: NOON - MIN }, "taps keep no note of their own");
  } finally {
    b.uninstall();
  }
});

test("track: a card tapped before the view went (the list up before the map) brings the view along, once", async () => {
  const { b, m } = boot();
  try {
    m.account.setSignInToken(null);
    m.track.countMapTap("https://www.tapturf.in/turf/o2-turf-pune", NOON);
    const first = await Promise.all(sent(b).map((x) => beaconBody(x)));
    assert.deepEqual(first.map((x) => [x.k, x.u]), [["view", true], ["tap", undefined]], "the view (the first of the day), then the tap");
    assert.deepEqual(JSON.parse(b.local.getItem(MAP_SEEN_KEY) ?? "null"), { d: "2026-11-02", at: NOON }, "the view's note");
    m.track.countMapTap("https://www.tapturf.in/game/7b9c2f9e-0000-4000-8000-000000000001", NOON + MIN);
    m.track.countMapView(NOON + 2 * MIN);
    const kinds = await Promise.all(sent(b).map(async (x) => (await beaconBody(x)).k));
    assert.deepEqual(kinds, ["view", "tap", "tap"], "another tap, and the map's own wait finishing later: no second view");
    m.track.countMapTap("tel:+919000000001", NOON + 40 * MIN);
    assert.equal(sent(b).length, 3, "a link that isn't a card brings nothing");
  } finally {
    b.uninstall();
  }
});

test("track: signed in, a keepalive fetch carries the sign-in and no beacon goes; while it is unknown, it waits", async () => {
  const { b, m } = boot();
  try {
    m.account.setSignInToken(async () => ({ token: "tok-123" }));
    m.track.countMapView(NOON);
    await tick();
    assert.equal(sent(b).length, 0, "no beacon: it can't carry the sign-in");
    const [f] = b.fetches;
    assert.equal(f.url, "/api/map/views");
    assert.equal(f.init?.keepalive, true);
    assert.equal(new Headers(f.init?.headers).get("authorization"), "Bearer tok-123");
    assert.equal(JSON.parse(String(f.init?.body)).k, "view");
  } finally {
    b.uninstall();
  }
  const w = boot();
  try {
    w.m.track.countMiniMapOpen();
    await tick();
    assert.equal(sent(w.b).length + w.b.fetches.length, 0, "AuthProvider hasn't said yet: waiting");
    w.m.account.setSignInToken(null);
    await tick();
    assert.equal(sent(w.b).length, 1, "signed out: the beacon goes");
  } finally {
    w.b.uninstall();
  }
  const n = boot();
  try {
    n.m.account.setSignInToken(async () => ({ unknown: true }));
    n.m.track.countMapTap("/turf/o2-turf-pune", NOON);
    await tick();
    assert.equal(sent(n.b).length, 2, "no token to be had: a guest's, as beacons (the view the tap brought, and the tap)");
    assert.equal(n.b.fetches.length, 0);
  } finally {
    n.b.uninstall();
  }
});

test("track: the view waits for the page to be on screen", async () => {
  const { b, m } = boot();
  try {
    m.account.setSignInToken(null);
    const doc = globalThis.document as unknown as { visibilityState: string };
    doc.visibilityState = "hidden";
    const stop = m.track.countMapViewWhenShown();
    await tick();
    assert.equal(sent(b).length, 0, "a background tab or a prerender: nothing yet");
    doc.visibilityState = "visible";
    b.fire("visibilitychange");
    await tick();
    assert.equal(sent(b).length, 1, "on screen: counted");
    b.fire("visibilitychange");
    await tick();
    assert.equal(sent(b).length, 1, "once");
    stop();
    const again = m.track.countMapViewWhenShown();
    again();
    await tick();
    assert.equal(sent(b).length, 1, "a page gone before it was counted sends nothing");
  } finally {
    b.uninstall();
  }
});
