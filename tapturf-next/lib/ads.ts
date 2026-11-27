import { quietPath } from "./outcome/prompt";

/**
 * Google AdSense (the site owner, 27 Nov 2026): which account, which
 * script, and where it may never load. The rule it lives under is the
 * cookie banner's: no third-party script before Accept. So the script is
 * never in the server HTML. Two things that load nothing say whose site
 * this is: the <meta name="google-adsense-account"> tag in the root
 * layout's head and public/ads.txt. The script itself is added by the
 * browser, once, only after Accept (lib/analytics/ads.ts startAds,
 * components/analytics/GoogleAdSense.tsx).
 *
 * No ad units: nothing here places an <ins class="adsbygoogle"> or calls
 * adsbygoogle.push. The script alone shows nothing until Auto ads are
 * turned on in the AdSense account (or placements are added here).
 *
 * Pure: the only import is the outcome card's own pure path rule
 * (npm run test:consent, lib/ads.test.ts).
 */

/** The owner's AdSense publisher id. */
export const ADSENSE_CLIENT = "ca-pub-4556049898419830";

/** The loader, exactly as AdSense gave it: async, crossorigin anonymous, this src. */
export const ADSENSE_SRC = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;

/** The <meta> that tells AdSense whose site this is. It loads nothing. */
export const ADSENSE_META_NAME = "google-adsense-account";

/** public/ads.txt's one line: Google may sell this site's ad space for this account, directly. */
export const ADS_TXT_LINE = `google.com, ${ADSENSE_CLIENT.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0`;

/**
 * Pages that are one person's own, or where they sign in or fill a form
 * of their own: the Me tab, sign-in and linking an account, a player's
 * profile, posting a game, starting a tournament. With quietPath's list
 * (the admin, myTapturf, an owner's report, the email pages) these are
 * every page that is private to a person.
 */
export const NO_ADS_PERSONAL = ["/dashboard", "/login", "/account", "/u", "/game/create", "/tournament/new"] as const;

/**
 * Pages TapTurf has said in public show no ads: the Live Cricket Scorer,
 * the Live Scoreboard and their live pages (the blog post
 * content/blog/posts/ad-free-cricket-scorer-cricheroes-alternative.ts:
 * "free, show no ads", "0 ads on the scorer and scoreboard"), and a turf
 * session, whose matches are that same scorer. Take a path off this list
 * only together with those words.
 */
export const NO_ADS_PROMISED = ["/tools/cricket-live-scorer", "/tools/live-scoreboard", "/tools/turf-session", "/live"] as const;

const under = (path: string, roots: readonly string[]) => roots.some((x) => path === x || path.startsWith(`${x}/`));

/**
 * Whether the ad script may load on this page (a pathname). Never on the
 * pages the outcome card and the turf pages' labels already stay off
 * (lib/outcome/prompt.ts quietPath: /admin, /my, /report, /email), on a
 * person's own pages, or where we promised none. A path that is not one
 * (empty, not starting with "/") is a no.
 */
export function adsAllowedOn(path: string | null | undefined): boolean {
  if (typeof path !== "string") return false;
  const p = path.split(/[?#]/)[0].toLowerCase().replace(/\/+$/, "") || (path.startsWith("/") ? "/" : "");
  if (!p.startsWith("/")) return false;
  return !quietPath(p) && !under(p, NO_ADS_PERSONAL) && !under(p, NO_ADS_PROMISED);
}
