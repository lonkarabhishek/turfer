// Run with: npm run test:city (compiles to .test-out and runs node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { decide, isCrawler, detectCityFromHeaders, publicPathFromInternal, type ProxyInput } from "./cityRouting";
import {
  parseCityCookie,
  serializeCityChoice,
  scopeOf,
  resolveCityScope,
  matchCities,
  byDistanceFrom,
  kmBetween,
  CITIES,
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
    const d = decide(req({ ua, headers: PUNE }));
    assert.equal(d.action, "next", ua);
    assert.equal(d.action === "next" && d.setCookie, undefined, ua);
    assert.equal(d.action === "next" && d.debug, "default", ua);
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

test("a valid cookie is honoured even for a bot UA", () => {
  const d = decide(req({ ua: GOOGLEBOT, cookie: "mumbai", headers: PUNE }));
  assert.deepEqual(d, { action: "rewrite", pathname: "/c/mumbai", setCookie: undefined, debug: "mumbai" });
});

test("Pune coordinates on a document rewrite and set geo.pune", () => {
  for (const [path, target] of [["/", "/c/pune"], ["/turfs", "/c/pune/turfs"], ["/games", "/c/pune/games"]]) {
    const d = decide(req({ path, headers: PUNE }));
    assert.deepEqual(d, { action: "rewrite", pathname: target, setCookie: "geo.pune", debug: "pune" });
  }
});

test("the same request as RSC rewrites without a cookie", () => {
  const d = decide(req({ headers: { ...PUNE, "sec-fetch-dest": "", accept: "*/*" } }));
  assert.deepEqual(d, { action: "rewrite", pathname: "/c/pune", setCookie: undefined, debug: "pune" });
  const e = decide(req({ headers: { ...PUNE, "sec-fetch-dest": "empty", accept: "*/*" } }));
  assert.equal(e.action === "rewrite" && e.setCookie, undefined);
});

test("outside India is unknown", () => {
  const d = decide(req({ headers: { "x-vercel-ip-country": "US", "x-vercel-ip-latitude": "37.77", "x-vercel-ip-longitude": "-122.41" } }));
  assert.deepEqual(d, { action: "rewrite", pathname: "/c/ask", setCookie: "unknown", debug: "ask" });
  const london = decide(req({ headers: { "x-vercel-ip-latitude": "51.5", "x-vercel-ip-longitude": "-0.12" } }));
  assert.deepEqual(london, { action: "rewrite", pathname: "/c/ask", setCookie: "unknown", debug: "ask" });
});

test("a malformed city header with no coords does not throw", () => {
  const d = decide(req({ headers: { "x-vercel-ip-country": "IN", "x-vercel-ip-city": "%E0%A4" } }));
  assert.deepEqual(d, { action: "rewrite", pathname: "/c/ask", setCookie: "unknown", debug: "ask" });
});

test("Aurangabad, Bihar coordinates never map to Sambhajinagar", () => {
  const get = (h: Record<string, string>) => (n: string) => h[n] ?? null;
  assert.equal(
    detectCityFromHeaders(get({ "x-vercel-ip-country": "IN", "x-vercel-ip-latitude": "24.75", "x-vercel-ip-longitude": "84.37", "x-vercel-ip-city": "Aurangabad" })),
    null,
  );
  const d = decide(req({ headers: { "x-vercel-ip-country": "IN", "x-vercel-ip-latitude": "24.75", "x-vercel-ip-longitude": "84.37", "x-vercel-ip-city": "Aurangabad" } }));
  assert.equal(d.action === "rewrite" && d.setCookie, "unknown");
});

test("the city name header is a fallback when coordinates are absent", () => {
  const d = decide(req({ headers: { "x-vercel-ip-country": "IN", "x-vercel-ip-city": "Bengaluru" } }));
  assert.deepEqual(d, { action: "rewrite", pathname: "/c/bangalore", setCookie: "geo.bangalore", debug: "bangalore" });
  const n = decide(req({ headers: { "x-vercel-ip-city": "Navi%20Mumbai" } }));
  assert.equal(n.action === "rewrite" && n.setCookie, "geo.mumbai");
});

test("cookie all with Pune geo stays all of India", () => {
  assert.deepEqual(decide(req({ cookie: "all", headers: PUNE })), { action: "next", setCookie: undefined, debug: "default" });
});

test("cookie unknown upgrades on a document with geo", () => {
  assert.deepEqual(decide(req({ cookie: "unknown", headers: PUNE })), {
    action: "rewrite",
    pathname: "/c/pune",
    setCookie: "geo.pune",
    debug: "pune",
  });
  // Still unknown: the ask twin, and no Set-Cookie when the value would not change.
  assert.deepEqual(decide(req({ cookie: "unknown" })), { action: "rewrite", pathname: "/c/ask", setCookie: undefined, debug: "ask" });
});

test("a bogus cookie is treated as missing", () => {
  assert.deepEqual(decide(req({ cookie: "bogus" })), { action: "rewrite", pathname: "/c/ask", setCookie: "unknown", debug: "ask" });
  assert.deepEqual(decide(req({ cookie: "geo.atlantis", headers: PUNE })).action, "rewrite");
});

test("/turfs?q= is never rewritten", () => {
  assert.deepEqual(decide(req({ path: "/turfs?q=box", cookie: "pune" })), { action: "next", setCookie: undefined, debug: "pune" });
  assert.equal(decide(req({ path: "/turfs?q=", cookie: "pune" })).action, "rewrite");
});

test("internal /c paths redirect to their public URL", () => {
  assert.deepEqual(decide(req({ path: "/c/pune/turfs?q=x" })), { action: "redirect", location: "/turfs?q=x" });
  assert.deepEqual(decide(req({ path: "/c" })), { action: "redirect", location: "/" });
  assert.deepEqual(decide(req({ path: "/c/pune" })), { action: "redirect", location: "/" });
  assert.deepEqual(decide(req({ path: "/c/zz/turfs", method: "POST" })), { action: "redirect", location: "/turfs" });
  assert.deepEqual(decide(req({ path: "/c/pune", headers: { "x-prerender-revalidate": "abc" } })), { action: "next", debug: "internal" });
  assert.equal(publicPathFromInternal("/c/pune/games"), "/games");
});

test("unknown humans get the ask twin of /, /turfs and /games only", () => {
  for (const [path, target] of [["/", "/c/ask"], ["/turfs", "/c/ask/turfs"], ["/games", "/c/ask/games"]]) {
    assert.deepEqual(decide(req({ path })), { action: "rewrite", pathname: target, setCookie: "unknown", debug: "ask" });
  }
  // Search, other pages, crawlers and "all" never get the ask.
  assert.deepEqual(decide(req({ path: "/turfs?q=box", cookie: "unknown" })), { action: "next", setCookie: undefined, debug: "default" });
  assert.deepEqual(decide(req({ path: "/turf/abc" })), { action: "next", setCookie: "unknown", debug: "default" });
  assert.deepEqual(decide(req({ ua: GOOGLEBOT })), { action: "next", setCookie: undefined, debug: "default" });
  assert.deepEqual(decide(req({ cookie: "all" })), { action: "next", setCookie: undefined, debug: "default" });
  // Internal ask paths are redirected like any other /c path.
  assert.deepEqual(decide(req({ path: "/c/ask/games" })), { action: "redirect", location: "/games" });
});

test("POST passes through", () => {
  assert.deepEqual(decide(req({ method: "POST", headers: PUNE })), { action: "next", debug: "method" });
});

test("other pages pass through but still get the cookie on documents", () => {
  assert.deepEqual(decide(req({ path: "/turf/abc", headers: PUNE })), { action: "next", setCookie: "geo.pune", debug: "pune" });
  assert.deepEqual(decide(req({ path: "/turf/abc", cookie: "geo.pune", headers: PUNE })), { action: "next", setCookie: undefined, debug: "pune" });
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
});

test("byDistanceFrom orders by km and keeps unknowns last", () => {
  const rows = [{ id: "nashik" }, { id: "mystery" }, { id: "mumbai" }, { id: "hyderabad" }];
  const out = byDistanceFrom("pune", rows);
  assert.deepEqual(out.map((r) => r.id), ["mumbai", "nashik", "hyderabad", "mystery"]);
  assert.equal(out[3].km, null);
  assert.equal(kmBetween("pune", "mumbai"), out[0].km);
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
  const same = runPrePaint({ cookie: "geo.pune", legacy: "pune", path: "/" });
  assert.equal(same.reloads, 0, "no reload when the served city already matches");
  assert.equal(same.jar, "tt_city=pune");
});

test("pre-paint never reloads when cookies are blocked", () => {
  const r = runPrePaint({ legacy: "nashik", blockCookies: true, path: "/" });
  assert.equal(r.reloads, 0);
  assert.equal(r.attrs["data-city-state"], "none");
});

test("pre-paint folds the ask once it was shown this session", () => {
  assert.equal(runPrePaint({ cookie: "unknown" }).attrs["data-city-ask"], undefined);
  assert.equal(runPrePaint({ cookie: "unknown", askSeen: true }).attrs["data-city-ask"], "seen");
  assert.equal(runPrePaint({ cookie: "pune", askSeen: true }).attrs["data-city-ask"], undefined);
});

test("pre-paint still sets the attributes when storage throws", () => {
  const r = runPrePaint({ cookie: "geo.pune", storageThrows: true });
  assert.deepEqual(r.attrs, { "data-city-state": "city", "data-city": "pune", "data-city-src": "geo" });
  assert.equal(runPrePaint({ cookie: "unknown", storageThrows: true }).attrs["data-city-state"], "unknown");
});
