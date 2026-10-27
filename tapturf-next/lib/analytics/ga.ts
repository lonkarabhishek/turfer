import { analyticsAllowed, GA_ID } from "../consent";

/**
 * Google Analytics 4 (gtag.js), only after the visitor taps Accept on the
 * cookie banner (lib/consent.ts). Before that no request goes to Google and
 * window.gtag does not exist, so every gtag?.() on the site is a no-op. A
 * later Reject (forgetTracking) sets GA's own off switch, removes
 * window.gtag and deletes GA's cookies; startAnalytics() undoes that only
 * on a new Accept, and never loads gtag.js twice.
 *
 * Production only, so local dev traffic doesn't reach GA. Page views are
 * sent by components/analytics/GoogleAnalytics.tsx, one per URL; the
 * config sends none of its own, so the page open when the visitor accepts
 * is counted exactly once.
 */

type GaWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void } & Record<string, unknown>;

let loaded = false;

/** Load gtag.js (once) and turn measurement on; false when there is no consent or this is not production. */
export function startAnalytics(): boolean {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "production" || !analyticsAllowed()) return false;
  const w = window as unknown as GaWindow;
  try {
    const wasOff = w[`ga-disable-${GA_ID}`] === true;
    w[`ga-disable-${GA_ID}`] = false;
    if (typeof w.gtag !== "function") {
      w.dataLayer = w.dataLayer || [];
      // gtag.js reads the arguments object itself, not an array.
      w.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        w.dataLayer!.push(arguments);
      };
    }
    if (loaded) {
      // Accepted again after a Reject on this page: the script is here already.
      if (wasOff) w.gtag("consent", "update", { analytics_storage: "granted" });
      return true;
    }
    loaded = true;
    // No ads on TapTurf: only analytics storage is granted.
    w.gtag("consent", "default", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "granted" });
    w.gtag("js", new Date());
    w.gtag("config", GA_ID, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(s);
    return true;
  } catch {
    return false;
  }
}

/** A GA4 event, only with consent (GA is started first if this comes before the page view). */
export function gaEvent(name: string, params: Record<string, unknown> = {}): void {
  if (!startAnalytics()) return;
  try {
    (window as unknown as GaWindow).gtag?.("event", name, params);
  } catch {
    /* analytics is never in the way */
  }
}
