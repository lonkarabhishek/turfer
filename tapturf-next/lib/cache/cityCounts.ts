// The city_turf_counts view worked out from the active turf rows, for when
// the view cannot be read and this process has no list of its own
// (lib/queries/cities.ts getLiveCities). The rows have their own last good
// copies (this process's, or a whole version in Next's data cache, see
// lib/cache/rowStore.ts), so a cold process can still name the live cities.
// No "@/" imports so the unit test compiles it on its own (npm run test:cache).

/** One row of city_turf_counts: a city, its active turfs, and their median point (null when none is inside India's box). */
export type CityCountsRow = { city: string; n: number; lat: number | null; lng: number | null };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** percentile_cont(0.5): the middle value, or the mean of the two middle ones. */
function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * What the view answers (supabase/migrations/20261028_city_centroids.sql),
 * from rows carrying city, lat, lng and is_active: active turfs with a
 * city, counted per city, and the median lat and lng of those inside
 * India's box (lat 6 to 37, lng 68 to 98). Rows marked inactive are left
 * out; rows without the flag count (the list holds active turfs only). The
 * view has no order, and neither has this; the caller sorts.
 */
export function cityCountsFromRows(rows: readonly Record<string, unknown>[]): CityCountsRow[] {
  const by = new Map<string, { n: number; lats: number[]; lngs: number[] }>();
  for (const r of rows) {
    if (r.is_active === false) continue;
    const city = r.city;
    if (typeof city !== "string" || city === "") continue;
    let c = by.get(city);
    if (!c) by.set(city, (c = { n: 0, lats: [], lngs: [] }));
    c.n++;
    const lat = num(r.lat);
    const lng = num(r.lng);
    if (lat !== null && lng !== null && lat >= 6 && lat <= 37 && lng >= 68 && lng <= 98) {
      c.lats.push(lat);
      c.lngs.push(lng);
    }
  }
  return [...by].map(([city, c]) => ({ city, n: c.n, lat: median(c.lats), lng: median(c.lngs) }));
}
