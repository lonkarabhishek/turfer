/**
 * A turf's page: /turf/<slug> (e.g. /turf/turf-up-hinjewadi). The slug
 * is made in the database (turfs.slug, trigger turfs_set_slug); an id
 * still works and redirects to the slug, so callers without the slug
 * can pass just the id.
 */
export function turfPath(t: { id: string; slug?: string | null }): string {
  return `/turf/${t.slug || t.id}`;
}

export function turfUrl(t: { id: string; slug?: string | null }): string {
  return `https://www.tapturf.in${turfPath(t)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTurfId(s: string): boolean {
  return UUID.test(s);
}
