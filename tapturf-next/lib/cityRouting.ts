/**
 * Pure routing rules for city personalisation, shared by proxy.ts,
 * /api/city, /api/geo and the tests. Relative imports only: the proxy
 * bundles this file, so it must never reach the network or Supabase.
 */
import {
  CITIES,
  CITY_ALIASES,
  CITY_COOKIE,
  PICK_LEFT_KEY,
  confirmedCity,
  nearestCity,
  parseCityCookie,
  serializeCityChoice,
  type CityChoice,
  type CityId,
} from "./city";
import { sportBySlug, sportPageForLabel } from "./sports";

/**
 * Public URLs that have a per-city ISR twin under app/c/[city] and a
 * pick-screen twin under app/c/pick/[city], and that twin's suffix.
 */
export const PERSONALISED: Record<string, string> = { "/": "", "/turfs": "/turfs", "/games": "/games" };

/**
 * The internal segment of the city-first pick screen (app/c/pick): a
 * tiny static "Where do you play?" page with no turf data. Every human
 * whose city is not confirmed gets it on /, /turfs and /games. Never a
 * city id.
 */
export const PICK_SEGMENT = "pick";

/** The pick screen's variant with no detected city: /c/pick/none. Never a city id. */
export const PICK_NONE = "none";

/**
 * Inline script at the top of the pick screen (app/c/pick/[city]/layout.tsx),
 * run while the HTML is parsed, before the screen paints. If the cookie
 * already holds a confirmed pick, the page served is stale: the pre-paint
 * script (lib/cityPrePaint.ts) has just moved a legacy pick into the
 * cookie, or a pick landed while the request was in flight. It hides the
 * page and reloads once, so the proxy serves the city's page instead of
 * the pick screen painting and leaving after hydration. Skipped when the
 * pre-paint script is already reloading (it hides <html> first). Once
 * per value and URL per session, under the same key CitySync uses, so a
 * cookie the server cannot see never loops. ES5, no other side effects.
 */
export const PICK_GUARD_JS = `(function(){try{
var d=document.documentElement;if(d.style.visibility==="hidden")return;
var m=document.cookie.match(/(?:^|;\\s*)${CITY_COOKIE}=([^;]*)/),v=m?m[1]:"";
if(!/^[a-z][a-z-]{1,30}$/.test(v)||v==="unknown"||v==="all")return;
var k=v+"|"+location.pathname+location.search,S=window.sessionStorage;
if(S.getItem("${PICK_LEFT_KEY}")===k)return;S.setItem("${PICK_LEFT_KEY}",k);
d.style.visibility="hidden";location.reload()}catch(e){}})();`;

/**
 * Crawlers, link unfurlers, audit tools and scripts. Generic "bot" covers
 * Googlebot (all), bingbot, AdsBot, Twitterbot, LinkedInBot, Slackbot,
 * Discordbot, Applebot, DuckDuckBot, YandexBot, PetalBot, GPTBot,
 * ClaudeBot, TelegramBot. "spider" covers Baiduspider. (?<!cu) keeps
 * CUBOT phones human. No bare "telegram" token.
 */
export const BOT_RE =
  /(?<!cu)bot|crawl|spider|slurp|preview|facebookexternalhit|meta-externalagent|whatsapp\/|google-inspectiontool|googleother|mediapartners-google|adsbot|feedfetcher|chatgpt-user|oai-searchbot|anthropic-ai|claude-web|claude-user|perplexity|bytespider|lighthouse|headlesschrome|curl\/|wget\/|python-requests|go-http-client|node-fetch|axios\//i;

type Get = (name: string) => string | null;

/** No UA, no Accept-Language (every real browser sends one) or a known bot UA. */
export function isCrawler(get: Get): boolean {
  const ua = (get("user-agent") ?? "").trim();
  if (!ua) return true;
  if (!get("accept-language")) return true;
  return BOT_RE.test(ua);
}

/** A top-level page load, not an RSC fetch, prefetch or asset. */
export function isDocument(get: Get): boolean {
  const dest = get("sec-fetch-dest");
  if (dest) return dest === "document";
  const mode = get("sec-fetch-mode");
  if (mode) return mode === "navigate";
  return (get("accept") ?? "").includes("text/html");
}

/**
 * The visitor's city from Vercel's IP headers. Outside India means no
 * city. Coordinates decide when present (nearest city within 200 km);
 * the city-name header is only a fallback when they are absent.
 */
export function detectCityFromHeaders(get: Get): CityId | null {
  const country = get("x-vercel-ip-country");
  if (country && country.toUpperCase() !== "IN") return null;
  const latRaw = get("x-vercel-ip-latitude");
  const lngRaw = get("x-vercel-ip-longitude");
  const lat = latRaw ? Number(latRaw) : NaN;
  const lng = lngRaw ? Number(lngRaw) : NaN;
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0) return nearestCity(lat, lng);
  let name = "";
  try {
    name = decodeURIComponent(get("x-vercel-ip-city") ?? "");
  } catch {
    return null;
  }
  name = name.trim().toLowerCase();
  if (!name) return null;
  return CITY_ALIASES[name] ?? CITIES.find((c) => c.id === name || c.label.toLowerCase() === name)?.id ?? null;
}

/**
 * "/c" -> "/", "/c/pune" -> "/", "/c/pune/turfs" -> "/turfs",
 * "/c/pick/pune/games" -> "/games".
 */
export function publicPathFromInternal(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean); // ["c", city | "pick", city?, ...rest]
  const rest = parts.slice(parts[1] === PICK_SEGMENT ? 3 : 2);
  return rest.length ? `/${rest.join("/")}` : "/";
}

/**
 * The sport page an old /sport/<label> URL means, or null. Until 30 Sep
 * turf pages linked each sport tag as /sport/<label in lower case>, so
 * Google still crawls /sport/cricket%20nets, /sport/box%20cricket and
 * /sport/table%20tennis, which 404. A label or a differently cased slug
 * with a page now 308s to it; anything else (squash, which has no page)
 * stays a 404. A real slug never redirects.
 */
export function sportPagePath(pathname: string): string | null {
  const m = /^\/sport\/([^/]+)$/.exec(pathname);
  if (!m) return null;
  let seg: string;
  try {
    seg = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  if (sportBySlug(seg)) return null;
  const page = sportPageForLabel(seg) ?? sportBySlug(seg.trim().toLowerCase());
  return page ? `/sport/${page.slug}` : null;
}

export type ProxyInput = { method: string; pathname: string; search: string; header: Get; cookie: string | undefined };
export type ProxyDecision =
  | { action: "redirect"; location: string }
  | { action: "rewrite"; pathname: string; setCookie?: string; debug: string }
  | { action: "next"; setCookie?: string; debug: string };

/**
 * One request in, one routing decision out:
 * 1. Internal /c paths 308 to their public URL (except ISR revalidation).
 * 2. Only GET and HEAD are personalised. Old /sport/<label> URLs 308 to
 *    their sport page (sportPagePath).
 * 3. A confirmed pick wins. Without one (no cookie, an IP guess
 *    geo.<city>, "unknown" or the retired "all"), a human gets IP
 *    detection, so the pick screen offers the city they are in today; an
 *    IP that gives nothing away keeps an earlier guess. The cookie
 *    (geo.<city> or unknown) is written only on documents, and only when
 *    it changes.
 * 4. On /, /turfs (without ?q=) and /games: a confirmed pick rewrites to
 *    the city's ISR twin; anything else (no cookie, geo.<city>, unknown,
 *    the old "all") rewrites to the static pick screen, /c/pick/<city>
 *    with the detected city as its one-tap answer, or /c/pick/none.
 *    Everything else passes through, never gated.
 * Crawlers never get detection, a cookie or a rewrite: the all-India
 * page at the canonical URL. Only a cookie sent on purpose (a lab tool)
 * routes a crawler UA like a human with that cookie; "all" is ignored.
 */
export function decide(i: ProxyInput): ProxyDecision {
  const { pathname, search, header } = i;
  if (pathname === "/c" || pathname.startsWith("/c/")) {
    if (header("x-prerender-revalidate")) return { action: "next", debug: "internal" };
    return { action: "redirect", location: publicPathFromInternal(pathname) + search };
  }
  if (i.method !== "GET" && i.method !== "HEAD") return { action: "next", debug: "method" };
  const sportPage = sportPagePath(pathname);
  if (sportPage) return { action: "redirect", location: sportPage + search };

  const raw = i.cookie;
  let choice: CityChoice | null = parseCityCookie(raw);
  let setCookie: string | undefined;
  if (isCrawler(header)) {
    if (choice?.kind === "all") choice = null;
  } else if (!confirmedCity(choice)) {
    const city = detectCityFromHeaders(header);
    const kept = choice?.kind === "city" ? choice : null;
    const detected: CityChoice = city ? { kind: "city", city, src: "geo" } : (kept ?? { kind: "unknown" });
    const value = serializeCityChoice(detected);
    if (isDocument(header) && value !== raw) setCookie = value;
    choice = detected;
  }

  const suffix = PERSONALISED[pathname];
  const city = choice?.kind === "city" ? choice.city : null;
  const bypass = pathname === "/turfs" && !!new URLSearchParams(search).get("q");
  if (suffix !== undefined && !bypass && choice) {
    const confirmed = confirmedCity(choice);
    if (confirmed) return { action: "rewrite", pathname: `/c/${confirmed}${suffix}`, setCookie, debug: confirmed };
    const pre = city ?? PICK_NONE;
    return { action: "rewrite", pathname: `/c/${PICK_SEGMENT}/${pre}${suffix}`, setCookie, debug: `${PICK_SEGMENT}.${pre}` };
  }
  return { action: "next", setCookie, debug: city ?? "default" };
}
