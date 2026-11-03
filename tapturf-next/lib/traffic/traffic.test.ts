import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  NOT_FOUND_PATH,
  PATH_MAX,
  TRAFFIC_PER_MIN,
  TRAFFIC_PER_NET_PAGE,
  TRAFFIC_VISITS_PER_NET,
  arrivalOf,
  authReturn,
  cleanHost,
  createTrafficLimiter,
  hostSource,
  normalPath,
  ownSite,
  pageKind,
  parseTrafficBody,
  referrerHost,
  skipPath,
  trafficBody,
  utmSource,
} from "./traffic";
import { isOwnerIdentity } from "../admin/owner";

// ---------------------------------------------------------------------------
// The page

test("normalPath: no query or hash, lowercased, one slash at a time, no trailing slash, capped", () => {
  assert.equal(normalPath("/"), "/");
  assert.equal(normalPath("/Pune/"), "/pune");
  assert.equal(normalPath("/turf/kick-off-arena?utm_source=whatsapp&x=1"), "/turf/kick-off-arena");
  assert.equal(normalPath("/blog/best-turfs#faq"), "/blog/best-turfs");
  assert.equal(normalPath("//turf//x///"), "/turf/x");
  assert.equal(normalPath("/?q=1"), "/");
  assert.equal(normalPath("/" + "a".repeat(300))?.length, PATH_MAX);
  for (const bad of ["", "turf/x", "https://x.com/a", "/a b", "/a\\b", "/a\nb", null, undefined]) assert.equal(normalPath(bad as string), null, String(bad));
});

test("skipPath: the admin and the API are never counted", () => {
  for (const p of ["/admin", "/admin/tools", "/admin/live", "/api/traffic", "/api", "/_next/static/x.js"]) assert.equal(skipPath(p), true, p);
  for (const p of ["/", "/administrator-turf", "/apis", "/pune", "/turf/admin"]) assert.equal(skipPath(p), false, p);
});

test("pageKind: every kind of page from its path", () => {
  const cases: [string, string][] = [
    ["/", "home"],
    ["/pune", "city"],
    ["/navi-mumbai", "city"],
    ["/pune/football", "city_sport"],
    ["/pune/box-cricket", "city_sport"],
    ["/turf/kick-off-arena-baner", "turf"],
    ["/sport/football", "sport"],
    ["/turf-near-me", "near_me"],
    ["/badminton-courts-near-me", "near_me"],
    ["/turfs", "turfs_list"],
    ["/c/pune/turfs", "turfs_list"],
    ["/c/pune", "home"],
    ["/c/pick/pune", "home"],
    ["/c/pune/games", "games"],
    ["/games", "games"],
    ["/game/0f3c2a", "game"],
    ["/game/create", "game_create"],
    ["/tools", "tools"],
    ["/tools/cricket-live-scorer", "tools"],
    ["/blog", "blog"],
    ["/blog/best-turfs-in-pune", "blog"],
    ["/map", "map"],
    ["/live/abcdefabcdef", "live"],
    ["/tournament/abcdefabcdef", "tournament"],
    ["/tournament/new", "tournament"],
    ["/u/asha_p", "profile"],
    ["/dashboard", "dashboard"],
    ["/my", "my"],
    ["/my/turf/123", "my"],
    ["/privacy", "other"],
    ["/terms", "other"],
    ["/login", "other"],
    ["/login/complete", "other"],
    ["/account/link", "other"],
    ["/turf/a/b", "other"],
    ["/pune/football/extra", "other"],
    ["/wp-login.php", "other"],
    ["/x", "other"],
  ];
  for (const [p, k] of cases) assert.equal(pageKind(p), k, p);
});

// ---------------------------------------------------------------------------
// Where a page load came from

test("referrerHost: the host of a web page or an Android app, nothing else", () => {
  assert.equal(referrerHost("https://www.google.co.in/"), "google.co.in");
  assert.equal(referrerHost("https://l.instagram.com/?u=https%3A%2F%2Ftapturf.in"), "l.instagram.com");
  assert.equal(referrerHost("android-app://com.whatsapp/"), "com.whatsapp");
  assert.equal(referrerHost("android-app://com.google.android.googlequicksearchbox/https/www.google.com"), "com.google.android.googlequicksearchbox");
  for (const x of ["", null, undefined, "not a url", "file:///x", "data:text/html,x"]) assert.equal(referrerHost(x), null, String(x));
});

test("hostSource: search, AI chat, the apps; anything else is another site", () => {
  const cases: [string, string | null][] = [
    ["google.com", "google"],
    ["google.co.in", "google"],
    ["news.google.com", "google"],
    ["com.google.android.googlequicksearchbox", "google"],
    ["mail.google.com", null],
    ["com.google.android.gm", null],
    ["bing.com", "search_other"],
    ["duckduckgo.com", "search_other"],
    ["in.search.yahoo.com", "search_other"],
    ["chatgpt.com", "ai"],
    ["chat.openai.com", "ai"],
    ["perplexity.ai", "ai"],
    ["gemini.google.com", "ai"],
    ["copilot.microsoft.com", "ai"],
    ["claude.ai", "ai"],
    ["wa.me", "whatsapp"],
    ["web.whatsapp.com", "whatsapp"],
    ["l.wl.co", "whatsapp"],
    ["com.whatsapp", "whatsapp"],
    ["instagram.com", "instagram"],
    ["l.instagram.com", "instagram"],
    ["facebook.com", "facebook"],
    ["l.facebook.com", "facebook"],
    ["m.facebook.com", "facebook"],
    ["lm.facebook.com", "facebook"],
    ["fb.me", "facebook"],
    ["youtube.com", "youtube"],
    ["m.youtube.com", "youtube"],
    ["youtu.be", "youtube"],
    ["t.co", "x"],
    ["x.com", "x"],
    ["twitter.com", "x"],
    ["reddit.com", null],
    ["fax.com", null],
    ["googleblog.example", null],
    ["notgoogle.com", null],
  ];
  for (const [h, s] of cases) assert.equal(hostSource(h), s, h);
});

test("authReturn: back from a sign-in is not an arrival", () => {
  for (const h of ["accounts.google.com", "hwfsbpzercuoshodmnuf.supabase.co", "tapturf.firebaseapp.com"]) assert.equal(authReturn(h), true, h);
  for (const h of ["google.com", "supabase.com", "example.co"]) assert.equal(authReturn(h), false, h);
});

test("cleanHost: a real name only, lowercased, no www., no port, capped; never an IP or localhost", () => {
  assert.equal(cleanHost("WWW.Reddit.com"), "reddit.com");
  assert.equal(cleanHost("news.ycombinator.com:443"), "news.ycombinator.com");
  assert.equal(cleanHost("xn--bcher-kva.example"), "xn--bcher-kva.example");
  for (const x of ["10.0.0.1", "192.168.1.5:8080", "localhost", "[::1]", "a b.com", "-x.com", "x-.com", "x".repeat(101) + ".com", "", null]) assert.equal(cleanHost(x), null, String(x));
});

test("utmSource: names and hosts it knows; anything else is not read", () => {
  assert.equal(utmSource("chatgpt.com"), "ai");
  assert.equal(utmSource("WhatsApp"), "whatsapp");
  assert.equal(utmSource("ig"), "instagram");
  assert.equal(utmSource("perplexity"), "ai");
  assert.equal(utmSource("google"), "google");
  for (const x of ["newsletter", "summer_campaign", "", null, undefined]) assert.equal(utmSource(x), null, String(x));
});

test("ownSite: www. or not, any port", () => {
  assert.equal(ownSite("tapturf.in", "www.tapturf.in"), true);
  assert.equal(ownSite("www.tapturf.in", "www.tapturf.in"), true);
  assert.equal(ownSite("localhost", "localhost:3000"), true);
  assert.equal(ownSite("tapturf.in.evil.example", "www.tapturf.in"), false);
});

const OWN = "www.tapturf.in";
const arr = (referrer: string, navType: string | null = "navigate", utm: string | null = null) => arrivalOf({ referrer, ownHost: OWN, utm, navType });

test("arrivalOf: from outside on a real navigation is a visit, with its source", () => {
  assert.deepEqual(arr("https://www.google.com/"), { source: "google", host: null, visit: true });
  assert.deepEqual(arr(""), { source: "direct", host: null, visit: true });
  assert.deepEqual(arr("android-app://com.whatsapp/"), { source: "whatsapp", host: null, visit: true });
  assert.deepEqual(arr("https://www.reddit.com/r/pune/"), { source: "other_site", host: "reddit.com", visit: true });
  assert.deepEqual(arr("http://192.168.1.10/"), { source: "other_site", host: null, visit: true }, "an address is never kept as a host");
  assert.deepEqual(arr("https://chatgpt.com/", "prerender"), { source: "ai", host: null, visit: true }, "a prerendered page shown is a navigation");
  assert.deepEqual(arr("", null), { source: "direct", host: null, visit: true }, "a browser that doesn't say: a navigation");
});

test("arrivalOf: a reload or Back/Forward is a view inside a visit already counted: internal, never a visit", () => {
  assert.deepEqual(arr("https://www.google.com/", "reload"), { source: "internal", host: null, visit: false });
  assert.deepEqual(arr("", "reload"), { source: "internal", host: null, visit: false }, "a reload of a page the site moved to: no referrer");
  assert.deepEqual(arr("", "back_forward"), { source: "internal", host: null, visit: false });
  assert.deepEqual(arr("https://www.reddit.com/", "back_forward", "whatsapp"), { source: "internal", host: null, visit: false });
});

test("arrivalOf: from this site, or back from a sign-in, is internal, never a visit", () => {
  assert.deepEqual(arr("https://www.tapturf.in/pune"), { source: "internal", host: null, visit: false });
  assert.deepEqual(arr("https://tapturf.in/"), { source: "internal", host: null, visit: false });
  assert.deepEqual(arr("https://accounts.google.com/", "navigate", "whatsapp"), { source: "internal", host: null, visit: false }, "even with a utm_source");
  assert.deepEqual(arr("https://hwfsbpzercuoshodmnuf.supabase.co/auth/v1/callback"), { source: "internal", host: null, visit: false });
});

test("arrivalOf: a known utm_source wins over the referrer; an unknown one is not read", () => {
  assert.deepEqual(arr("", "navigate", "whatsapp"), { source: "whatsapp", host: null, visit: true });
  assert.deepEqual(arr("https://chatgpt.com/", "navigate", "chatgpt.com"), { source: "ai", host: null, visit: true });
  assert.deepEqual(arr("https://www.reddit.com/", "navigate", "newsletter"), { source: "other_site", host: "reddit.com", visit: true });
  assert.deepEqual(arr("", "navigate", "newsletter"), { source: "direct", host: null, visit: true });
});

// ---------------------------------------------------------------------------
// The body

test("trafficBody: the path, the source, a visit, another site's host only for a visit from one; nothing else", () => {
  assert.deepEqual(JSON.parse(trafficBody({ path: "/pune", notFound: false, source: "google", host: null, visit: true })), { p: "/pune", s: "google", v: 1 });
  assert.deepEqual(JSON.parse(trafficBody({ path: "/pune", notFound: false, source: "google", host: null, visit: false })), { p: "/pune", s: "google" });
  assert.deepEqual(JSON.parse(trafficBody({ path: "/blog/x", notFound: false, source: "other_site", host: "reddit.com", visit: true })), { p: "/blog/x", s: "other_site", v: 1, h: "reddit.com" });
  assert.deepEqual(JSON.parse(trafficBody({ path: "/blog/y", notFound: false, source: "other_site", host: "reddit.com", visit: false })), { p: "/blog/y", s: "other_site" }, "no host on a view");
  assert.deepEqual(JSON.parse(trafficBody({ path: "/x", notFound: true, source: "direct", host: null, visit: true })), { p: "/x", s: "direct", v: 1, nf: 1 });
  assert.deepEqual(JSON.parse(trafficBody({ path: "/", notFound: false, source: "internal", host: null, visit: true })), { p: "/", s: "internal" }, "internal is never a visit");
  assert.ok(trafficBody({ path: "/" + "a".repeat(119), notFound: true, source: "other_site", host: "x".repeat(96) + ".com", visit: true }).length < 400, "the largest body fits the route's limit");
});

test("parseTrafficBody: the kind from the path, never from the browser; a visit only from outside", () => {
  assert.deepEqual(parseTrafficBody({ p: "/turf/kick-off-arena", s: "google", v: 1, k: "home" }), { path: "/turf/kick-off-arena", kind: "turf", source: "google", host: null, visit: true });
  assert.deepEqual(parseTrafficBody({ p: "/Pune/?x=1", s: "internal", v: 1 }), { path: "/pune", kind: "city", source: "internal", host: null, visit: false });
  assert.deepEqual(parseTrafficBody({ p: "/pune", s: "whatsapp", h: "evil.example" }), { path: "/pune", kind: "city", source: "whatsapp", host: null, visit: false }, "a host only for another site's visit");
  assert.deepEqual(parseTrafficBody({ p: "/blog/x", s: "other_site", v: true, h: "WWW.Reddit.com" }), { path: "/blog/x", kind: "blog", source: "other_site", host: "reddit.com", visit: true });
  assert.deepEqual(parseTrafficBody({ p: "/blog/x", s: "other_site", v: 1, h: "10.0.0.1" }), { path: "/blog/x", kind: "blog", source: "other_site", host: null, visit: true });
  assert.deepEqual(parseTrafficBody({ p: "/", s: "other_site", v: 1, h: "l.instagram.com" }), { path: "/", kind: "home", source: "instagram", host: null, visit: true }, "a known host is its source");
  assert.deepEqual(parseTrafficBody({ p: "/", s: "other_site", v: 1, h: "accounts.google.com" }), { path: "/", kind: "home", source: "internal", host: null, visit: false }, "a sign-in page is not an arrival");
  assert.deepEqual(parseTrafficBody({ p: "/old-link", s: "direct", v: 1, nf: 1 }), { path: NOT_FOUND_PATH, kind: "other", source: "direct", host: null, visit: true }, "a page that doesn't exist: its address isn't kept");
});

test("parseTrafficBody: anything that isn't a view is null", () => {
  for (const b of [null, [], "x", {}, { p: "/" }, { p: "/", s: "tiktok" }, { p: "/admin", s: "direct" }, { p: "/api/traffic", s: "direct" }, { p: "turf/x", s: "direct" }, { p: 5, s: "direct" }]) {
    assert.equal(parseTrafficBody(b), null, JSON.stringify(b));
  }
});

test("a body round-trips: what the browser sends is what the server counts", () => {
  const a = arr("https://www.reddit.com/r/pune/");
  const body = JSON.parse(trafficBody({ path: normalPath("/Blog/Best-Turfs/")!, notFound: false, source: a.source, host: a.host, visit: a.visit }));
  assert.deepEqual(parseTrafficBody(body), { path: "/blog/best-turfs", kind: "blog", source: "other_site", host: "reddit.com", visit: true });
});

// ---------------------------------------------------------------------------
// The limits

test("createTrafficLimiter: per network a minute, per page, and visits an hour", () => {
  let t = 0;
  const take = createTrafficLimiter(() => t);
  for (let i = 0; i < TRAFFIC_PER_NET_PAGE; i++) assert.deepEqual(take("net-a", "/pune", false), { count: true, visit: false });
  assert.deepEqual(take("net-a", "/pune", false), { count: false, why: "many" }, "one page past its limit");
  assert.deepEqual(take("net-a", "/turf/x", true), { count: true, visit: true }, "another page still counts");
  assert.deepEqual(take("net-b", "/pune", false), { count: true, visit: false }, "another network is its own");
  for (let i = 0; i < TRAFFIC_PER_MIN; i++) take("net-c", `/p${i}`, false);
  assert.deepEqual(take("net-c", "/q", false), { count: false, why: "slow" }, "past the network's minute");
  t += 61_000;
  assert.equal(take("net-c", "/q", false).count, true, "the next minute");
  let visits = 0;
  t += 60 * 60_000;
  for (let i = 0; i < TRAFFIC_VISITS_PER_NET + 5; i++) {
    if (i % TRAFFIC_PER_MIN === 0) t += 61_000;
    const r = take("net-d", `/v${i}`, true);
    if (r.count && r.visit) visits++;
  }
  assert.equal(visits, TRAFFIC_VISITS_PER_NET, "past the hour's visits a view counts, not as a visit");
});

// ---------------------------------------------------------------------------
// The site owner, and what the site says

test("isOwnerIdentity: the owner's number or Google email only", () => {
  assert.equal(isOwnerIdentity({ kind: "phone", phone: "+919403612979" }), true);
  assert.equal(isOwnerIdentity({ kind: "phone", phone: "+19403612979" }), false, "a foreign number ending the same way");
  assert.equal(isOwnerIdentity({ kind: "phone", phone: "+919000000001" }), false);
  assert.equal(isOwnerIdentity({ kind: "google", email: "LonkarAbhishek00@gmail.com" }), true);
  assert.equal(isOwnerIdentity({ kind: "google", email: "someone@example.com" }), false);
  assert.equal(isOwnerIdentity({ kind: "google", email: null }), false);
});

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8").replace(/\s+/g, " ");

test("the privacy page says what traffic counts records, and that it runs either way and keeps nothing on the device", () => {
  const page = read("app/privacy/page.tsx");
  const at = page.indexOf('id="traffic"');
  assert.ok(at >= 0, "the policy has #traffic");
  const para = page.slice(at, page.indexOf("</p>", at));
  assert.match(para, /which page was opened/);
  assert.match(para, /the name of the website or app/);
  assert.match(para, /whether you were signed in/);
  assert.match(para, /the day/);
  assert.match(para, /nothing on your device/);
  assert.match(para, /we don&rsquo;t store your IP address/);
  assert.match(para, /whichever cookie choice you make/);
  assert.match(page, /pages opened and where visits came from/, "under What runs either way");
  assert.match(page, /The daily counts of visits and pages opened name nobody/, "how long");
  const banner = read("components/consent/CookieBanner.tsx");
  assert.match(banner, /TapTurf&rsquo;s own anonymous counts run either way and keep nothing on your device/, "the banner's promise, which the counter keeps");
});

test("the counter is mounted in the root layout, outside the consent gates, and loads nothing from elsewhere", () => {
  const layout = read("app/layout.tsx");
  assert.match(layout, /<TrafficCounter \/>/);
  const raw = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  const counter = raw("components/analytics/TrafficCounter.tsx");
  assert.doesNotMatch(counter, /useConsent|analyticsAllowed/, "not behind the cookie choice");
  for (const src of [counter, raw("lib/traffic/track.ts"), raw("lib/count/send.ts")]) {
    assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ""), /localStorage\.|sessionStorage\.|indexedDB|document\.cookie\s*=|https?:\/\//, "no device storage, no other site");
  }
});
