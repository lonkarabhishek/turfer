import type { Metadata } from "next";
import { CITIES, CITY_LIST_AND, CITY_LIST_SHORT, isKnownCity } from "@/lib/city";
import { getLiveCities } from "@/lib/queries/cities";
import { GAMES_METADATA } from "@/lib/seo/pageMetadata";
import type { PickPage } from "@/components/city/CityPick";

const SITE = "https://www.tapturf.in";

/**
 * The pick screen keeps the public URL's title, description and
 * canonical, built from the static city list so it needs no database
 * read (the home's live counts are not worth one here). No noindex: the
 * screen is served at the public URL itself, so a noindex here could
 * drop /, /turfs or /games from Google if a crawler were ever routed
 * here. Crawlers are never routed here (proxy.ts).
 */
export const PICK_METADATA: Record<PickPage, Metadata> = {
  "/": {
    title: { absolute: `TapTurf: Football & Box Cricket Turfs in ${CITIES.length} Indian Cities` },
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

/** Chips the pick screen shows before "More cities". */
const TOP = 12;

/**
 * The pick screen's first chips, biggest first: curated cities in the
 * live turf-count order, then the static CITIES order to fill up, never
 * the detected city (it is the big button). The live order is the same
 * hourly cached list the root layout's footer reads on this very page,
 * so no extra database read, and the chips agree with the footer and
 * the picker. On a failed read it is the static order alone.
 */
export async function pickTop(detected: string | null): Promise<string[]> {
  const live = await getLiveCities().catch(() => []);
  const ids = new Set([...live.map((c) => c.id), ...CITIES.map((c) => c.id)]);
  return [...ids].filter((id) => isKnownCity(id) && id !== detected).slice(0, TOP);
}
