import { unstable_cache } from "next/cache";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { CITIES, cityInfo, type CityInfo } from "@/lib/city";

export type LiveCity = CityInfo & { n: number };

/**
 * Cities that actually have active turfs, from the city_turf_counts
 * view, biggest first. Curated cities keep their label and state; a
 * city the data team added that is not in lib/city.ts yet gets a
 * title-cased label, so its page, sitemap entry and picker row appear
 * without a code change. Cached for an hour.
 */
export const getLiveCities = unstable_cache(
  async (): Promise<LiveCity[]> => {
    try {
      const supabase = createReadOnlyClient();
      const { data, error } = await supabase.from("city_turf_counts").select("city, n");
      if (error || !data) throw error ?? new Error("no data");
      const rows = (data as { city: string; n: number }[]).filter((r) => /^[a-z][a-z-]{1,30}$/.test(r.city));
      const order = new Map(CITIES.map((c, i) => [c.id, i]));
      return rows
        .map((r) => ({ ...cityInfo(r.city), n: r.n }))
        .sort((a, b) => b.n - a.n || (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
    } catch (e) {
      console.error("getLiveCities failed, using the curated list", e);
      return CITIES.map((c) => ({ ...c, n: 0 }));
    }
  },
  ["live-cities"],
  { revalidate: 3600 },
);

/** True when the slug has active turfs. */
export async function isLiveCity(slug: string): Promise<boolean> {
  return (await getLiveCities()).some((c) => c.id === slug);
}
