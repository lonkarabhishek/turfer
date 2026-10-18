/**
 * Pure routing rules for city personalisation, shared by proxy.ts,
 * /api/city, /api/geo and the tests. Relative imports only: the proxy
 * bundles this file, so it must never reach the network or Supabase.
 */
import {
  CITIES,
  CITY_ALIASES,
  nearestCity,
  parseCityCookie,
  serializeCityChoice,
  type CityChoice,
  type CityId,
} from "./city";

/** Public URLs that have a per-city ISR twin under app/c/[city], and that twin's suffix. */
export const PERSONALISED: Record<string, string> = { "/": "", "/turfs": "/turfs", "/games": "/games" };

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

/** "/c" -> "/", "/c/pune" -> "/", "/c/pune/turfs" -> "/turfs". */
export function publicPathFromInternal(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean); // ["c", city?, ...rest]
  const rest = parts.slice(2);
  return rest.length ? `/${rest.join("/")}` : "/";
}

export type ProxyInput = { method: string; pathname: string; search: string; header: Get; cookie: string | undefined };
export type ProxyDecision =
  | { action: "redirect"; location: string }
  | { action: "rewrite"; pathname: string; setCookie?: string; debug: string }
  | { action: "next"; setCookie?: string; debug: string };

/**
 * One request in, one routing decision out:
 * 1. Internal /c paths 308 to their public URL (except ISR revalidation).
 * 2. Only GET and HEAD are personalised.
 * 3. A valid cookie wins. Without one (or with "unknown"), a human gets
 *    IP detection; the cookie is written only on documents.
 * 4. A city choice rewrites /, /turfs (without ?q=) and /games to the
 *    city's ISR twin. Everything else passes through.
 * Crawlers never get detection, a cookie or a rewrite.
 */
export function decide(i: ProxyInput): ProxyDecision {
  const { pathname, search, header } = i;
  if (pathname === "/c" || pathname.startsWith("/c/")) {
    if (header("x-prerender-revalidate")) return { action: "next", debug: "internal" };
    return { action: "redirect", location: publicPathFromInternal(pathname) + search };
  }
  if (i.method !== "GET" && i.method !== "HEAD") return { action: "next", debug: "method" };

  const raw = i.cookie;
  let choice: CityChoice | null = parseCityCookie(raw);
  let setCookie: string | undefined;
  if ((choice === null || choice.kind === "unknown") && !isCrawler(header)) {
    const city = detectCityFromHeaders(header);
    const detected: CityChoice = city ? { kind: "city", city, src: "geo" } : { kind: "unknown" };
    const value = serializeCityChoice(detected);
    if (isDocument(header) && value !== raw) setCookie = value;
    choice = detected;
  }

  const suffix = PERSONALISED[pathname];
  const city = choice?.kind === "city" ? choice.city : null;
  const bypass = pathname === "/turfs" && !!new URLSearchParams(search).get("q");
  if (suffix !== undefined && city && !bypass) {
    return { action: "rewrite", pathname: `/c/${city}${suffix}`, setCookie, debug: city };
  }
  return { action: "next", setCookie, debug: city ?? "default" };
}
