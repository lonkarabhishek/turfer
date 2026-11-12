// Run with: npm run test:city (compiles to .test-out and runs node --test)
//
// proxy.ts's matcher, walked with Next's own matching (the code `next
// start` runs: getMiddlewareMatchers compiles the config, and
// getMiddlewareRouteMatcher applies has/missing exactly as for a request),
// on the config as written in proxy.ts (Next reads it from the source, so
// this test does too). 10 Nov: crawler page loads skip the proxy, except
// the two old-link 308s; for every request that now skips it, decide()
// (and the /turf/<uuid> lookup) would have done nothing, so crawlers get
// exactly what they got before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decide, isCrawler } from "./cityRouting";
import { turfIdTarget } from "./turfIds";

type Matcher = { regexp: string; has?: unknown[]; missing?: unknown[]; originalSource: string };
type Req = { headers: Record<string, string> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getMiddlewareMatchers } = require("next/dist/build/analysis/get-page-static-info") as {
  getMiddlewareMatchers: (m: unknown, cfg: Record<string, unknown>) => Matcher[];
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getMiddlewareRouteMatcher } = require("next/dist/shared/lib/router/utils/middleware-route-matcher") as {
  getMiddlewareRouteMatcher: (m: Matcher[]) => (pathname: string, req: Req, query: Record<string, string>) => boolean;
};

/** proxy.ts's `config` object literal, evaluated (it is plain data). */
function proxyConfig(): { matcher: unknown[] } {
  const src = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
  const start = src.indexOf("export const config = {");
  assert.ok(start >= 0, "proxy.ts exports config");
  const from = src.indexOf("{", start);
  const end = src.indexOf("\n};", from);
  assert.ok(end > from, "config ends with };");
  return new Function(`return (${src.slice(from, end + 2)});`)() as { matcher: unknown[] };
}

const runs = getMiddlewareRouteMatcher(getMiddlewareMatchers(proxyConfig().matcher, {}));
const proxyRuns = (pathname: string, headers: Record<string, string>) => runs(pathname, { headers: lower(headers) }, {});
const lower = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));

const UUID = "0a1b2c3d-1111-4222-8333-444455556666";
const DOC = { accept: "text/html,application/xhtml+xml", "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" };
const CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const BROWSER = { ...DOC, "user-agent": CHROME, "accept-language": "en-IN,en;q=0.9" };
const CRAWLERS: Record<string, Record<string, string>> = {
  googlebot: { accept: "text/html", "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
  "googlebot smartphone": {
    accept: "text/html",
    "user-agent": "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  },
  "bingbot with accept-language": { accept: "text/html", "accept-language": "en-US", "user-agent": "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)" },
  "baiduspider with accept-language": { accept: "text/html", "accept-language": "zh-CN", "user-agent": "Mozilla/5.0 (compatible; Baiduspider/2.0)" },
  "facebook unfurl, no accept-language": { accept: "*/*", "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" },
  "lighthouse with accept-language": { ...DOC, "accept-language": "en-US", "user-agent": `${CHROME} Chrome-Lighthouse` },
  "headless chrome with accept-language": { ...DOC, "accept-language": "en-US", "user-agent": "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/130.0.0.0 Safari/537.36" },
  "no user agent": { accept: "text/html" },
  "curl, no accept-language": { accept: "*/*", "user-agent": "curl/8.5.0" },
};
// Pages crawlers load that are not /, /turfs, /games or /c.
const PAGES = ["/turf/turf-up-hinjewadi", "/pune", "/pune/football", "/sport/football", "/turf-near-me", "/blog/what-is-dls-method-cricket", "/tools/cricket-toss", "/game/abc", "/u/someone"];

test("Googlebot and every other crawler: the old-link 308s still run the proxy", () => {
  for (const [who, h] of Object.entries(CRAWLERS)) {
    assert.equal(proxyRuns(`/turf/${UUID}`, h), true, `${who}: /turf/<uuid>`);
    assert.equal(proxyRuns(`/turf/${UUID.toUpperCase()}`, h), true, `${who}: /turf/<UUID>`);
    assert.equal(proxyRuns("/sport/cricket%20nets", h), true, `${who}: /sport/<label>`);
    assert.equal(proxyRuns("/sport/Box%20Cricket", h), true, `${who}: /sport/<Label>`);
  }
});

test("the old-link 308s: the proxy answers them for a crawler", () => {
  const ids = new Map([[UUID, "turf-up-hinjewadi"]]);
  assert.equal(turfIdTarget(`/turf/${UUID}`, ids), "/turf/turf-up-hinjewadi");
  const header = (h: Record<string, string>) => (n: string) => lower(h)[n.toLowerCase()] ?? null;
  for (const [who, h] of Object.entries(CRAWLERS)) {
    const d = decide({ method: "GET", pathname: "/sport/cricket%20nets", search: "?x=1", header: header(h), cookie: undefined });
    assert.deepEqual(d, { action: "redirect", location: "/sport/cricket-nets?x=1" }, who);
    const b = decide({ method: "GET", pathname: "/sport/Box%20Cricket", search: "", header: header(h), cookie: undefined });
    assert.deepEqual(b, { action: "redirect", location: "/sport/box-cricket" }, who);
  }
});

test("crawler page loads skip the proxy, and decide() would have done nothing for them", () => {
  const header = (h: Record<string, string>) => (n: string) => lower(h)[n.toLowerCase()] ?? null;
  for (const [who, h] of Object.entries(CRAWLERS)) {
    for (const path of PAGES.filter((p) => !p.startsWith("/sport/"))) {
      assert.equal(proxyRuns(path, h), false, `${who}: ${path} skips the proxy`);
      // What the proxy did for it before: no id link, and decide() a plain pass-through with no cookie.
      assert.equal(turfIdTarget(path, new Map([[UUID, "x"]])), null, path);
      for (const cookie of [undefined, "pune", "geo.pune", "unknown", "all"]) {
        const d = decide({ method: "GET", pathname: path, search: "", header: header(h), cookie });
        assert.equal(d.action, "next", `${who}: ${path} (${cookie}) passed through`);
        assert.equal("setCookie" in d ? d.setCookie : undefined, undefined, `${who}: ${path} (${cookie}) got no cookie`);
      }
    }
    // A sport page by its slug still runs the proxy (the old-label entry), which passes it through, cookie-free.
    assert.equal(proxyRuns("/sport/football", h), true, `${who}: /sport/football`);
    const d = decide({ method: "GET", pathname: "/sport/football", search: "", header: header(h), cookie: undefined });
    assert.equal(d.action, "next", who);
    assert.equal("setCookie" in d ? d.setCookie : undefined, undefined, who);
  }
});

test("every crawler the matcher lets through is still a crawler to decide()", () => {
  const header = (h: Record<string, string>) => (n: string) => lower(h)[n.toLowerCase()] ?? null;
  for (const [who, h] of Object.entries(CRAWLERS)) assert.equal(isCrawler(header(h)), true, who);
});

test("a browser with Accept-Language still runs the proxy where it did, and gets tt_city", () => {
  const header = (n: string) => lower(BROWSER)[n.toLowerCase()] ?? null;
  for (const path of [...PAGES, `/turf/${UUID}`, "/sport/cricket%20nets", "/", "/turfs", "/games"]) {
    assert.equal(proxyRuns(path, BROWSER), true, path);
  }
  // No cookie yet: the IP guess is stored on a document load (here with no IP city: unknown).
  const d = decide({ method: "GET", pathname: "/turf/turf-up-hinjewadi", search: "", header, cookie: undefined });
  assert.equal(d.action, "next");
  assert.equal("setCookie" in d ? d.setCookie : undefined, "unknown");
  const g = decide({ method: "GET", pathname: "/pune", search: "", header: (n) => ({ ...lower(BROWSER), "x-vercel-ip-country": "IN", "x-vercel-ip-city": "Pune", "x-vercel-ip-latitude": "18.52", "x-vercel-ip-longitude": "73.85" } as Record<string, string>)[n.toLowerCase()] ?? null, cookie: undefined });
  assert.equal("setCookie" in g ? g.setCookie : undefined, "geo.pune");
});

test("/, /turfs, /games and /c run the proxy for everyone, every request kind (unchanged)", () => {
  const rsc = { ...BROWSER, rsc: "1" };
  const prefetch = { ...BROWSER, rsc: "1", "next-router-prefetch": "1" };
  for (const path of ["/", "/turfs", "/games", "/c/pune", "/c/pune/turfs", "/c/pick/pune/games"]) {
    for (const [who, h] of Object.entries({ ...CRAWLERS, browser: BROWSER, rsc, prefetch })) assert.equal(proxyRuns(path, h), true, `${who}: ${path}`);
  }
});

test("RSC fetches and prefetches of other pages skip the proxy (unchanged), old links included", () => {
  for (const h of [{ ...BROWSER, rsc: "1" }, { ...BROWSER, "next-router-prefetch": "1" }]) {
    for (const path of [...PAGES, `/turf/${UUID}`, "/sport/cricket%20nets"]) assert.equal(proxyRuns(path, h), false, path);
  }
});

test("never: the API, admin, Next's files, files with an extension, robots, sitemap, manifest", () => {
  for (const h of [BROWSER, CRAWLERS.googlebot]) {
    for (const path of ["/api/revalidate", "/api", "/admin", "/admin/users", "/_next/static/chunks/a.js", "/logo.png", "/google2bcb6655f66f4b80.html", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/favicon.ico", "/images/x.jpg"]) {
      assert.equal(proxyRuns(path, h), false, path);
    }
  }
});

test("a browser without Accept-Language skips the catch-all (decide() already called it a crawler); the bot words are matched case by case", () => {
  const noLang = { ...DOC, "user-agent": CHROME };
  assert.equal(proxyRuns("/turf/turf-up-hinjewadi", noLang), false);
  assert.equal(proxyRuns("/turf/turf-up-hinjewadi", { ...BROWSER, "accept-language": "" }), false);
  // CUBOT phones write their maker in capitals: still a browser to the matcher, as to BOT_RE.
  const cubot = { ...BROWSER, "user-agent": "Mozilla/5.0 (Linux; Android 12; CUBOT KingKong 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36" };
  assert.equal(proxyRuns("/turf/turf-up-hinjewadi", cubot), true);
  // A user agent with "bot" in lower case (a phone named "Cubot") skips it on these pages, losing only its IP-guess cookie there...
  const lowerBot = { ...BROWSER, "user-agent": "Mozilla/5.0 (Linux; Android 12; Cubot Note 30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36" };
  assert.equal(proxyRuns("/turf/turf-up-hinjewadi", lowerBot), false);
  // ...but not on the pages it lands on most, nor on old links.
  assert.equal(proxyRuns("/", lowerBot), true);
  assert.equal(proxyRuns(`/turf/${UUID}`, lowerBot), true);
});

test("the bot pattern has no look-behind (Vercel's router runs it too) and is anchored by Next as ^...$", () => {
  const src = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
  const cfg = proxyConfig();
  const values = JSON.stringify(cfg.matcher);
  assert.doesNotMatch(values, /\(\?<[=!]/, "no look-behind in the matcher");
  assert.match(src, /key: "user-agent", value: "\.\*\(/, "the pattern starts with .* (Next anchors has/missing values)");
});
