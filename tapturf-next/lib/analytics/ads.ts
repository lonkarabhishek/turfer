import { adsAllowedOn, ADSENSE_SRC } from "../ads";
import { analyticsAllowed } from "../consent";

/**
 * Google AdSense's loader, only after the visitor taps Accept on the
 * cookie banner (lib/consent.ts), as Google Analytics is (ga.ts). Before
 * that no request goes to Google's ad servers: the script is not in the
 * server HTML, and startAds() adds it to the page once, exactly as
 * AdSense gave it (async, crossorigin anonymous, lib/ads.ts ADSENSE_SRC).
 * Production only. Never on the pages lib/ads.ts adsAllowedOn says no to.
 *
 * A script cannot be taken off a page once it has run. So after a Reject
 * (lib/consent.ts forgetTracking), and on a page where ads may not load
 * that the visitor reached without a page load, what can be stopped is:
 * the script is told to ask for no more ads (AdSense's own
 * pauseAdRequests) and none personalised, its cookies are deleted, and no
 * later page load brings it back. Ads already drawn on the page stay
 * until the next page load. A new Accept lifts the pause without a
 * second script.
 *
 * It places no ad unit and never calls adsbygoogle.push: the script alone
 * shows nothing until Auto ads are on in the AdSense account.
 */

type AdsFlags = { pauseAdRequests?: number; requestNonPersonalizedAds?: number };
type AdsWindow = Window & { adsbygoogle?: AdsFlags };

let loaded = false;

/** Tell the script on this page to stop asking for ads, or to carry on. AdSense reads both flags off window.adsbygoogle. */
function hold(on: boolean): void {
  const w = window as unknown as AdsWindow;
  // The array the script itself starts from when it has not run yet: only flags are set, nothing is pushed.
  const ads = (w.adsbygoogle = w.adsbygoogle || ([] as unknown as AdsFlags));
  ads.pauseAdRequests = on ? 1 : 0;
  ads.requestNonPersonalizedAds = on ? 1 : 0;
}

/**
 * Load the ad script (once) on this page; false when there is no consent,
 * this is not production, or `path` is a page ads never load on. A false
 * after it has loaded also pauses it.
 */
export function startAds(path: string | null | undefined): boolean {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "production") return false;
  try {
    if (!adsAllowedOn(path) || !analyticsAllowed()) {
      if (loaded) hold(true);
      return false;
    }
    if (loaded) {
      // Accepted again after a Reject, or back on a page ads may load on: the script is here already.
      hold(false);
      return true;
    }
    loaded = true;
    const s = document.createElement("script");
    s.async = true;
    s.src = ADSENSE_SRC;
    s.crossOrigin = "anonymous";
    document.head.appendChild(s);
    return true;
  } catch {
    return false;
  }
}
