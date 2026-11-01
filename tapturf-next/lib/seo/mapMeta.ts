import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, OG_BASE, ROBOTS_NOINDEX_FOLLOW, SITE_URL, TWITTER_CARD } from "./defaults";

/**
 * /map's title and description. One page for every view (the city or
 * area is in the query string and read in the browser), so the words are
 * fixed: no count to keep honest. Kept out of the index (noindex, follow)
 * and out of sitemap.xml until the owner chooses to list it; the turf and
 * game links it shows are followed. Pure (type imports only), so `npm run
 * test:seo` checks it.
 */

/** The layout's template adds " | TapTurf". */
export const MAP_TITLE = "Turf Map of India: Turfs and Open Games";
export const MAP_DESCRIPTION =
  "See sports turfs and open games across India on one map. Zoom into any city for prices, ratings and photos, then call or WhatsApp the turf.";

export function mapMetadata(): Metadata {
  return {
    title: MAP_TITLE,
    description: MAP_DESCRIPTION,
    robots: ROBOTS_NOINDEX_FOLLOW,
    openGraph: {
      ...OG_BASE,
      images: [DEFAULT_OG_IMAGE],
      title: `${MAP_TITLE} | TapTurf`,
      description: MAP_DESCRIPTION,
      url: `${SITE_URL}/map`,
    },
    twitter: TWITTER_CARD,
    alternates: { canonical: `${SITE_URL}/map` },
  };
}
