import { analyticsAllowed, GA_ID } from "../consent";

/**
 * Google Analytics 4 (gtag.js), only after the visitor taps Accept on the
 * cookie banner (lib/consent.ts). Before that no request goes to Google and
 * window.gtag does not exist, so every gtag?.() on the site is a no-op. A
 * later Reject (forgetTracking) sets GA's own off switch, removes
 * window.gtag and deletes GA's cookies; startAnalytics() undoes that only
 * on a new Accept, and never loads gtag.js twice.
 *
 * Google's consent state (gtag "consent") is one state for every Google
 * tag on the page, the ad script (lib/analytics/ads.ts) among them.
 * Accept covers ads since 28 Nov 2026 (lib/consent.ts CONSENT_VERSION 2),
 * so all four kinds are granted on Accept and denied on Reject: left at
 * denied, Google's tags are told to write no advertising cookies, which
 * is not what the visitor chose. Google Analytics' own part in ads stays
 * off in its config: no Google signals, no ad personalisation signals.
 *
 * Production only, so local dev traffic doesn't reach GA. Page views are
 * sent by components/analytics/GoogleAnalytics.tsx, one per URL; the
 * config sends none of its own, so the page open when the visitor accepts
 * is counted exactly once.
 */

type GaWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void } & Record<string, unknown>;

/** Google's consent state after Accept: analytics and the three kinds for ads. */
const GRANTED = { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted", analytics_storage: "granted" } as const;

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
      if (wasOff) w.gtag("consent", "update", GRANTED);
      return true;
    }
    loaded = true;
    // What Accept covers: analytics, and ads from Google AdSense (which reads this state too).
    w.gtag("consent", "default", GRANTED);
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
