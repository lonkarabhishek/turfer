// Run with: npm run test:city (compiles to .test-out and runs node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { decide, isCrawler, detectCityFromHeaders, publicPathFromInternal, PICK_GUARD_JS, type ProxyInput } from "./cityRouting";
import {
  confirmedCity,
  parseCityCookie,
  serializeCityChoice,
  scopeOf,
  resolveCityScope,
  matchCities,
  byDistanceFrom,
  kmBetween,
  nearestCity,
  nearestCityAny,
  cityCoords,
  cityPoint,
  cityPointsOf,
  distanceKm,
  pickOtherCities,
  HOME_CITIES,
  cityInfo,
  cityInText,
  guessCityFromAddress,
  isCitySlug,
  isKnownCity,
  stateFor,
  CITIES,
  CITY_ALIASES,
  CITY_LIST,
  CITY_LIST_AND,
  RESERVED_CITY_SLUGS,
  type CityChoice,
} from "./city";
import { CITY_PREPAINT_JS } from "./cityPrePaint";

const CHROME = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const GOOGLEBOT =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const PUNE = { "x-vercel-ip-country": "IN", "x-vercel-ip-latitude": "18.5204", "x-vercel-ip-longitude": "73.8567" };
const DOC = { accept: "text/html", "accept-language": "en-IN,en;q=0.9", "sec-fetch-dest": "document" };

function req(o: { path?: string; method?: string; ua?: string; cookie?: string; headers?: Record<string, string> } = {}): ProxyInput {
  const url = new URL(o.path ?? "/", "http://x");
  const h: Record<string, string> = { "user-agent": o.ua ?? CHROME, ...DOC, ...(o.headers ?? {}) };
  for (const k of Object.keys(h)) if (h[k] === "") delete h[k];
  return {
    method: o.method ?? "GET",
    pathname: url.pathname,
    search: url.search,
    header: (n) => h[n.toLowerCase()] ?? null,
    cookie: o.cookie,
  };
}

test("crawlers get next with no cookie, even with Pune geo", () => {
  const uas = [
    GOOGLEBOT,
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "WhatsApp/2.23.20.0 A",
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36",
    "curl/8.5.0",
    "",
  ];
  for (const ua of uas) {
    for (const path of ["/", "/turfs", "/games"]) {
      const d = decide(req({ ua, path, headers: PUNE }));
      assert.deepEqual(d, { action: "next", setCookie: undefined, debug: "default" }, `${ua} ${path}`);
    }
  }
});

test("a browser UA without Accept-Language is treated as a crawler", () => {
  assert.equal(isCrawler((n) => (n === "user-agent" ? CHROME : null)), true);
  const d = decide(req({ headers: { ...PUNE, "accept-language": "" } }));
  assert.deepEqual(d, { action: "next", setCookie: undefined, debug: "default" });
});

test("a CUBOT phone is human", () => {
  const ua = "Mozilla/5.0 (Linux; Android 12; CUBOT KINGKONG 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
  assert.equal(isCrawler((n) => (n === "user-agent" ? ua : n === "accept-language" ? "en" : null)), false);
});

test("a cookie sent on purpose routes a crawler UA like a human, except all", () => {
  assert.deepEqual(decide(req({ ua: GOOGLEBOT, cookie: "mumbai", headers: PUNE })), {
    action: "rewrite",
    pathname: "/c/mumbai",
    setCookie: undefined,
    debug: "mumbai",
  });
  // Lab runs of the pick screen: no detection, no Set-Cookie.
  assert.deepEqual(decide(req({ ua: GOOGLEBOT, cookie: "unknown", headers: PUNE })), {
    action: "rewrite",
    pathname: "/c/pick/none",
    setCookie: undefined,
    debug: "pick.none",
  });
  assert.deepEqual(decide(req({ ua: GOOGLEBOT, cookie: "geo.pune", path: "/games" })), {
    action: "rewrite",
    pathname: "/c/pick/pune/games",
    setCookie: undefined,
    debug: "pick.pune",
  });
  // The retired "all" never gates a crawler: the all-India page as before.
  assert.deepEqual(decide(req({ ua: GOOGLEBOT, cookie: "all", headers: PUNE })), { action: "next", setCookie: undefined, debug: "default" });
});

test("first visit with an IP city: the pick screen with that city, and geo.<city> is remembered", () => {
  for (const [path, target] of [["/", "/c/pick/pune"], ["/turfs", "/c/pick/pune/turfs"], ["/games", "/c/pick/pune/games"]]) {
    const d = decide(req({ path, headers: PUNE }));
    assert.deepEqual(d, { action: "rewrite", pathname: target, setCookie: "geo.pune", debug: "pick.pune" }, path);
  }
});

test("first visit without an IP city: the pick screen with no city, and unknown is remembered", () => {
  for (const [path, target] of [["/", "/c/pick/none"], ["/turfs", "/c/pick/none/turfs"], ["/games", "/c/pick/none/games"]]) {
    const d = decide(req({ path }));
    assert.deepEqual(d, { action: "rewrite", pathname: target, setCookie: "unknown", debug: "pick.none" }, path);
  }
});

test("a geo cookie is not confirmed: the pick screen every time, with today's IP city", () => {
  // Same IP city: no Set-Cookie.
  assert.deepEqual(decide(req({ cookie: "geo.pune", headers: PUNE })), { action: "rewrite", pathname: "/c/pick/pune", setCookie: undefined, debug: "pick.pune" });
  // An IP that gives nothing away (no headers, outside India) keeps the earlier guess.
  assert.deepEqual(decide(req({ cookie: "geo.pune" })), { action: "rewrite", pathname: "/c/pick/pune", setCookie: undefined, debug: "pick.pune" });
  const us = { "x-vercel-ip-country": "US", "x-vercel-ip-latitude": "37.77", "x-vercel-ip-longitude": "-122.41" };
  assert.deepEqual(decide(req({ cookie: "geo.pune", headers: us, path: "/games" })), {
    action: "rewrite",
    pathname: "/c/pick/pune/games",
    setCookie: undefined,
    debug: "pick.pune",
  });
  // Different IP city today: the pick screen offers it, and it replaces the guess on documents.
  const mumbai = { "x-vercel-ip-country": "IN", "x-vercel-ip-latitude": "19.07", "x-vercel-ip-longitude": "72.88" };
  assert.deepEqual(decide(req({ cookie: "geo.pune", headers: mumbai, path: "/turfs" })), {
    action: "rewrite",
    pathname: "/c/pick/mumbai/turfs",
    setCookie: "geo.mumbai",
    debug: "pick.mumbai",
  });
  // An RSC request follows today's IP too but never writes the cookie.
  const rsc = { ...mumbai, "sec-fetch-dest": "empty", accept: "*/*", rsc: "1" };
  assert.deepEqual(decide(req({ cookie: "geo.pune", headers: rsc })), { action: "rewrite", pathname: "/c/pick/mumbai", setCookie: undefined, debug: "pick.mumbai" });
  // A deep link is not gated, but the guess still moves on a document.
  assert.deepEqual(decide(req({ cookie: "geo.pune", headers: mumbai, path: "/turf/abc" })), { action: "next", setCookie: "geo.mumbai", debug: "mumbai" });
  // A confirmed pick is never re-detected.
  assert.deepEqual(decide(req({ cookie: "pune", headers: mumbai })), { action: "rewrite", pathname: "/c/pune", setCookie: undefined, debug: "pune" });
  // A crawler sending a geo cookie on purpose is not re-detected either.
  assert.deepEqual(decide(req({ ua: GOOGLEBOT, cookie: "geo.pune", headers: mumbai })), {
    action: "rewrite",
    pathname: "/c/pick/pune",
    setCookie: undefined,
    debug: "pick.pune",
  });
});

test("a confirmed pick goes straight to its city twin", () => {
  for (const [path, target] of [["/", "/c/nashik"], ["/turfs", "/c/nashik/turfs"], ["/games", "/c/nashik/games"]]) {
    // An IP elsewhere never overrides a pick, and no Set-Cookie.
    assert.deepEqual(decide(req({ path, cookie: "nashik", headers: PUNE })), { action: "rewrite", pathname: target, setCookie: undefined, debug: "nashik" });
  }
});

test("the old all cookie is unconfirmed: detected again, replaced, and the pick screen once", () => {
  assert.deepEqual(decide(req({ cookie: "all", headers: PUNE })), {
    action: "rewrite",
    pathname: "/c/pick/pune",
    setCookie: "geo.pune",
    debug: "pick.pune",
  });
  assert.deepEqual(decide(req({ cookie: "all", path: "/games" })), {
    action: "rewrite",
    pathname: "/c/pick/none/games",
    setCookie: "unknown",
    debug: "pick.none",
  });
  // On a deep link it is replaced too, and nothing is gated.
  assert.deepEqual(decide(req({ cookie: "all", path: "/turf/abc", headers: PUNE })), { action: "next", setCookie: "geo.pune", debug: "pune" });
  // An RSC request never writes the cookie, but still gets the pick screen.
  const rsc = decide(req({ cookie: "all", headers: { ...PUNE, "sec-fetch-dest": "empty", accept: "*/*", rsc: "1" } }));
  assert.deepEqual(rsc, { action: "rewrite", pathname: "/c/pick/pune", setCookie: undefined, debug: "pick.pune" });
});

test("RSC and prefetch requests are rewritten like documents but never set the cookie", () => {
  const rsc = { ...PUNE, "sec-fetch-dest": "empty", accept: "*/*", rsc: "1" };
  assert.deepEqual(decide(req({ headers: rsc })), { action: "rewrite", pathname: "/c/pick/pune", setCookie: undefined, debug: "pick.pune" });
  const prefetch = { ...rsc, "next-router-prefetch": "1" };
  assert.deepEqual(decide(req({ path: "/turfs", headers: prefetch })), {
    action: "rewrite",
    pathname: "/c/pick/pune/turfs",
    setCookie: undefined,
    debug: "pick.pune",
  });
  assert.deepEqual(decide(req({ path: "/games", cookie: "pune", headers: prefetch })), {
    action: "rewrite",
    pathname: "/c/pune/games",
    setCookie: undefined,
    debug: "pune",
  });
  // No sec-fetch-dest and no text/html: not a document either.
  const e = decide(req({ headers: { ...PUNE, "sec-fetch-dest": "", accept: "*/*" } }));
  assert.equal(e.action === "rewrite" && e.setCookie, undefined);
});

test("outside India is unknown: the pick screen with no city", () => {
  const d = decide(req({ headers: { "x-vercel-ip-country": "US", "x-vercel-ip-latitude": "37.77", "x-vercel-ip-longitude": "-122.41" } }));
  assert.deepEqual(d, { action: "rewrite", pathname: "/c/pick/none", setCookie: "unknown", debug: "pick.none" });
  const london = decide(req({ headers: { "x-vercel-ip-latitude": "51.5", "x-vercel-ip-longitude": "-0.12" } }));
  assert.deepEqual(london, { action: "rewrite", pathname: "/c/pick/none", setCookie: "unknown", debug: "pick.none" });
});

test("a malformed city header with no coords does not throw", () => {
  const d = decide(req({ headers: { "x-vercel-ip-country": "IN", "x-vercel-ip-city": "%E0%A4" } }));
  assert.deepEqual(d, { action: "rewrite", pathname: "/c/pick/none", setCookie: "unknown", debug: "pick.none" });
});

test("Aurangabad, Bihar coordinates never map to Sambhajinagar (Patna is the nearest city now)", () => {
  const get = (h: Record<string, string>) => (n: string) => h[n] ?? null;
  assert.equal(
    detectCityFromHeaders(get({ "x-vercel-ip-country": "IN", "x-vercel-ip-latitude": "24.75", "x-vercel-ip-longitude": "84.37", "x-vercel-ip-city": "Aurangabad" })),
    "patna",
  );
  const d = decide(req({ headers: { "x-vercel-ip-country": "IN", "x-vercel-ip-latitude": "24.75", "x-vercel-ip-longitude": "84.37", "x-vercel-ip-city": "Aurangabad" } }));
  assert.equal(d.action === "rewrite" && d.setCookie, "geo.patna");
  // Far from every city (Imphal): still nothing.
  assert.equal(detectCityFromHeaders(get({ "x-vercel-ip-country": "IN", "x-vercel-ip-latitude": "24.82", "x-vercel-ip-longitude": "93.94" })), null);
});

test("cities curated on 26 Oct are detected from IP coordinates and names", () => {
  const get = (h: Record<string, string>) => (n: string) => h[n] ?? null;
  // Thiruvananthapuram used to come out as Kochi, 170 km away.
  const tvm = { "x-vercel-ip-country": "IN", "x-vercel-ip-latitude": "8.5241", "x-vercel-ip-longitude": "76.9366" };
  assert.equal(detectCityFromHeaders(get(tvm)), "thiruvananthapuram");
  assert.deepEqual(decide(req({ headers: tvm })), {
    action: "rewrite",
    pathname: "/c/pick/thiruvananthapuram",
    setCookie: "geo.thiruvananthapuram",
    debug: "pick.thiruvananthapuram",
  });
  // Visakhapatnam and Guwahati used to get no city at all (none within 200 km).
  assert.equal(detectCityFromHeaders(get({ "x-vercel-ip-latitude": "17.72", "x-vercel-ip-longitude": "83.30" })), "visakhapatnam");
  assert.equal(detectCityFromHeaders(get({ "x-vercel-ip-latitude": "26.18", "x-vercel-ip-longitude": "91.75" })), "guwahati");
  // The name header, by old names too.
  for (const [name, id] of [["Trivandrum", "thiruvananthapuram"], ["Calicut", "kozhikode"], ["Allahabad", "prayagraj"], ["Vizag", "visakhapatnam"], ["Patna", "patna"]]) {
    assert.equal(detectCityFromHeaders(get({ "x-vercel-ip-country": "IN", "x-vercel-ip-city": name })), id, name);
  }
});

test("the city name header is a fallback when coordinates are absent", () => {
  const d = decide(req({ headers: { "x-vercel-ip-country": "IN", "x-vercel-ip-city": "Bengaluru" } }));
  assert.deepEqual(d, { action: "rewrite", pathname: "/c/pick/bangalore", setCookie: "geo.bangalore", debug: "pick.bangalore" });
  const n = decide(req({ headers: { "x-vercel-ip-city": "Navi%20Mumbai" } }));
  assert.equal(n.action === "rewrite" && n.setCookie, "geo.mumbai");
});

test("cookie unknown upgrades on a document with geo", () => {
  assert.deepEqual(decide(req({ cookie: "unknown", headers: PUNE })), {
    action: "rewrite",
    pathname: "/c/pick/pune",
    setCookie: "geo.pune",
    debug: "pick.pune",
  });
  // Still unknown: no Set-Cookie when the value would not change.
  assert.deepEqual(decide(req({ cookie: "unknown" })), { action: "rewrite", pathname: "/c/pick/none", setCookie: undefined, debug: "pick.none" });
});

test("a bogus cookie is treated as missing", () => {
  // Reserved words and anything not slug-shaped are never a pick.
  for (const cookie of ["Pune", "pick", "none", "geo", "turfs", "blog", "pune;x", "x", "../pune", "a".repeat(40)]) {
    assert.deepEqual(decide(req({ cookie })), { action: "rewrite", pathname: "/c/pick/none", setCookie: "unknown", debug: "pick.none" }, cookie);
  }
  // An IP guess is only ever a curated city: detection yields nothing else,
  // so a forged one never reaches a pick screen that was not built.
  for (const cookie of ["geo.atlantis", "geo.testpur", "geo.pick"]) {
    assert.deepEqual(decide(req({ cookie, headers: PUNE })), {
      action: "rewrite",
      pathname: "/c/pick/pune",
      setCookie: "geo.pune",
      debug: "pick.pune",
    }, cookie);
  }
});

test("a pick of a city not curated yet is confirmed and goes to its twin", () => {
  // A city the data team added after the deploy: app/c/[city] renders it
  // on demand when it has turfs, and 404s it otherwise.
  for (const [path, target] of [["/", "/c/testpur"], ["/turfs", "/c/testpur/turfs"], ["/games", "/c/testpur/games"]]) {
    assert.deepEqual(decide(req({ path, cookie: "testpur", headers: PUNE })), { action: "rewrite", pathname: target, setCookie: undefined, debug: "testpur" }, path);
  }
  assert.deepEqual(parseCityCookie("testpur"), { kind: "city", city: "testpur", src: "pick" });
  assert.equal(parseCityCookie("geo.testpur"), null);
  assert.equal(confirmedCity(parseCityCookie("thiruvananthapuram")), "thiruvananthapuram");
});

test("/turfs?q= is never rewritten or gated", () => {
  assert.deepEqual(decide(req({ path: "/turfs?q=box", cookie: "pune" })), { action: "next", setCookie: undefined, debug: "pune" });
  assert.deepEqual(decide(req({ path: "/turfs?q=box" })), { action: "next", setCookie: "unknown", debug: "default" });
  assert.deepEqual(decide(req({ path: "/turfs?q=box", cookie: "geo.pune" })), { action: "next", setCookie: undefined, debug: "pune" });
  assert.deepEqual(decide(req({ path: "/turfs?q=box", cookie: "all", headers: PUNE })), { action: "next", setCookie: "geo.pune", debug: "pune" });
  // An empty q is no search: the gate applies.
  assert.equal(decide(req({ path: "/turfs?q=", cookie: "pune" })).action, "rewrite");
  assert.deepEqual(decide(req({ path: "/turfs?q=", cookie: "geo.pune" })), {
    action: "rewrite",
    pathname: "/c/pick/pune/turfs",
    setCookie: undefined,
    debug: "pick.pune",
  });
});

test("internal /c paths redirect to their public URL", () => {
  assert.deepEqual(decide(req({ path: "/c/pune/turfs?q=x" })), { action: "redirect", location: "/turfs?q=x" });
  assert.deepEqual(decide(req({ path: "/c" })), { action: "redirect", location: "/" });
  assert.deepEqual(decide(req({ path: "/c/pune" })), { action: "redirect", location: "/" });
  assert.deepEqual(decide(req({ path: "/c/zz/turfs", method: "POST" })), { action: "redirect", location: "/turfs" });
  assert.deepEqual(decide(req({ path: "/c/pune", headers: { "x-prerender-revalidate": "abc" } })), { action: "next", debug: "internal" });
  assert.equal(publicPathFromInternal("/c/pune/games"), "/games");
  // The pick screen's internal paths, and the retired ask twins.
  assert.deepEqual(decide(req({ path: "/c/pick/pune" })), { action: "redirect", location: "/" });
  assert.deepEqual(decide(req({ path: "/c/pick/none/turfs" })), { action: "redirect", location: "/turfs" });
  assert.deepEqual(decide(req({ path: "/c/pick/pune/games", cookie: "pune" })), { action: "redirect", location: "/games" });
  assert.deepEqual(decide(req({ path: "/c/pick", ua: GOOGLEBOT })), { action: "redirect", location: "/" });
  assert.deepEqual(decide(req({ path: "/c/ask/games" })), { action: "redirect", location: "/games" });
  assert.equal(publicPathFromInternal("/c/pick/none"), "/");
});

test("POST passes through, HEAD is routed like GET", () => {
  assert.deepEqual(decide(req({ method: "POST", headers: PUNE })), { action: "next", debug: "method" });
  assert.deepEqual(decide(req({ method: "POST", cookie: "all" })), { action: "next", debug: "method" });
  assert.deepEqual(decide(req({ method: "HEAD", headers: PUNE })), {
    action: "rewrite",
    pathname: "/c/pick/pune",
    setCookie: "geo.pune",
    debug: "pick.pune",
  });
  assert.deepEqual(decide(req({ method: "HEAD", cookie: "pune", path: "/games" })), {
    action: "rewrite",
    pathname: "/c/pune/games",
    setCookie: undefined,
    debug: "pune",
  });
});

test("deep links are never gated but still get the cookie on documents", () => {
  for (const path of ["/turf/abc", "/pune", "/pune/football", "/sport/football", "/blog/x", "/tools/scorer", "/turf-near-me"]) {
    assert.deepEqual(decide(req({ path, headers: PUNE })), { action: "next", setCookie: "geo.pune", debug: "pune" }, path);
    assert.deepEqual(decide(req({ path })), { action: "next", setCookie: "unknown", debug: "default" }, path);
  }
  assert.deepEqual(decide(req({ path: "/turf/abc", cookie: "geo.pune", headers: PUNE })), { action: "next", setCookie: undefined, debug: "pune" });
  assert.deepEqual(decide(req({ path: "/turf/abc", ua: GOOGLEBOT })), { action: "next", setCookie: undefined, debug: "default" });
});

test("confirmedCity: only a pick is confirmed", () => {
  assert.equal(confirmedCity(parseCityCookie("pune")), "pune");
  assert.equal(confirmedCity(parseCityCookie("geo.pune")), null);
  assert.equal(confirmedCity(parseCityCookie("unknown")), null);
  assert.equal(confirmedCity(parseCityCookie("all")), null);
  assert.equal(confirmedCity(null), null);
});

test("cookie codec round-trips", () => {
  const all: CityChoice[] = [
    { kind: "city", city: "pune", src: "pick" },
    { kind: "city", city: "pune", src: "geo" },
    { kind: "all" },
    { kind: "unknown" },
  ];
  for (const c of all) assert.deepEqual(parseCityCookie(serializeCityChoice(c)), c);
  assert.equal(parseCityCookie("Pune"), null);
  assert.equal(parseCityCookie("geo."), null);
  assert.equal(parseCityCookie(""), null);
  assert.equal(parseCityCookie(undefined), null);
  assert.equal(scopeOf(parseCityCookie("geo.nashik")), "nashik");
  assert.equal(scopeOf(parseCityCookie("all")), null);
});

test("resolveCityScope falls back to the nearest live city within 200 km", () => {
  const live = ["pune", "mumbai", "nashik"].map((id) => ({ id, label: CITIES.find((c) => c.id === id)!.label }));
  const r = resolveCityScope("ratnagiri", live);
  assert.equal(r.kind, "city");
  if (r.kind === "city") {
    assert.equal(r.id, "pune");
    assert.ok(r.requested && Math.abs(r.requested.km - 180) <= 15, `km ${r.requested?.km}`);
  }
  assert.deepEqual(resolveCityScope("pune", live), { kind: "city", id: "pune", label: "Pune", requested: null });
  assert.deepEqual(resolveCityScope(null, live), { kind: "india", requested: null });
  assert.deepEqual(resolveCityScope("chennai", live), { kind: "india", requested: { id: "chennai", label: "Chennai" } });
});

test("matchCities finds by label, alias and word", () => {
  const list = CITIES.map((c, i) => ({ ...c, n: 100 - i }));
  assert.equal(matchCities("beng", list)[0].id, "bangalore");
  assert.equal(matchCities("nas", list)[0].id, "nashik");
  assert.equal(matchCities("bom", list)[0].id, "mumbai");
  assert.equal(matchCities("  ", list).length, list.length);
  assert.equal(matchCities("zzz", list).length, 0);
  // Old and other names of the cities curated on 26 Oct.
  for (const [q, id] of [
    ["Trivandrum", "thiruvananthapuram"],
    ["triv", "thiruvananthapuram"],
    ["vizag", "visakhapatnam"],
    ["calicut", "kozhikode"],
    ["trichy", "tiruchirappalli"],
    ["allahabad", "prayagraj"],
    ["gulbarga", "kalaburagi"],
    ["shimoga", "shivamogga"],
    ["banaras", "varanasi"],
  ]) {
    assert.equal(matchCities(q, list)[0]?.id, id, q);
  }
  assert.ok(matchCities("kerala", list).some((c) => c.id === "thiruvananthapuram"));
});

test("matchCities lists a city not curated yet, but never by the placeholder state", () => {
  const live = [...CITIES.slice(0, 3), cityInfo("testpur")].map((c, i) => ({ ...c, n: 10 - i }));
  assert.equal(cityInfo("testpur").label, "Testpur");
  assert.deepEqual(matchCities("test", live).map((c) => c.id), ["testpur"]);
  // "India" is cityInfo's placeholder state: "ind" must not find it.
  assert.equal(matchCities("ind", live).some((c) => c.id === "testpur"), false);
});

test("resolveCityScope accepts a live city that is not curated", () => {
  const live = [{ id: "pune", label: "Pune" }, { id: "testpur", label: "Testpur" }];
  assert.deepEqual(resolveCityScope("testpur", live), { kind: "city", id: "testpur", label: "Testpur", requested: null });
  // Not live and no centroid: all of India.
  assert.deepEqual(resolveCityScope("atlantis", live), { kind: "india", requested: { id: "atlantis", label: "Atlantis" } });
});

test("isCitySlug: any slug-shaped city, never a reserved word or garbage", () => {
  for (const ok of ["pune", "thiruvananthapuram", "testpur", "new-town"]) assert.equal(isCitySlug(ok), true, ok);
  for (const bad of ["", "x", "Pune", "pune;", "pune x", "../x", "-pune", "a".repeat(32), "geo.pune", null, undefined, ...RESERVED_CITY_SLUGS]) {
    assert.equal(isCitySlug(bad), false, String(bad));
  }
  // No curated city collides with a reserved word or a route.
  for (const c of CITIES) assert.equal(isCitySlug(c.id), true, c.id);
  assert.equal(isKnownCity("testpur"), false);
});

test("the curated list: every live city on 26 Oct, each with a centroid and nothing else", () => {
  assert.equal(CITIES.length, 96);
  assert.equal(new Set(CITIES.map((c) => c.id)).size, CITIES.length);
  for (const c of CITIES) {
    assert.ok(cityCoords(c.id), `${c.id} has no centroid`);
    assert.notEqual(c.state, "India", c.id);
    assert.equal(c.labelUpper, c.label.toUpperCase(), c.id);
  }
  // IP detection only answers with a curated city (CITY_COORDS, aliases,
  // labels), which is what keeps every proxy rewrite inside the pick
  // screen's static variants (app/c/pick/[city]: curated ids plus none).
  for (const id of Object.values(CITY_ALIASES)) assert.ok(isKnownCity(id), `alias to ${id}`);
  for (let lat = 8; lat <= 32; lat += 0.5) {
    for (let lng = 70; lng <= 92; lng += 0.5) {
      const id = nearestCity(lat, lng);
      if (id) assert.ok(isKnownCity(id), `${lat},${lng} -> ${id}`);
      assert.ok(isKnownCity(nearestCityAny(lat, lng).id));
    }
  }
});

test("nearest city: the south of Kerala is Thiruvananthapuram, not Kochi", () => {
  assert.equal(nearestCity(8.556, 76.88), "thiruvananthapuram"); // Technopark
  assert.equal(nearestCity(8.4, 77.1), "thiruvananthapuram"); // Neyyattinkara side
  assert.equal(nearestCity(9.97, 76.29), "kochi");
  assert.equal(nearestCity(31.62, 74.88), "amritsar");
  // Cities the data team added on the evening of 26 Oct.
  assert.equal(nearestCity(22.45, 70.07), "jamnagar");
  assert.equal(nearestCity(11.94, 79.80), "puducherry");
  assert.equal(nearestCity(8.70, 77.74), "tirunelveli");
  assert.equal(nearestCity(20.45, 85.82), "cuttack"); // not Bhubaneswar, 25 km away
  assert.equal(nearestCity(22.54, 72.94), "anand");
  // Far from everything (Imphal): null, and the closest is still named.
  assert.equal(nearestCity(24.82, 93.94), null);
  assert.equal(nearestCityAny(24.82, 93.94).id, "guwahati");
});

test("cityInText: whole words only, old names too", () => {
  assert.equal(cityInText("box cricket in Pondicherry"), "puducherry");
  assert.equal(cityInText("turf in jullundur"), "jalandhar");
  // Anand is also a name and an area: free text never reads it as the city.
  assert.equal(cityInText("turf near Anand Vihar"), null);
  assert.equal(cityInText("box cricket anand nagar pune"), "pune");
  assert.equal(guessCityFromAddress("Anand Nagar, Jamnagar, Gujarat"), "jamnagar");
  assert.equal(guessCityFromAddress("Near Anand Vihar ISBT"), null);
  assert.equal(cityInText("football goal post"), null);
  assert.equal(cityInText("kotak bank turf"), null);
  assert.equal(cityInText("agrasen ground"), null);
  assert.equal(cityInText("box cricket in Trivandrum tonight"), "thiruvananthapuram");
  assert.equal(cityInText("turfs in vizag"), "visakhapatnam");
  assert.equal(cityInText("Box cricket Goa"), "goa");
  assert.equal(cityInText("navi mumbai turf"), "mumbai");
  // Two places named: the biggest city.
  assert.equal(cityInText("pune or mumbai"), "pune");
  assert.equal(cityInText("box cricket nanded city pune"), "pune", "a locality named after a smaller town");
});

test("cityInText: a city in a road's name loses to the city named with it", () => {
  // Areas in the turfs table, each with its own city named too.
  assert.equal(cityInText("box cricket on ajmer road jaipur"), "jaipur");
  assert.equal(cityInText("turf near mysore road bangalore"), "bangalore");
  assert.equal(cityInText("Kengeri (Mysore Road), Bangalore"), "bangalore");
  assert.equal(cityInText("football old madras road bangalore"), "bangalore");
  assert.equal(cityInText("box cricket jalna road sambhajinagar"), "sambhajinagar");
  assert.equal(cityInText("box cricket beed bypass sambhajinagar"), "sambhajinagar");
  assert.equal(cityInText("turf agra bombay road indore"), "indore", "a chain of names before the road word");
  assert.equal(cityInText("Daregaon / Agra–Mumbai Road, Malegaon"), "malegaon", "an en dash between the names");
  assert.equal(cityInText("box cricket kanpur road lucknow"), "lucknow");
  assert.equal(cityInText("trichy road coimbatore turf"), "coimbatore");
  assert.equal(cityInText("Mumbai Naka nashik"), "nashik");
  assert.equal(cityInText("mumbai-pune expressway turf in pune"), "pune");
  // A road name alone still names its city.
  assert.equal(cityInText("turf in nashik road"), "nashik");
  assert.equal(cityInText("box cricket on mysore rd"), "mysuru");
  // A road word further on is not "directly after".
  assert.equal(cityInText("agra turf near station road"), "agra");
});

test("guessCityFromAddress: aliases, and Telangana is a last resort", () => {
  assert.equal(guessCityFromAddress("Mulugu Rd, Hanamkonda, Telangana 506001"), "warangal");
  assert.equal(guessCityFromAddress("DC Office Road, Davangere, Karnataka"), "davanagere");
  assert.equal(guessCityFromAddress("Beach Road, Calicut, Kerala"), "kozhikode");
  assert.equal(guessCityFromAddress("Delhi Road, Meerut, Uttar Pradesh"), "meerut");
  assert.equal(guessCityFromAddress("Gachibowli, Telangana 500032"), "hyderabad");
  assert.equal(guessCityFromAddress("Trichy Road, Coimbatore"), "coimbatore");
  assert.equal(guessCityFromAddress("Kazhakkoottam, Thiruvananthapuram, Kerala"), "thiruvananthapuram");
  assert.equal(guessCityFromAddress("Somewhere"), null);
});

test("static city copy never states a count; structured data has no fake region", () => {
  assert.equal(/\d/.test(CITY_LIST), false, CITY_LIST);
  assert.equal(/\d/.test(CITY_LIST_AND), false, CITY_LIST_AND);
  assert.equal(CITY_LIST_AND, "Hyderabad, Bangalore, Pune, Mumbai, Delhi and more cities");
  assert.equal(stateFor("thiruvananthapuram"), "Kerala");
  assert.equal(stateFor("testpur"), undefined);
});

test("byDistanceFrom orders by km and keeps unknowns last", () => {
  const rows = [{ id: "nashik" }, { id: "mystery" }, { id: "mumbai" }, { id: "hyderabad" }];
  const out = byDistanceFrom("pune", rows);
  assert.deepEqual(out.map((r) => r.id), ["mumbai", "nashik", "hyderabad", "mystery"]);
  assert.equal(out[3].km, null);
  assert.equal(kmBetween("pune", "mumbai"), out[0].km);
});

// ── Live centroids (city_turf_counts lat, lng) for cities not curated ──

// Production medians on 28 Oct (none of these is in CITY_COORDS).
const LIVE = [
  { id: "malappuram", n: 44, lat: 11.0918, lng: 76.029 },
  { id: "kottayam", n: 24, lat: 9.599, lng: 76.5592 },
  { id: "jammu", n: 17, lat: 32.7098, lng: 74.8924 },
  { id: "wayanad", n: 12, lat: 11.6594, lng: 76.1 },
  { id: "sindhudurg", n: 3, lat: 16.0196, lng: 73.6728 },
];
const LIVE_POINTS = cityPointsOf(LIVE);

test("cityPointsOf keeps real coordinates only", () => {
  const pts = cityPointsOf([
    ...LIVE,
    { id: "nullish", lat: null, lng: null },
    { id: "half", lat: 12, lng: null },
    { id: "missing" },
    { id: "nan", lat: Number.NaN, lng: 75 },
    { id: "wild", lat: 120, lng: 75 },
  ]);
  assert.deepEqual([...pts.keys()], LIVE.map((c) => c.id));
  assert.deepEqual(pts.get("jammu"), { lat: 32.7098, lng: 74.8924 });
});

test("cityPoint: curated centroid first, else the live one, else null", () => {
  for (const c of CITIES) assert.deepEqual(cityPoint(c.id), cityCoords(c.id), c.id);
  assert.deepEqual(cityPoint("malappuram", LIVE_POINTS), { lat: 11.0918, lng: 76.029 });
  assert.equal(cityPoint("malappuram"), null, "no live points passed");
  assert.equal(cityPoint("mystery", LIVE_POINTS), null);
  // A live median never moves a curated city (Pune's turfs' median is 5 km off its centre).
  const odd = cityPointsOf([{ id: "pune", lat: 18.554, lng: 73.819 }, { id: "mumbai", lat: 28.6, lng: 77.2 }]);
  assert.deepEqual(cityPoint("pune", odd), cityCoords("pune"));
  assert.equal(kmBetween("pune", "mumbai", odd), kmBetween("pune", "mumbai"));
  // Not an inherited key either: "constructor" is slug-shaped.
  assert.equal(cityPoint("constructor"), null);
  assert.equal(kmBetween("malappuram", "kozhikode", LIVE_POINTS), 33);
  assert.equal(kmBetween("malappuram", "kozhikode"), null);
});

test("byDistanceFrom: a chosen city that is not curated sorts by its turfs' median", () => {
  const rows = [{ id: "mumbai" }, { id: "bangalore" }, { id: "delhi" }, { id: "kochi" }, { id: "kozhikode" }];
  const out = byDistanceFrom("malappuram", rows, LIVE_POINTS);
  assert.deepEqual(out.map((r) => r.id), ["kozhikode", "kochi", "bangalore", "mumbai", "delhi"]);
  assert.deepEqual(out.map((r) => r.km), [33, 132, 270, 950, 1952]);
  // Before the migration (no points): nothing to sort by, incoming order kept.
  const before = byDistanceFrom("malappuram", rows);
  assert.deepEqual(before.map((r) => r.id), rows.map((r) => r.id));
  assert.ok(before.every((r) => r.km === null));
});

test("byDistanceFrom: rows that are not curated take their place by distance", () => {
  const rows = [{ id: "delhi" }, { id: "jammu" }, { id: "sindhudurg" }, { id: "nashik" }, { id: "mumbai" }];
  const out = byDistanceFrom("pune", rows, LIVE_POINTS);
  assert.deepEqual(out.map((r) => r.id), ["mumbai", "nashik", "sindhudurg", "delhi", "jammu"]);
  assert.equal(out[2].km, 279);
  // Without the points they had no place and went last, as before 28 Oct.
  assert.deepEqual(byDistanceFrom("pune", rows).map((r) => r.id), ["mumbai", "nashik", "delhi", "jammu", "sindhudurg"]);
});

test("byDistanceFrom: mixed rows, and rows with no point last in their incoming order", () => {
  const rows = [{ id: "zeta" }, { id: "jammu" }, { id: "alpha" }, { id: "kochi" }, { id: "wayanad" }, { id: "mid" }, { id: "kottayam" }];
  const out = byDistanceFrom("kozhikode", rows, LIVE_POINTS);
  assert.deepEqual(out.map((r) => r.id), ["wayanad", "kochi", "kottayam", "jammu", "zeta", "alpha", "mid"]);
  assert.deepEqual(out.slice(4).map((r) => r.km), [null, null, null]);
  // Rows keep their own fields.
  const withN = byDistanceFrom("kozhikode", LIVE, LIVE_POINTS);
  assert.equal(withN[0].id, "malappuram");
  assert.equal(withN[0].n, 44);
  // Equal km keep the incoming order.
  const twins = cityPointsOf([{ id: "a-town", lat: 12, lng: 76 }, { id: "b-town", lat: 12, lng: 76 }]);
  assert.deepEqual(byDistanceFrom("kozhikode", [{ id: "b-town" }, { id: "a-town" }], twins).map((r) => r.id), ["b-town", "a-town"]);
});

test("pickOtherCities: the twelve nearest plus the home cities, nearest first", () => {
  // Biggest first, as getLiveCities hands them over.
  const live = [
    ...CITIES.slice(0, 40).map((c, i) => ({ ...c, n: 400 - i, lat: null, lng: null })),
    ...LIVE.map((c) => ({ ...cityInfo(c.id), ...c })),
  ];
  const pts = cityPointsOf(live);
  for (const current of ["kochi", "malappuram", "delhi", "nashik", "pune", "jammu"]) {
    const got = pickOtherCities(live, current, pts);
    const all = byDistanceFrom(current, live.filter((c) => c.id !== current), pts);
    const nearest = all.slice(0, 12).map((c) => c.id);
    const homes = HOME_CITIES.filter((h) => h !== current && live.some((c) => c.id === h) && !nearest.includes(h));
    assert.equal(got.length, 12 + homes.length, current);
    assert.ok(!got.some((c) => c.id === current), `${current} links itself`);
    for (const id of nearest) assert.ok(got.some((c) => c.id === id), `${current}: ${id} is among the nearest`);
    for (const h of HOME_CITIES) if (h !== current) assert.ok(got.some((c) => c.id === h), `${current}: home city ${h}`);
    const kms = got.map((c) => c.km);
    assert.ok(kms.every((k) => k != null), current);
    assert.deepEqual(kms, [...kms].sort((a, b) => a! - b!), `${current}: nearest first`);
  }
  // Kochi: its neighbours first (Kottayam and Malappuram are not curated),
  // then Coimbatore; the home cities, far off, at the end.
  const kochi = pickOtherCities(live, "kochi", pts).map((c) => c.id);
  assert.deepEqual(kochi.slice(0, 3), ["kottayam", "malappuram", "coimbatore"]);
  assert.deepEqual(kochi.slice(-2), ["nashik", "nagpur"]);
  // No extra link, and no second one, for a home city already in the twelve.
  const nashik = pickOtherCities(live, "nashik", pts, 30);
  assert.equal(nashik.length, 30);
  assert.equal(new Set(nashik.map((c) => c.id)).size, 30);
  assert.ok(nashik.some((c) => c.id === "nagpur"));
});

test("pickOtherCities: no home city that does not qualify, and no point keeps the biggest", () => {
  // A sport's list without the home cities (too few turfs): exactly twelve.
  const sport = CITIES.filter((c) => !HOME_CITIES.includes(c.id)).slice(0, 30).map((c, i) => ({ ...c, n: 100 - i }));
  assert.equal(pickOtherCities(sport, "pune").length, 12);
  // The page's city need not be in the list (its own sport page is thin).
  assert.ok(!sport.some((c) => c.id === "ratnagiri"));
  const fromRatnagiri = pickOtherCities(sport, "ratnagiri");
  assert.equal(fromRatnagiri.length, 12);
  assert.equal(fromRatnagiri[0].km! <= fromRatnagiri[11].km!, true);
  // A city with no point at all (not curated, no live centroid): the
  // twelve biggest plus the home cities, in the incoming order, as before.
  const live = CITIES.slice(0, 40).map((c, i) => ({ ...c, n: 400 - i }));
  const got = pickOtherCities(live, "mystery");
  assert.deepEqual(got.map((c) => c.id), [...CITIES.slice(0, 12).map((c) => c.id), ...HOME_CITIES.filter((h) => !CITIES.slice(0, 12).some((c) => c.id === h))]);
  assert.ok(got.every((c) => c.km === null));
});

test("detection is unchanged: live centroids never make a city detectable", () => {
  // At Malappuram's turfs' median, GPS and IP still answer with a curated city.
  const at = LIVE_POINTS.get("malappuram")!;
  assert.equal(nearestCity(at.lat, at.lng), "kozhikode");
  assert.equal(nearestCityAny(at.lat, at.lng).id, "kozhikode");
  const j = LIVE_POINTS.get("jammu")!;
  assert.ok(isKnownCity(nearestCityAny(j.lat, j.lng).id));
  for (const c of LIVE) assert.equal(isKnownCity(c.id), false, c.id);
  // And the curated centroid is what a curated city is measured from.
  assert.equal(Math.round(distanceKm(cityCoords("pune")!, cityCoords("mumbai")!)), kmBetween("pune", "mumbai", LIVE_POINTS));
});

// ── Pre-paint script in a sandbox ─────────────────────────────

function runPrePaint(o: {
  cookie?: string;
  legacy?: string;
  migrated?: boolean;
  path?: string;
  search?: string;
  blockCookies?: boolean;
  askSeen?: boolean;
  storageThrows?: boolean;
}) {
  let jar = o.cookie ? `tt_city=${o.cookie}` : "";
  const attrs: Record<string, string> = {};
  const style: Record<string, string> = {};
  const store = new Map<string, string>();
  if (o.legacy) store.set("tapturf_city_v1", o.legacy);
  if (o.migrated) store.set("tapturf_city_mig_v2", "1");
  store.set("tapturf_city_autodetect_v1", "1");
  let reloads = 0;
  const document = {
    get cookie() {
      return jar;
    },
    set cookie(v: string) {
      if (o.blockCookies) return;
      const [pair] = v.split(";");
      const [k, val] = pair.split("=");
      if (k === "tt_city") jar = `tt_city=${val}`;
    },
    documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v), style },
  };
  const localStorage = {
    getItem: (k: string) => {
      if (o.storageThrows) throw new Error("SecurityError");
      return store.get(k) ?? null;
    },
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  };
  const location = {
    pathname: o.path ?? "/",
    search: o.search ?? "",
    protocol: "https:",
    reload: () => reloads++,
  };
  const session = new Map<string, string>(o.askSeen ? [["tt_ask_seen", "1"]] : []);
  const sessionStorage = { getItem: (k: string) => session.get(k) ?? null };
  const window = { localStorage, sessionStorage };
  vm.runInNewContext(CITY_PREPAINT_JS, { document, window, location });
  return { jar, attrs, style, store, reloads };
}

test("pre-paint mirrors the cookie onto <html>", () => {
  const g = runPrePaint({ cookie: "geo.pune" });
  assert.deepEqual(g.attrs, { "data-city-state": "city", "data-city": "pune", "data-city-src": "geo" });
  assert.equal(runPrePaint({ cookie: "unknown" }).attrs["data-city-state"], "unknown");
  assert.equal(runPrePaint({ cookie: "all" }).attrs["data-city-state"], "all");
  assert.deepEqual(runPrePaint({}).attrs, { "data-city-state": "none" });
  assert.equal(runPrePaint({ cookie: "mumbai" }).attrs["data-city-src"], "pick");
  // Any city slug, curated or not; a reserved word is no city.
  assert.equal(runPrePaint({ cookie: "testpur" }).attrs["data-city"], "testpur");
  assert.deepEqual(runPrePaint({ cookie: "pick" }).attrs, { "data-city-state": "none" });
  assert.deepEqual(runPrePaint({ cookie: "turfs" }).attrs, { "data-city-state": "none" });
});

test("pre-paint migrates a legacy pick and reloads once on a personalised page", () => {
  const r = runPrePaint({ cookie: "geo.pune", legacy: "nashik", path: "/" });
  assert.equal(r.jar, "tt_city=nashik");
  assert.equal(r.style.visibility, "hidden");
  assert.equal(r.reloads, 1);
  assert.equal(r.store.get("tapturf_city_mig_v2"), "1");
  assert.equal(r.store.has("tapturf_city_autodetect_v1"), false);
  // Second load after the reload: flag set, nothing happens again.
  const again = runPrePaint({ cookie: "nashik", legacy: "nashik", migrated: true, path: "/" });
  assert.equal(again.reloads, 0);
  assert.equal(again.attrs["data-city"], "nashik");
});

test("pre-paint migrates without reloading off the personalised pages", () => {
  const r = runPrePaint({ cookie: "geo.pune", legacy: "nashik", path: "/turf/x" });
  assert.equal(r.jar, "tt_city=nashik");
  assert.equal(r.reloads, 0);
  assert.equal(r.attrs["data-city"], "nashik");
  const q = runPrePaint({ cookie: "unknown", legacy: "nashik", path: "/turfs", search: "?q=box" });
  assert.equal(q.reloads, 0);
  assert.equal(q.jar, "tt_city=nashik");
});

test("pre-paint does nothing once migrated, and never overrides all or a pick", () => {
  const done = runPrePaint({ cookie: "geo.pune", legacy: "nashik", migrated: true });
  assert.equal(done.jar, "tt_city=geo.pune");
  assert.equal(done.reloads, 0);
  const all = runPrePaint({ cookie: "all", legacy: "pune" });
  assert.equal(all.jar, "tt_city=all");
  assert.equal(all.reloads, 0);
  // A legacy pick that matches the IP guess: pre-paint itself does not
  // reload; the pick screen's guard does (next tests).
  const same = runPrePaint({ cookie: "geo.pune", legacy: "pune", path: "/" });
  assert.equal(same.reloads, 0);
  assert.equal(same.jar, "tt_city=pune");
});

test("pre-paint never reloads when cookies are blocked", () => {
  const r = runPrePaint({ legacy: "nashik", blockCookies: true, path: "/" });
  assert.equal(r.reloads, 0);
  assert.equal(r.attrs["data-city-state"], "none");
});

test("pre-paint no longer marks the retired first-visit ask", () => {
  assert.equal(runPrePaint({ cookie: "unknown", askSeen: true }).attrs["data-city-ask"], undefined);
  assert.equal(runPrePaint({ cookie: "pune", askSeen: true }).attrs["data-city-ask"], undefined);
});

test("pre-paint still sets the attributes when storage throws", () => {
  const r = runPrePaint({ cookie: "geo.pune", storageThrows: true });
  assert.deepEqual(r.attrs, { "data-city-state": "city", "data-city": "pune", "data-city-src": "geo" });
  assert.equal(runPrePaint({ cookie: "unknown", storageThrows: true }).attrs["data-city-state"], "unknown");
});

// ── Pick screen guard (app/c/pick/[city]/layout.tsx) in a sandbox ──────

function runPickGuard(o: {
  cookie?: string;
  path?: string;
  search?: string;
  left?: string;
  hidden?: boolean;
  storageThrows?: boolean;
}) {
  const style: Record<string, string> = o.hidden ? { visibility: "hidden" } : {};
  const session = new Map<string, string>(o.left ? [["tt_pick_left", o.left]] : []);
  let reloads = 0;
  const sessionStorage = {
    getItem: (k: string) => {
      if (o.storageThrows) throw new Error("SecurityError");
      return session.get(k) ?? null;
    },
    setItem: (k: string, v: string) => session.set(k, v),
  };
  const document = { cookie: o.cookie ? `_ga=1; tt_city=${o.cookie}` : "_ga=1", documentElement: { style } };
  const location = { pathname: o.path ?? "/", search: o.search ?? "", reload: () => reloads++ };
  vm.runInNewContext(PICK_GUARD_JS, { document, window: { sessionStorage }, location });
  return { reloads, style, session };
}

test("pick guard: a confirmed pick in the cookie hides the pick screen and reloads once", () => {
  const r = runPickGuard({ cookie: "pune", path: "/games" });
  assert.equal(r.reloads, 1);
  assert.equal(r.style.visibility, "hidden");
  assert.equal(r.session.get("tt_pick_left"), "pune|/games");
  // Served the pick screen again (the server cannot see the cookie): no loop.
  const again = runPickGuard({ cookie: "pune", path: "/games", left: "pune|/games" });
  assert.equal(again.reloads, 0);
  assert.equal(again.style.visibility, undefined);
  // Another URL or another pick is its own once.
  assert.equal(runPickGuard({ cookie: "pune", path: "/turfs", left: "pune|/games" }).reloads, 1);
  assert.equal(runPickGuard({ cookie: "nashik", path: "/games", left: "pune|/games" }).reloads, 1);
});

test("pick guard: an IP guess, unknown, the old all, no cookie or no storage stay on the pick screen", () => {
  // A pick of a city not curated yet is a pick, like parseCityCookie says.
  assert.equal(runPickGuard({ cookie: "testpur", path: "/" }).reloads, 1);
  for (const cookie of ["geo.pune", "unknown", "all", "pick", "none", "Pune", undefined]) {
    const r = runPickGuard({ cookie });
    assert.equal(r.reloads, 0, String(cookie));
    assert.equal(r.style.visibility, undefined, String(cookie));
  }
  assert.equal(runPickGuard({ cookie: "pune", storageThrows: true }).reloads, 0);
  // The pre-paint script is already reloading (it hid <html>): no second reload.
  assert.equal(runPickGuard({ cookie: "nashik", hidden: true }).reloads, 0);
});

test("a legacy pick that matches the IP guess reloads before the pick screen paints", () => {
  // First visit of a legacy Pune user from a Pune IP: the proxy set geo.pune
  // and served the pick screen; pre-paint moves the pick into the cookie...
  const pre = runPrePaint({ cookie: "geo.pune", legacy: "pune", path: "/" });
  assert.equal(pre.jar, "tt_city=pune");
  assert.equal(pre.reloads, 0);
  // ...and the pick screen's guard reloads, so the proxy serves Pune's page.
  const guard = runPickGuard({ cookie: "pune", path: "/" });
  assert.equal(guard.reloads, 1);
  assert.equal(guard.style.visibility, "hidden");
});

test("old /sport/<label> URLs 308 to their sport page, for crawlers and people", () => {
  // Turf pages linked /sport/<label> until 30 Sep; Google still has these.
  const cases: [string, string][] = [
    ["/sport/cricket%20nets", "/sport/cricket-nets"],
    ["/sport/box%20cricket", "/sport/box-cricket"],
    ["/sport/table%20tennis", "/sport/table-tennis"],
    ["/sport/ultimate%20frisbee", "/sport/ultimate-frisbee"],
    ["/sport/lawn%20tennis", "/sport/tennis"],
    ["/sport/indoor%20cricket%20net", "/sport/cricket-nets"],
    ["/sport/bowling%20machine", "/sport/cricket-nets"],
    ["/sport/Football", "/sport/football"],
    ["/sport/Box-Cricket", "/sport/box-cricket"],
  ];
  for (const [path, location] of cases) {
    for (const ua of [GOOGLEBOT, CHROME]) {
      assert.deepEqual(decide(req({ path, ua, headers: PUNE })), { action: "redirect", location }, `${ua} ${path}`);
    }
  }
  assert.deepEqual(decide(req({ path: "/sport/box%20cricket?utm_source=x" })), { action: "redirect", location: "/sport/box-cricket?utm_source=x" });
});

test("real sport slugs, sports with no page and other paths never redirect", () => {
  const paths = ["/sport/cricket-nets", "/sport/football", "/sport/futsal", "/sport/squash", "/sport/%E0%A4", "/sport/box%20cricket/pune", "/pune/box%20cricket", "/sport"];
  for (const path of paths) {
    assert.notEqual(decide(req({ path, ua: GOOGLEBOT })).action, "redirect", path);
  }
  assert.equal(decide(req({ path: "/sport/box%20cricket", method: "POST" })).action, "next");
});
