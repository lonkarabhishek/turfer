import { unstable_cache } from "next/cache";
import { FIRST_LIFE_S, firstLifeOf } from "@/lib/build/data";

/**
 * A page prerendered while `next build` runs shows rows read minutes before
 * go-live (the build-data step's files), and the purges sent meanwhile
 * reached only the old deployment (turf keys are revalidatePath calls; for
 * list tags we have not shown on Vercel that the new deployment's
 * prerendered pages see them). So such a page is kept 15, 20, 25 or 30
 * minutes (by its key, lib/build/data.ts firstLifeOf) instead of its week
 * or day; its first refresh reads the database and keeps its full timer.
 * An unstable_cache entry lowers the page's revalidate to its own (as
 * markStaleRender does), only in that render. Each mark has a fixed name,
 * so its key is the same in every bundle. Used by turf pages
 * (lib/queries/turfPage.ts) and scoped list pages
 * (lib/queries/listScope.ts).
 */
const FIRST_LIFE = new Map(
  FIRST_LIFE_S.map((s) => {
    const mark = async () => true;
    mark.toString = () => `turf-page-first-life-${s}`;
    return [s, unstable_cache(mark, ["turf-page-first-life-v1", String(s)], { revalidate: s })] as const;
  }),
);

export async function firstLife(key: string): Promise<void> {
  try {
    await FIRST_LIFE.get(firstLifeOf(key))?.();
  } catch {
    // Only shortens the page's first life; never fails it.
  }
}
