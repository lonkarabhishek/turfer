import { sendCount } from "../count/send";
import { personHere } from "../map/views";
import { arrivalOf, normalPath, skipPath, trafficBody, type Arrival } from "./traffic";

/**
 * The browser's side of the traffic counts (lib/traffic/traffic.ts says
 * what counts): one view per page shown, sent to POST /api/traffic after
 * the fact and never waited on (lib/count/send.ts: a beacon, or a keepalive
 * fetch with the sign-in when signed in). It runs with or without cookie
 * consent, like TapTurf's other anonymous counts, because it keeps nothing
 * on the device: no cookie, no localStorage, sessionStorage or IndexedDB.
 * What it knows lives in this page load's memory only: where the load came
 * from (read once, from document.referrer, utm_source and the navigation
 * type), whether that arrival was counted yet, and the last page counted.
 * It sends no identifier: only the page, where the load came from and
 * whether this view is the visit. No third-party request.
 * components/analytics/TrafficCounter.tsx calls it.
 */

const TRAFFIC_URL = "/api/traffic";
/** A view waits this long first (a page's own title streams in after it shows), then for the browser to be idle, at most IDLE_WAIT_MS more. */
const SETTLE_MS = 600;
const IDLE_WAIT_MS = 1_500;

/** This page load's arrival, read on its first view. */
let arrival: Arrival | null = null;
/** Whether the arrival went with a view already: only the first view of a page load can be the visit. */
let arrivalUsed = false;
/** The page last counted, so the same route's effect run again (React's development double run) is not another view. */
let lastPath: string | null = null;
/** A view waiting for its page to be on screen: dropped if another page comes first (this one was never seen). */
let waiting: (() => void) | null = null;
/** Views waiting for the browser to be idle, sent at once if the page goes first. */
const idle = new Set<() => void>();

type Win = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };

/** The page load's navigation type: "navigate", "reload", "back_forward" or "prerender"; null when the browser doesn't say. */
function navigationType(): string | null {
  try {
    const entry = performance.getEntriesByType?.("navigation")?.[0] as PerformanceNavigationTiming | undefined;
    if (entry?.type) return entry.type;
    // Older browsers: performance.navigation (0 navigate, 1 reload, 2 back or forward).
    const legacy = (performance as Performance & { navigation?: { type?: number } }).navigation?.type;
    return legacy === 1 ? "reload" : legacy === 2 ? "back_forward" : legacy === 0 ? "navigate" : null;
  } catch {
    return null;
  }
}

function readArrival(): Arrival {
  let utm: string | null = null;
  try {
    utm = new URLSearchParams(window.location.search).get("utm_source");
  } catch {
    /* none */
  }
  return arrivalOf({ referrer: document.referrer, ownHost: window.location.host, utm, navType: navigationType() });
}

/**
 * Whether the page on screen is one that doesn't exist: its title says so
 * ("Page not found | TapTurf", app/not-found.tsx, or a page's own "Turf
 * not found", "Not found"), or, for the page load's first page, the server
 * answered 404.
 */
function notFoundShown(first: boolean): boolean {
  if (/^[\w ]{0,30}\bnot found\s*(\||$)/i.test(document.title ?? "")) return true;
  if (!first) return false;
  try {
    const entry = performance.getEntriesByType?.("navigation")?.[0] as (PerformanceNavigationTiming & { responseStatus?: number }) | undefined;
    return entry?.responseStatus === 404;
  } catch {
    return false;
  }
}

function flushIdle() {
  for (const go of [...idle]) go();
}

/** Run fn once the page is on screen: after a prerender is shown, or when a background tab comes to the front. */
function whenShown(fn: () => void) {
  waiting?.();
  waiting = null;
  const d = document as Document & { prerendering?: boolean };
  if (!d.prerendering && d.visibilityState === "visible") return fn();
  const check = () => {
    if (d.prerendering || d.visibilityState !== "visible") return;
    stop();
    fn();
  };
  const stop = () => {
    d.removeEventListener("visibilitychange", check);
    d.removeEventListener("prerenderingchange", check);
    if (waiting === stop) waiting = null;
  };
  d.addEventListener("visibilitychange", check);
  d.addEventListener("prerenderingchange", check);
  waiting = stop;
}

/** Send this page's view a moment after it shows, when the browser is idle (soon at most), or at once if the page goes before. */
function sendWhenIdle(path: string, view: { visit: boolean; first: boolean; source: Arrival["source"]; host: string | null }) {
  let sent = false;
  const go = () => {
    if (sent) return;
    sent = true;
    idle.delete(go);
    try {
      // The title is this page's only while the address is still this page.
      const here = normalPath(window.location.pathname) === path;
      sendCount(TRAFFIC_URL, trafficBody({ path, notFound: here && notFoundShown(view.first), source: view.source, host: view.visit ? view.host : null, visit: view.visit }));
    } catch {
      /* ignore */
    }
  };
  idle.add(go);
  const w = window as Win;
  setTimeout(() => {
    if (sent) return;
    if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: IDLE_WAIT_MS });
    else go();
  }, SETTLE_MS);
}

let hideListening = false;
function listenForHide() {
  if (hideListening) return;
  hideListening = true;
  // A view still waiting for idle goes before the page does (a beacon survives it).
  window.addEventListener("pagehide", flushIdle);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushIdle();
  });
}

/**
 * Count this page as a view: the page now in the address bar, once it is
 * on screen. restored: the page came back from the browser's back-forward
 * cache (a view again, internal, never a visit). Never for a bot or an automated
 * browser, never for /admin or the API; the first page shown of a page
 * load takes its arrival, so it is the visit if the load is one.
 */
export function countPageView(restored = false): void {
  try {
    if (!personHere(navigator.userAgent, navigator.webdriver === true)) return;
    arrival ??= readArrival();
    const path = normalPath(window.location.pathname);
    if (!path) return;
    if (!restored && path === lastPath) return;
    lastPath = path;
    listenForHide();
    const from = arrival;
    whenShown(() => {
      const first = !arrivalUsed;
      const visit = !restored && first && from.visit;
      arrivalUsed = true;
      if (skipPath(path)) return;
      // A page brought back by Back or Forward is a view inside a visit already counted, as a reload is (arrivalOf).
      sendWhenIdle(path, { visit, first: first && !restored, source: restored ? "internal" : from.source, host: from.host });
    });
  } catch {
    /* ignore */
  }
}
