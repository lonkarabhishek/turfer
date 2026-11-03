/**
 * The "by city" link lists of the all-India listing pages: "<Sport> turfs
 * by city" on /sport/<sport> and "Turfs by city" on /turf-near-me. Until 3
 * Nov those pages listed every turf in India (/sport/box-cricket was 8.4 MB
 * of HTML with 3,098 turf links; Googlebot reads the first 2 MB of a page),
 * so they now show their top turfs as cards and link each city's own page,
 * which lists every turf there: one link per city instead of one per turf.
 *
 * A link goes only to a page that is worth indexing (`min` venues: the sport
 * pages pass MIN_TURFS_TO_INDEX from lib/sportCity.ts; /turf-near-me passes
 * 1, as every live city's page is indexable): a thin city is counted in
 * `rest` ("and 9 more cities") with no link.
 *
 * Pure (relative imports only), so node --test runs it (test:seo).
 */
import { isCitySlug } from "./city";
import { citySportHref } from "./sports";

/** A city and how many of the page's venues it has. */
export type CityCount = { id: string; label: string; count: number };
export type CityLink = CityCount & { href: string };
/** The cities left without a link, and their venues between them. */
export type CityRest = { cities: number; venues: number };
export type ByCity = { links: CityLink[]; rest: CityRest };

/** Biggest first; ties keep the caller's order (curated city order, then id, in every caller). */
const biggestFirst = (list: readonly CityCount[]): CityCount[] => [...list].sort((a, b) => b.count - a.count);

/**
 * A sport page's cities: /<city>/<sport> where that page is indexable
 * (`min` or more of the sport's venues there, the threshold the page's own
 * robots and the sitemap use); below it, the city's page /<city> when that
 * is indexable (`cityTotals`: every active turf there, city_turf_counts);
 * else counted in `rest`. A slug that is no city page (reserved, "blog")
 * is never linked.
 */
export function sportCityLinks(perCity: readonly CityCount[], sport: string, cityTotals: ReadonlyMap<string, number>, min: number): ByCity {
  const links: CityLink[] = [];
  const rest: CityRest = { cities: 0, venues: 0 };
  for (const c of biggestFirst(perCity)) {
    if (!(c.count > 0)) continue;
    const city = isCitySlug(c.id) ? c.id : null;
    const href = !city ? null : c.count >= min ? citySportHref(city, sport, c.count) : (cityTotals.get(city) ?? 0) >= min ? `/${city}` : null;
    if (href) links.push({ ...c, href });
    else {
      rest.cities += 1;
      rest.venues += c.count;
    }
  }
  return { links, rest };
}

/** /turf-near-me's cities: /<city> where that page is indexable (`min` or more turfs), else counted in `rest`. */
export function cityPageLinks(perCity: readonly CityCount[], min: number): ByCity {
  const links: CityLink[] = [];
  const rest: CityRest = { cities: 0, venues: 0 };
  for (const c of biggestFirst(perCity)) {
    if (!(c.count > 0)) continue;
    if (isCitySlug(c.id) && c.count >= min) links.push({ ...c, href: `/${c.id}` });
    else {
      rest.cities += 1;
      rest.venues += c.count;
    }
  }
  return { links, rest };
}
