import type { Metadata } from "next";
import { CITIES, CITY_LIST_AND, CITY_LIST_SHORT, cityCopyFrom, type CityCount } from "@/lib/city";
import { getLiveCities } from "@/lib/queries/cities";
import { GAMES_METADATA, turfsMetadata } from "@/lib/seo/pageMetadata";
import type { PickPage } from "@/components/city/CityPick";
import { plural } from "@/lib/home/format";

const SITE = "https://www.tapturf.in";

/**
 * The pick screen's title, description and canonical when the live
 * list cannot be read: the public URL's, with no city count (the static
 * copy never states one). No noindex: the screen is served at the
 * public URL itself, so a noindex here could drop /, /turfs or /games
 * from Google if a crawler were ever routed here. Crawlers are never
 * routed here (proxy.ts).
 */
export const PICK_METADATA: Record<PickPage, Metadata> = {
  "/": {
    title: { absolute: "TapTurf: Football & Box Cricket Turfs in India" },
    description: `Football, box cricket and sports turfs in ${CITY_LIST_AND}. Photos, ratings and prices. No booking fee.`,
    alternates: { canonical: SITE },
  },
  "/turfs": {
    title: `All Sports Turfs in ${CITY_LIST_SHORT}`,
    description: `Every sports turf in ${CITY_LIST_AND}. Compare prices, check ratings, view photos. Call or WhatsApp to book, no booking fee.`,
    alternates: { canonical: `${SITE}/turfs` },
  },
  "/games": {
    title: GAMES_METADATA.title,
    description: GAMES_METADATA.description,
    alternates: GAMES_METADATA.alternates,
  },
};

/**
 * The pick screen's metadata with the live city count, so the tab title
 * a person sees on / says what a crawler's does ("... in 88 Indian
 * Cities"). Built from the same cached live list (getLiveCities, 1 h)
 * the chips read on this page, so no extra database read, and allowed
 * under dynamic = "error" (cached data, not request data). /turfs is
 * the public page's own turfsMetadata(). The static copy on a failed
 * read.
 */
export async function pickMetadata(page: PickPage): Promise<Metadata> {
  try {
    if (page === "/turfs") return await turfsMetadata();
    if (page === "/") {
      const live = await getLiveCities();
      if (live.length > 0) {
        const { listAnd } = cityCopyFrom(live.map((c) => c.label));
        return {
          title: { absolute: `TapTurf: Football & Box Cricket Turfs in ${plural(live.length, "Indian City", "Indian Cities")}` },
          description: `Football, box cricket and sports turfs in ${listAnd}. Photos, ratings and prices. No booking fee.`,
          alternates: { canonical: SITE },
        };
      }
    }
  } catch {
    /* the static copy */
  }
  return PICK_METADATA[page];
}

/**
 * Every city the pick screen offers, with its turf count, biggest first:
 * the hourly cached live list the picker's numbers and /api/cities
 * use, so no extra database read and the three agree (the footer, on a
 * daily copy, states no count). A city the data team added without a
 * code change is in it. On a failed read, the curated cities with no
 * counts.
 */
export async function pickCities(): Promise<CityCount[]> {
  try {
    return (await getLiveCities()).map((c) => ({ id: c.id, n: c.n }));
  } catch {
    return CITIES.map((c) => ({ id: c.id, n: 0 }));
  }
}
