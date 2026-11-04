/**
 * "Add TapTurf as a preferred source on Google": Google Search lets a
 * person pick sites they prefer (more of them in Top stories, AI
 * Overviews and AI Mode, for that person only), and a site may link
 * people to Google's page for it. One place for the link and the
 * badge's artwork, so the footer, the menu and every blog post agree;
 * components/ui/PreferredSourceBadge.tsx draws it, and
 * lib/preferredSource.test.ts pins both (npm run test:badge).
 *
 * Plain link: the badge itself loads nothing from Google. Under the
 * cookie banner rule no third-party script or tracking loads before
 * Accept (lib/consent.ts), so this is not Google's JavaScript button
 * (news.google.com/swg/js/v1/publisher.js), and the artwork is served
 * from tapturf.in. The badge reaches Google only when someone taps the
 * link, in a new tab.
 */

/**
 * The domain Google's source preferences tool is asked about. Google's
 * deeplink takes a bare domain name (no scheme, no path), its own
 * example is the bare "example.com", and sites are mostly listed there
 * under the bare domain, so this is tapturf.in, not the canonical host
 * www.tapturf.in (Google documents no www matching either way). Check it
 * signed in to Google: the page should show TapTurf with a checkbox.
 */
export const PREFERRED_SOURCE_DOMAIN = "tapturf.in";

/**
 * Google's documented deeplink (Search Central, "Preferred sources"):
 * https://www.google.com/preferences/source?q=<domain>. It opens the
 * tool on this site; the person still ticks the box there.
 */
export const PREFERRED_SOURCE_URL = `https://www.google.com/preferences/source?q=${PREFERRED_SOURCE_DOMAIN}`;

/** What the link says (its accessible name, and the badge's words). */
export const PREFERRED_SOURCE_LABEL = "Add TapTurf as a preferred source on Google";

/**
 * The badge's artwork, a same-origin path under public/. TapTurf's own
 * star (Google's tool marks preferred sources with a star), not Google's
 * logo: Google lets a site design its own badge, and its official
 * button images could not be downloaded from here to check their files
 * and terms. To use Google's official image instead, put it under
 * public/badges/ and point this at it; it must stay a path on
 * tapturf.in (the test checks).
 */
export const PREFERRED_SOURCE_ART = {
  src: "/badges/preferred-source-star.svg",
  width: 32,
  height: 32,
} as const;
