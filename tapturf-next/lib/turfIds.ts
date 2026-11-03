/**
 * Old turf URLs, /turf/<uuid> (the turf pages' address until 19 Oct 2026),
 * answered by the proxy (proxy.ts) with a 308 to /turf/<slug>, before any
 * page renders or the database is read. Google still shows them (557 such
 * pages had impressions in the week to 3 Nov).
 *
 * The map is made at build time from the build-data step's sitemap read
 * (every active turf's id and slug, lib/build/turfIds.ts) into
 * lib/turfIds.json, which the proxy imports, so a lookup is one Map get.
 * The committed lib/turfIds.json is empty ({}): dev, tests and a build
 * without the step (TAPTURF_BUILD_DATA=off) redirect nothing here, and
 * every old link still reaches the page, whose permanentRedirect
 * (app/turf/[id]/page.tsx) also covers turfs added after the build. An id
 * not in the map (a turf without a slug, an inactive one, a new one) is
 * left to the page, as before.
 *
 * The map is as of the deploy. Slugs never change on rename, but a slug
 * edited by hand in the database, or a turf switched off, after a deploy
 * needs a redeploy for its old link to be exact: until then the proxy sends
 * the id to the old slug (a 404, noindex). The build log prints the map's
 * md5 (lib/build/turfIds.ts turfIdsDigest); the database query there gives
 * the same md5 while the map is current.
 *
 * No imports, so the proxy and the unit tests (test:build) use it on their own.
 */

/** A turf id as the database writes it: lower-case. */
export const TURF_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Slugs are made by the database: lower-case letters, digits and hyphens (as scripts/turf-redirects.mjs checks).
const SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/;
// /turf/<id> in any case: the id is matched lower-cased.
const PATH = /^\/turf\/([0-9a-fA-F-]{36})$/;

/**
 * id -> slug for these turfs (active ones with a slug: the sitemap's),
 * sorted by id so the file only changes when a turf does. A row whose id is
 * not a uuid, whose slug is missing or malformed, or whose slug looks like
 * an id (it would loop) is left out; the first row of a repeated id wins.
 */
export function turfIdMap(rows: readonly { id?: unknown; slug?: unknown }[]): Record<string, string> {
  const seen = new Map<string, string>();
  for (const r of rows) {
    const id = typeof r?.id === "string" ? r.id.toLowerCase() : "";
    const slug = typeof r?.slug === "string" ? r.slug : "";
    if (!TURF_UUID.test(id) || !SLUG.test(slug) || TURF_UUID.test(slug) || seen.has(id)) continue;
    seen.set(id, slug);
  }
  const out: Record<string, string> = {};
  for (const id of [...seen.keys()].sort()) out[id] = seen.get(id)!;
  return out;
}

/** /turf/<slug> for an old /turf/<uuid> path in the map (any case), else null (the page answers). */
export function turfIdTarget(pathname: string, ids: ReadonlyMap<string, string>): string | null {
  const m = PATH.exec(pathname);
  if (!m) return null;
  const slug = ids.get(m[1].toLowerCase());
  return slug ? `/turf/${slug}` : null;
}
