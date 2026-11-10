// The cache tags list and games pages carry, and the ones a purge marks.
// No "@/" imports so the unit test compiles it on its own (npm run test:cache).
//
// Until 10 Nov every list page (222 city pages, about 750 city+sport pages,
// every /c twin, /turfs, the home, the sport and near-me pages, the sitemap)
// carried the one tag "turf-data", and any list:<city> key marked all of
// them stale: a one-turf edit in a small city refreshed the whole site's
// lists, which only cost little because their timers were 10 minutes to an
// hour anyway. Now a page says what it shows:
//   turf-data:<city>  a city's own pages (/<city>, /<city>/<sport>, the
//                     /c/<city> twins): its turfs, its counts, its pick
//   turf-data:india   the all-India pages (/, /turfs, /sport/*, the near-me
//                     pages, the sitemap)
//   turf-data         the old tag: any other reader (route handlers, a page
//                     that sets no scope), as before
//   games             pages that show open games (/games, its twins, a game
//                     page, the home and its twins)
// and a list:<city> key marks that city's tag, all-India's and the old one,
// never another city's pages. That is what lets their timers be a day.

/** The old tag: every list read that names no scope (lib/queries/listScope.ts). */
export const LIST_TAG = "turf-data";

/** The all-India scope. Never a city slug (lib/city.ts slugs are place names). */
export const INDIA = "india";

/** Open games changed (the games key). */
export const GAMES_TAG = "games";

/** A city slug as list keys carry them (lib/cache/keys.ts list:<city>), or "india". */
const SCOPE = /^[a-z][a-z-]{1,30}$/;

export const isListScope = (s: unknown): s is string => typeof s === "string" && SCOPE.test(s);

/** The tag of one scope: a city's pages, or all of India's. */
export function listTag(scope: string): string {
  if (!isListScope(scope)) throw new Error(`not a list scope: ${String(scope).slice(0, 40)}`);
  return `${LIST_TAG}:${scope}`;
}

/**
 * The tags one list post marks stale: each changed city's own, all of
 * India's (every all-India page lists every city's turfs and counts) and
 * the old tag. list:all (a turf with no usable city) is on the all-India
 * pages only. Sorted, no duplicates.
 */
export function listPurgeTags(cities: readonly string[]): string[] {
  const tags = new Set<string>();
  for (const c of cities) {
    if (c === "all" || c === INDIA || !isListScope(c)) continue;
    tags.add(listTag(c));
  }
  if (cities.length === 0) return [];
  tags.add(listTag(INDIA));
  tags.add(LIST_TAG);
  return [...tags].sort();
}
