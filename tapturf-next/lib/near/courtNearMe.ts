/**
 * The court near-me pages: /badminton-courts-near-me,
 * /pickleball-courts-near-me and /tennis-courts-near-me. Each lists the
 * venues that list its sport (lib/sports.ts turfPlaysSport: tennis is
 * Tennis and Lawn Tennis, never Table Tennis), and every fact in its copy
 * is counted from them. They sit beside /turf-near-me, never in its place:
 * no link, canonical or redirect between the two intents.
 *
 * Pure (relative imports only), so node --test runs it (test:seo).
 */
import type { Turf } from "../../types/turf";
import { CITY_IDS, isCity, labelFor } from "../city";
import { SPORT_PAGES, citySportHref, sportBySlug, sportVenues, venueWord, type SportPage } from "../sports";
import { cardPrice } from "../utils/cardSport";
import { summarisePrice } from "../utils/prices";

/** The sports with a court near-me page, in link order. No other near-me pages. */
export const COURT_NEAR_ME_SPORTS = ["badminton", "pickleball", "tennis"] as const;
export type CourtNearMeSlug = (typeof COURT_NEAR_ME_SPORTS)[number];

export function isCourtNearMeSlug(slug: string): slug is CourtNearMeSlug {
  return (COURT_NEAR_ME_SPORTS as readonly string[]).includes(slug);
}

/** "/badminton-courts-near-me". */
export function courtNearMePath(slug: CourtNearMeSlug): string {
  return `/${slug}-courts-near-me`;
}

/** The sport page of a court near-me sport, or null for any other slug. */
export function courtNearMeSport(slug: string): SportPage | null {
  return isCourtNearMeSlug(slug) ? sportBySlug(slug) ?? null : null;
}

/**
 * ?sport= on /api/turfs/near: undefined when it is not given (every
 * venue, answered as before), null when it is not a court near-me sport
 * (a 400), else that sport.
 */
export function nearSportParam(raw: string | null): SportPage | null | undefined {
  if (raw == null || raw === "") return undefined;
  return courtNearMeSport(raw);
}

/**
 * The link the sport's own pages (/sport/<sport>, /<city>/<sport>) carry
 * to its near-me page: "Badminton courts near me, sorted by distance".
 * Only for the three sports, and only while the sport has venues.
 */
export function courtNearMeLink(slug: string, venues: number): { href: string; text: string } | null {
  const sport = courtNearMeSport(slug);
  if (!sport || !(venues > 0)) return null;
  return { href: courtNearMePath(sport.slug as CourtNearMeSlug), text: `${sportVenues(sport)} near me, sorted by distance` };
}

export type CourtCity = { id: string; label: string; count: number; href: string };

/**
 * Cities with venues of the sport, most first (ties by city size), each
 * with its /<city>/<sport> page: the sport page's city chips, counted the
 * same way (a city the database has and lib/city.ts does not still counts).
 */
export function courtCities(turfs: readonly Pick<Turf, "city">[], sport: SportPage): CourtCity[] {
  const rank = new Map(CITY_IDS.map((id, i) => [id, i]));
  const counts = new Map<string, number>();
  for (const t of turfs) if (isCity(t.city)) counts.set(t.city, (counts.get(t.city) ?? 0) + 1);
  return [...counts.entries()]
    .flatMap(([id, count]) => {
      const href = citySportHref(id, sport.slug, count);
      return href ? [{ id, label: labelFor(id), count, href }] : [];
    })
    .sort((a, b) => b.count - a.count || (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
}

/** Each city's venues (in the order given), then the venues with no city page, if any. */
export function venuesByCity<T extends Pick<Turf, "city">>(turfs: readonly T[], cities: readonly CourtCity[]): { groups: { city: CourtCity; turfs: T[] }[]; rest: T[] } {
  const by = new Map<string, T[]>(cities.map((c) => [c.id, []]));
  const rest: T[] = [];
  for (const t of turfs) {
    const list = t.city ? by.get(t.city) : undefined;
    if (list) list.push(t);
    else rest.push(t);
  }
  return { groups: cities.map((city) => ({ city, turfs: by.get(city.id) ?? [] })), rest };
}

/** "Bangalore, Pune, Hyderabad, Chennai, Delhi and 41 more cities": five by name, the rest counted. */
export function courtCityLine(labels: readonly string[]): string {
  const named = labels.slice(0, 5);
  const rest = labels.length - named.length;
  if (rest > 0) return `${named.join(", ")} and ${rest} more ${rest === 1 ? "city" : "cities"}`;
  return named.length <= 1 ? named[0] ?? "India" : `${named.slice(0, -1).join(", ")} and ${named.at(-1)}`;
}

/** "photos, ratings and timings", each only when a venue behind the page has it; "" for none. */
function extrasLine(on: { withPhotos: number; rated: number; withHours: number }): string {
  const have = [on.withPhotos > 0 && "photos", on.rated > 0 && "ratings", on.withHours > 0 && "timings"].filter((x): x is string => !!x);
  return have.length <= 1 ? have.join("") : `${have.slice(0, -1).join(", ")} and ${have.at(-1)}`;
}

/** The line under the H1: how many venues, where, and only the extras some venue has. */
export function courtHeroLine(f: { sport: SportPage; count: number; cityLabels: readonly string[]; withPhotos: number; rated: number; withHours: number }): string {
  const lower = sportVenues(f.sport).toLowerCase();
  if (f.count <= 0) return `No ${lower} listed yet. Share your location and see the closest ones first as soon as they are.`;
  const many = `${f.sport.name.toLowerCase()} ${venueWord(f.sport, f.count)}`;
  const extras = extrasLine(f);
  return `${f.count} ${many} across ${courtCityLine(f.cityLabels)}. Share your location and see the closest ones first${extras ? `, with ${extras}` : ""}.`;
}

/**
 * The prices these venues' cards show for the sport (lib/utils/cardSport.ts
 * cardPrice, with each venue's sport bands): `shown` show a rate for it;
 * `otherSports` list prices, but none the card can call this sport's (a
 * multi-sport venue's turf rate), so they read "Prices not listed yet".
 */
export function courtPriceFacts(turfs: readonly Turf[], sport: SportPage): { shown: number; otherSports: number } {
  const card = { labels: sport.labels };
  let shown = 0;
  let otherSports = 0;
  for (const t of turfs) {
    if (cardPrice(t, card).kind === "real") shown++;
    else if (summarisePrice(t).kind === "real") otherSports++;
  }
  return { shown, otherSports };
}

export type CourtFaq = { q: string; a: string };

/** The page's questions, every answer from the venues; no invented prices, no "all N" sorted. */
export function courtFaq(f: { sport: SportPage; count: number; cities: readonly CourtCity[]; prices: { shown: number; otherSports: number } }): CourtFaq[] {
  const lower = f.sport.name.toLowerCase();
  const one = `${lower} ${venueWord(f.sport, 1)}`;
  const many = `${lower} ${venueWord(f.sport)}`;
  const n = (k: number) => `${k} ${k === 1 ? one : many}`;
  const top = f.cities.slice(0, 8).map((c) => `${c.label} (${c.count})`);
  const where = top.length <= 1 ? top[0] ?? "" : `${top.slice(0, -1).join(", ")} and ${top.at(-1)}`;
  const { shown, otherSports } = f.prices;
  const lists = (k: number) => (k === 1 ? "lists" : "list");
  const price = [
    shown > 0
      ? `${shown} of the ${n(f.count)} on TapTurf ${lists(shown)} a ${lower} rate, shown on ${shown === 1 ? "its card and page" : "their cards and pages"}.`
      : `No ${one} on TapTurf lists a ${lower} rate yet.`,
    otherSports > 0
      ? `${otherSports} ${shown > 0 ? "more" : `of the ${f.count}`} ${lists(otherSports)} prices only with other sports, so ask for the ${lower} rate.`
      : "",
    "Rates depend on the venue, the time slot and the day; confirm yours when you call or WhatsApp.",
  ].filter(Boolean).join(" ");
  return [
    {
      q: `How do I find a ${one} near me?`,
      a: `Tap "Use my location" on this page. TapTurf sorts ${many} by distance from you, closest first. You can also browse them by city on this page.`,
    },
    ...(f.cities.length > 0
      ? [{
          q: `Where can I play ${lower}?`,
          a: `TapTurf lists ${n(f.count)} in ${f.cities.length} ${f.cities.length === 1 ? "city" : "cities"}, the most in ${where}.`,
        }]
      : []),
    { q: `How much does a ${one} cost?`, a: price },
    {
      q: "Is there a booking fee?",
      a: "No. TapTurf puts you in touch with the venue directly by call or WhatsApp, so you pay the venue and nothing extra.",
    },
  ];
}

/** True when the slug names the sport as whole words: "pickleball-pune-guide" for pickleball, never "table-tennis-tips" for tennis. */
export function slugNamesSport(slug: string, sport: SportPage): boolean {
  const words = slug.toLowerCase().split("-");
  const own = sport.slug.split("-");
  // Longer sport slugs with this one inside (table-tennis for tennis): a match inside one of them is that sport.
  const longer = SPORT_PAGES.filter((p) => p !== sport && p.slug.split("-").length > own.length)
    .map((p) => ({ words: p.slug.split("-"), at: indexOfRun(p.slug.split("-"), own) }))
    .filter((p) => p.at >= 0);
  for (let i = indexOfRun(words, own); i >= 0; i = indexOfRun(words, own, i + 1)) {
    const inside = longer.some((p) => i - p.at >= 0 && p.words.every((w, k) => words[i - p.at + k] === w));
    if (!inside) return true;
  }
  return false;
}

function indexOfRun(words: readonly string[], run: readonly string[], from = 0): number {
  for (let i = from; i + run.length <= words.length; i++) if (run.every((w, k) => words[i + k] === w)) return i;
  return -1;
}

/** Blog posts about the sport (slugNamesSport), in the order given, at most `limit`. */
export function sportGuides<P extends { slug: string }>(posts: readonly P[], sport: SportPage, limit = 3): P[] {
  return posts.filter((p) => slugNamesSport(p.slug, sport)).slice(0, limit);
}

/**
 * The nearest venue of any sport, from the route's ranked list: the city a
 * GPS fix saves on a court page is then the one /turf-near-me saves (its
 * nearest turf's), whichever sport the page lists.
 */
export function nearestAny(ranked: readonly { turf: Pick<Turf, "city">; km: number }[]): { city: string | null; distanceKm: number } | null {
  const first = ranked[0];
  return first ? { city: first.turf.city ?? null, distanceKm: first.km } : null;
}
