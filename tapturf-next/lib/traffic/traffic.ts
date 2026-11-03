import { windowCounter } from "../limits";

/**
 * How much traffic TapTurf has, for the admin's Traffic section (the site
 * owner asked on 3 Nov: "Do we calculate traffic? How much traffic we
 * have"). Counted by TapTurf itself, per India day, with or without cookie
 * consent, like the map's counts: nothing is stored on the device, no
 * identifier is sent, no IP address (or hash of one) is stored, no
 * third-party code runs (supabase/migrations/20261104_traffic.sql).
 *
 * What counts, decided in the browser (lib/traffic/track.ts):
 *   view   a page shown and on screen (never a prerender or a background
 *          tab), the first one of a page load and each move to another
 *          page inside the site (the App Router's client-side navigations),
 *          not a bot or an automated browser, not /admin or the API.
 *   visit  a view that arrives from outside the site: the page load's
 *          referrer is empty or another site, and the load is a real
 *          navigation (performance navigation type "navigate"), not a
 *          reload or Back/Forward. Only the first view of a page load can
 *          be one; moving between pages inside the site is views. There is
 *          no unique-visitor count: that needs a note on the device or a
 *          hash of the network, and this keeps neither, so the same person
 *          arriving again later is another visit.
 *   source where the page load came from, from the referrer's host name
 *          and utm_source only (arrivalOf): Google, other search, AI chat,
 *          WhatsApp, Instagram, Facebook, YouTube, X, another site (its
 *          host name kept, nothing else of the address), another app (an
 *          app's referrer, android-app://<package>, that is none of those:
 *          its package name kept, as a site's host is), direct (no
 *          referrer), or internal (a reload, Back or Forward, a full page
 *          load from a TapTurf page, or back from a sign-in: views only,
 *          never a visit, where how the person first arrived isn't known).
 *          The views after a visit, inside the same page load, keep its
 *          source.
 *   kind   what the page is, from its path (pageKind), and the path itself
 *          normalised (normalPath: no query, no hash, lowercased, at most
 *          PATH_MAX characters) for the top pages.
 *
 * The server (POST /api/traffic, lib/traffic/route.ts) checks the agent,
 * prefetches and the page's own origin again, sheds load per network
 * (createTrafficLimiter, in memory only), and verifies a sign-in sent with
 * the view: only to count signed-in views and to leave the site owner's
 * own out. Pure, relative imports only (npm run test:traffic).
 */

export const TRAFFIC_KINDS = [
  "home",
  "city",
  "city_sport",
  "turf",
  "sport",
  "near_me",
  "turfs_list",
  "games",
  "game",
  "game_create",
  "tools",
  "blog",
  "map",
  "live",
  "tournament",
  "profile",
  "dashboard",
  "my",
  "other",
] as const;
export type TrafficKind = (typeof TRAFFIC_KINDS)[number];

export const TRAFFIC_SOURCES = ["google", "search_other", "ai", "whatsapp", "instagram", "facebook", "youtube", "x", "other_site", "app", "direct", "internal"] as const;
export type TrafficSource = (typeof TRAFFIC_SOURCES)[number];

/** A path is kept to this many characters at most (the top pages list). */
export const PATH_MAX = 120;
/** Another site's host name (or another app's package name), at most. */
export const HOST_MAX = 100;
/** The path a page that doesn't exist is counted under (its own address is not kept). */
export const NOT_FOUND_PATH = "(not found)";

// ---------------------------------------------------------------------------
// The page: its path and its kind

/**
 * A page's path as counted: the address without its query or hash,
 * lowercased, repeated slashes as one, no trailing slash (but "/"), at
 * most PATH_MAX characters. Null for anything that is not a path.
 */
export function normalPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  let p = raw.split(/[?#]/)[0].trim().toLowerCase();
  if (!p.startsWith("/")) return null;
  // Spaces, control characters and backslashes never belong in a page's path.
  if (/[\s\\\u0000-\u001f\u007f]/.test(p)) return null;
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p.slice(0, PATH_MAX) || "/";
}

/** Pages never counted: the admin and the API (and Next's own files). */
export function skipPath(path: string): boolean {
  return /^\/(admin|api|_next)(\/|$)/.test(path);
}

/** Top-level words that are not a city (/<city>): the site's own pages. */
const NOT_CITY = new Set(["privacy", "terms", "login", "account", "photos", "avatars", "offline", "c", "u", "turf", "sport", "game", "live", "tournament", "blog", "tools", "map", "games", "turfs", "dashboard", "my", "admin", "api"]);
const SLUG_RE = /^[a-z][a-z0-9-]{1,40}$/;

/** What a page is, from its normalised path (normalPath). */
export function pageKind(path: string): TrafficKind {
  if (path === "/") return "home";
  const s = path.slice(1).split("/");
  const [a, b, c] = s;
  switch (a) {
    case "turfs":
      return s.length === 1 ? "turfs_list" : "other";
    case "turf":
      return s.length === 2 ? "turf" : "other";
    case "sport":
      return s.length === 2 ? "sport" : "other";
    case "games":
      return s.length === 1 ? "games" : "other";
    case "game":
      if (s.length !== 2) return "other";
      return b === "create" ? "game_create" : "game";
    case "tools":
      return "tools";
    case "blog":
      return "blog";
    case "map":
      return s.length === 1 ? "map" : "other";
    case "live":
      return s.length === 2 ? "live" : "other";
    case "tournament":
      return s.length === 2 ? "tournament" : "other";
    case "u":
      return s.length === 2 ? "profile" : "other";
    case "dashboard":
      return "dashboard";
    case "my":
      return "my";
    case "c": {
      // The city twins of /, /turfs and /games (proxy.ts rewrites to them; the address bar keeps the public path).
      const rest = b === "pick" ? s.slice(2) : s.slice(1);
      if (rest.length === 1) return "home";
      if (rest.length === 2 && rest[1] === "turfs") return "turfs_list";
      if (rest.length === 2 && rest[1] === "games") return "games";
      return "other";
    }
  }
  if (s.length === 1 && /^[a-z-]+-near-me$/.test(a)) return "near_me";
  if (!NOT_CITY.has(a) && SLUG_RE.test(a)) {
    if (s.length === 1) return "city";
    if (s.length === 2 && SLUG_RE.test(b) && c === undefined) return "city_sport";
  }
  return "other";
}

// ---------------------------------------------------------------------------
// Where a page load came from

type KnownSource = Exclude<TrafficSource, "other_site" | "app" | "direct" | "internal">;
type HostRule = { source: KnownSource; hosts: string[] };

/** Host names (and their subdomains) per source. An Android app's referrer (android-app://com.whatsapp/) has its package as the host. */
const HOST_RULES: HostRule[] = [
  // Before Google: Gemini lives under google.com.
  {
    source: "ai",
    hosts: ["chatgpt.com", "chat.openai.com", "openai.com", "perplexity.ai", "gemini.google.com", "bard.google.com", "copilot.microsoft.com", "claude.ai", "you.com", "phind.com", "meta.ai", "grok.com", "deepseek.com", "poe.com", "chat.mistral.ai", "com.openai.chatgpt", "ai.perplexity.app.android", "com.google.android.apps.bard", "com.anthropic.claude"],
  },
  { source: "whatsapp", hosts: ["wa.me", "whatsapp.com", "l.wl.co", "com.whatsapp", "com.whatsapp.w4b"] },
  { source: "instagram", hosts: ["instagram.com", "com.instagram.android"] },
  { source: "facebook", hosts: ["facebook.com", "fb.me", "fb.com", "messenger.com", "com.facebook.katana", "com.facebook.orca", "com.facebook.lite", "com.facebook.mlite"] },
  { source: "youtube", hosts: ["youtube.com", "youtu.be", "com.google.android.youtube"] },
  { source: "x", hosts: ["t.co", "x.com", "twitter.com", "com.twitter.android"] },
  // The Google app, Google Go and Google Maps (the app and its share links); Google's websites, maps.google.com among them, are GOOGLE_RE.
  { source: "google", hosts: ["com.google.android.googlequicksearchbox", "com.google.android.apps.searchlite", "com.google.android.apps.maps", "maps.app.goo.gl"] },
  {
    source: "search_other",
    hosts: ["bing.com", "duckduckgo.com", "yahoo.com", "yandex.com", "yandex.ru", "ecosia.org", "baidu.com", "search.brave.com", "startpage.com", "qwant.com", "naver.com", "ask.com", "search.aol.com", "seznam.cz", "sogou.com", "com.duckduckgo.mobile.android", "com.microsoft.bing"],
  },
];

/** Google's own hosts in every country (google.com, google.co.in, news.google.com); Gmail is an email, not a search. */
const GOOGLE_RE = /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/;
/** Coming back from a sign-in (Google's account chooser, Supabase's or Firebase's auth pages): not an arrival from outside. */
const AUTH_RE = /(^|\.)(accounts\.google\.com|accounts\.youtube\.com|supabase\.co|firebaseapp\.com)$/;

const under = (host: string, base: string) => host === base || host.endsWith(`.${base}`);

/** The source a host name is, when it is a known one; null for any other site or app. */
export function hostSource(host: string): KnownSource | null {
  for (const r of HOST_RULES) if (r.hosts.some((h) => under(host, h))) return r.source;
  if (host === "mail.google.com") return null;
  if (GOOGLE_RE.test(host)) return "google";
  return null;
}

/** Whether a referrer's host is a sign-in page sending the person back (the view counts, not as a visit). */
export function authReturn(host: string): boolean {
  return AUTH_RE.test(host);
}

/**
 * A referrer's host name as kept: lowercased, no port, no leading "www.",
 * at most HOST_MAX characters, and only a real name (letters, digits,
 * hyphens and dots, with a dot): never an IP address or "localhost".
 * Null for anything else.
 */
export function cleanHost(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const h = raw.trim().toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
  if (!h || h.length > HOST_MAX) return null;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h)) return null;
  if (/^[\d.]+$/.test(h)) return null;
  return h;
}

/** The host of a referrer (web pages and Android apps), or null when there is none to read. */
export function referrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  let u: URL;
  try {
    u = new URL(referrer);
  } catch {
    return null;
  }
  if (!["http:", "https:", "android-app:", "ios-app:"].includes(u.protocol)) return null;
  return u.hostname ? u.hostname.toLowerCase().replace(/^www\./, "") : null;
}

/** Whether a referrer is an app's (android-app://<package>/, or iOS's ios-app://), not a website's. */
export function appReferrer(referrer: string | null | undefined): boolean {
  return /^(android|ios)-app:\/\//i.test(referrer ?? "");
}

/** utm_source names that are a source (a host name in it is read as one, so utm_source=chatgpt.com is AI chat). */
const UTM_NAMES: Record<string, TrafficSource> = {
  whatsapp: "whatsapp",
  wa: "whatsapp",
  whatsapp_status: "whatsapp",
  instagram: "instagram",
  ig: "instagram",
  facebook: "facebook",
  fb: "facebook",
  youtube: "youtube",
  yt: "youtube",
  twitter: "x",
  x: "x",
  google: "google",
  bing: "search_other",
  duckduckgo: "search_other",
  yahoo: "search_other",
  chatgpt: "ai",
  openai: "ai",
  perplexity: "ai",
  gemini: "ai",
  copilot: "ai",
  claude: "ai",
};

/** The source a utm_source names, when it is one this knows; anything else is not read. */
export function utmSource(raw: string | null | undefined): TrafficSource | null {
  const v = (raw ?? "").trim().toLowerCase().slice(0, 60);
  if (!v) return null;
  if (UTM_NAMES[v]) return UTM_NAMES[v];
  const host = cleanHost(v);
  return host ? hostSource(host) : null;
}

/** Whether a host is this site's own (www. or not). */
export function ownSite(host: string, ownHost: string): boolean {
  const a = host.toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
  const b = ownHost.toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
  return a === b;
}

/** A page load's arrival: where it came from, the other site's host (only for other_site), and whether its first view is a visit. */
export type Arrival = { source: TrafficSource; host: string | null; visit: boolean };

/**
 * Where this page load came from and whether it is a visit, from what the
 * browser knows about it: its referrer, this site's host, the page's
 * utm_source and the navigation type. Only a real navigation from outside
 * is a visit. A reload or Back/Forward is internal: a page view inside a
 * visit already counted (the browser often keeps no referrer for a page
 * the site moved to itself, so it can't say where that visit came from).
 * So is a referrer of this site, or a sign-in page sending the person
 * back. Else a known utm_source wins over the referrer; else the
 * referrer's host: a known source, else another app (an app's referrer,
 * its package kept) or another site (its host kept); else direct.
 */
export function arrivalOf(o: { referrer: string | null | undefined; ownHost: string; utm: string | null | undefined; navType: string | null | undefined }): Arrival {
  const internal: Arrival = { source: "internal", host: null, visit: false };
  if (o.navType === "reload" || o.navType === "back_forward") return internal;
  const ref = referrerHost(o.referrer);
  if (ref && (ownSite(ref, o.ownHost) || authReturn(ref))) return internal;
  const fromUtm = utmSource(o.utm);
  if (fromUtm) return { source: fromUtm, host: null, visit: true };
  if (!ref) return { source: "direct", host: null, visit: true };
  const known = hostSource(ref);
  if (known) return { source: known, host: null, visit: true };
  return { source: appReferrer(o.referrer) ? "app" : "other_site", host: cleanHost(ref), visit: true };
}

// ---------------------------------------------------------------------------
// What the browser sends, and what the server reads of it

/** One view as the browser sends it. */
export type TrafficView = { path: string; notFound: boolean; source: TrafficSource; host: string | null; visit: boolean };

/** Whether a source keeps its host: another site's name, another app's package. */
export const keepsHost = (source: TrafficSource): boolean => source === "other_site" || source === "app";

/** The body: the path, the source, 1 for a visit, the other site's host or app's package (a visit from one only), 1 for a page that doesn't exist. Nothing else. */
export function trafficBody(v: TrafficView): string {
  const o: Record<string, string | number> = { p: v.path, s: v.source };
  if (v.visit && v.source !== "internal") {
    o.v = 1;
    if (keepsHost(v.source) && v.host) o.h = v.host;
  }
  if (v.notFound) o.nf = 1;
  return JSON.stringify(o);
}

/** A view as the server counts it. */
export type TrafficCount = { path: string; kind: TrafficKind; source: TrafficSource; host: string | null; visit: boolean };

/**
 * The view a POST body asks for, or null when it isn't one: a page's path
 * (never the admin's or the API's), a known source; a visit only from
 * outside the site, with a clean host only for another site's or app's. The kind is
 * worked out here from the path, never taken from the browser; a page that
 * doesn't exist counts under NOT_FOUND_PATH. A host that is a known source
 * (or a sign-in page) is read as that.
 */
export function parseTrafficBody(raw: unknown): TrafficCount | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as { p?: unknown; s?: unknown; v?: unknown; h?: unknown; nf?: unknown };
  const path = normalPath(typeof o.p === "string" ? o.p : null);
  if (!path || skipPath(path)) return null;
  if (!TRAFFIC_SOURCES.includes(o.s as TrafficSource)) return null;
  let source = o.s as TrafficSource;
  let visit = (o.v === 1 || o.v === true) && source !== "internal";
  let host: string | null = null;
  if (visit && keepsHost(source)) {
    host = cleanHost(typeof o.h === "string" ? o.h : null);
    if (host && authReturn(host)) {
      source = "internal";
      visit = false;
      host = null;
    } else if (host) {
      const known = hostSource(host);
      if (known) {
        source = known;
        host = null;
      }
    }
  }
  const notFound = o.nf === 1 || o.nf === true;
  return notFound ? { path: NOT_FOUND_PATH, kind: "other", source, host, visit } : { path, kind: pageKind(path), source, host, visit };
}

// ---------------------------------------------------------------------------
// The server's limits, in memory only

/** Views per network per minute, per instance, of every page together. A carrier's network puts many phones behind one address. */
export const TRAFFIC_PER_MIN = 240;
/** Views of one page per network in TRAFFIC_PAGE_WINDOW_MS, per instance: a page reloading itself in a loop gets no further. */
export const TRAFFIC_PER_NET_PAGE = 60;
export const TRAFFIC_PAGE_WINDOW_MS = 10 * 60_000;
/** Visits per network per hour, per instance; a view past it counts, as not a visit. */
export const TRAFFIC_VISITS_PER_NET = 120;

export type TrafficTake = { count: true; visit: boolean } | { count: false; why: "slow" | "many" };

/**
 * Per-instance limits for the traffic counts, before any database call, so
 * a looping or hostile page costs this function and not the database. net
 * is a keyed hash of the network, kept in memory for the window only and
 * never stored. Past the network's minute a view is shed ("slow"), past
 * TRAFFIC_PER_NET_PAGE of one page ("many"); past TRAFFIC_VISITS_PER_NET an
 * hour a visit counts as a view only.
 */
export function createTrafficLimiter(now: () => number = Date.now) {
  const perNet = windowCounter(TRAFFIC_PER_MIN, 60_000, now);
  const perPage = windowCounter(TRAFFIC_PER_NET_PAGE, TRAFFIC_PAGE_WINDOW_MS, now);
  const visits = windowCounter(TRAFFIC_VISITS_PER_NET, 60 * 60_000, now);
  return (net: string, path: string, visit: boolean): TrafficTake => {
    if (!perNet(net)) return { count: false, why: "slow" };
    if (!perPage(`${net}|${path}`)) return { count: false, why: "many" };
    return { count: true, visit: visit && visits(net) };
  };
}
