import type { Turf } from "@/types/turf";
import type { CityId } from "@/lib/city";
import { labelFor } from "@/lib/city";
import { areaFor } from "@/lib/utils/area";
import { summarisePrice } from "@/lib/utils/prices";
import { compareTopRated, hasEnoughReviews } from "@/lib/utils/ranking";
import { venueWord, type SportPage } from "@/lib/sports";
import { ALL_POSTS } from "@/content/blog";

/** Below this many turfs a city + sport page isn't worth indexing. */
export const MIN_TURFS_TO_INDEX = 3;
/** Only quote a price range when enough turfs publish real rates. */
const MIN_PRICED_FOR_RANGE = 5;

export interface SportCityStats {
  count: number;
  priced: number;
  priceMin: number | null;
  priceMax: number | null;
  floodlit: number;
  covered: number;
  topAreas: { area: string; count: number }[];
  topRated: Turf[];
}

/**
 * Facts for a "<Sport> turfs in <City>" page, all derived from the
 * listings themselves. Unknowns stay unknown: no invented prices, and
 * floodlight / covered counts are "at least" (false means not recorded).
 */
export function sportCityStats(turfs: Turf[]): SportCityStats {
  const prices = turfs
    .map((t) => summarisePrice(t))
    .filter((p) => p.kind === "real" && p.min != null && p.max != null);
  const areaCounts = new Map<string, number>();
  for (const t of turfs) {
    const a = areaFor(t);
    if (a) areaCounts.set(a, (areaCounts.get(a) ?? 0) + 1);
  }
  return {
    count: turfs.length,
    priced: prices.length,
    priceMin: prices.length >= MIN_PRICED_FOR_RANGE ? Math.min(...prices.map((p) => p.min!)) : null,
    priceMax: prices.length >= MIN_PRICED_FOR_RANGE ? Math.max(...prices.map((p) => p.max!)) : null,
    floodlit: turfs.filter((t) => t.has_floodlights === true).length,
    covered: turfs.filter((t) => t.is_covered === true).length,
    topAreas: [...areaCounts.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([area, count]) => ({ area, count })),
    topRated: [...turfs].filter(hasEnoughReviews).sort(compareTopRated).slice(0, 3),
  };
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** FAQ for the page and its FAQPage JSON-LD. Every answer is a fact from the data. */
export function sportCityFaq(sport: SportPage, city: CityId, s: SportCityStats) {
  const cityLabel = labelFor(city);
  const lower = sport.name.toLowerCase();
  // "turf"/"turfs" or "court"/"courts", e.g. "pickleball courts in Pune".
  const one = venueWord(sport, 1);
  const many = venueWord(sport);
  const n = (count: number) => (count === 1 ? one : many);
  const faq: { q: string; a: string }[] = [];

  faq.push({
    q: `How many ${lower} ${many} are there in ${cityLabel}?`,
    a:
      `TapTurf lists ${s.count} ${lower} ${n(s.count)} in ${cityLabel}` +
      (s.topAreas.length >= 2
        ? `, including ${listJoin(s.topAreas.slice(0, 4).map((a) => a.area))}.`
        : "."),
  });

  faq.push({
    q: `How much does a ${lower} ${one} cost in ${cityLabel}?`,
    a:
      s.priceMin != null && s.priceMax != null
        ? `${s.priced} of these ${many} list hourly rates on TapTurf, from ${inr(s.priceMin)} to ${inr(s.priceMax)} per hour. Rates usually change by time slot and on weekends, so confirm the price when you call or WhatsApp the venue.`
        : `Most ${cityLabel} ${many} share rates on request. Open one on TapTurf and call or WhatsApp the venue for current slot prices.`,
  });

  if (s.topRated.length > 0) {
    faq.push({
      q: `Which ${lower} ${many} in ${cityLabel} are rated highest?`,
      a: `Going by Google ratings with at least 15 reviews: ${listJoin(
        s.topRated.map((t) => `${t.name} (${t.rating.toFixed(1)}, ${t.total_reviews.toLocaleString("en-IN")} reviews)`),
      )}.`,
    });
  }

  if (s.floodlit > 0) {
    faq.push({
      q: `Can I play ${lower} at night in ${cityLabel}?`,
      a: `Yes. At least ${s.floodlit} ${lower} ${n(s.floodlit)} in ${cityLabel} ${s.floodlit !== 1 ? "are" : "is"} listed with floodlights for evening games.${
        s.covered > 0 ? ` ${s.covered} ${s.covered !== 1 ? "are" : "is"} covered, which helps in the monsoon.` : ""
      }`,
    });
  }

  faq.push({
    q: `How do I book a ${lower} ${one} in ${cityLabel}?`,
    a: `Pick a ${one} on TapTurf and tap Call or WhatsApp to book your slot directly with the venue. TapTurf doesn't charge a booking fee.`,
  });

  return faq;
}

/** Blog posts about this sport: this city's first, then general ones. */
export function relatedPosts(sport: SportPage, city: CityId | null, limit = 3) {
  const key = sport.slug === "box-cricket" ? "box-cricket" : sport.slug;
  const matches = ALL_POSTS.filter((p) => p.slug.includes(key));
  const local = city ? matches.filter((p) => p.city === city) : [];
  const general = matches.filter((p) => p.city == null);
  return [...local, ...general].slice(0, limit);
}
