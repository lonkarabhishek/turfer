import { createReadOnlyClient } from "@/lib/supabase/server";
import { markStaleRender } from "@/lib/queries/turfs";
import { NO_MANAGERS, readTurfManagers, shapeTurfManagers, type TurfManagers } from "@/lib/turfPage/managers";
import { buildData, isFailed, recorded } from "@/lib/build/data";

/**
 * "Managed by @a and @b" for a claimed turf's page (public.turf_managers,
 * 20261028_turf_managers.sql): usernames and ticks only. Like turf_page it
 * is read when the page renders and kept in the page's ISR copy; the cache
 * queue purges that copy when a claim is decided or a manager's username
 * or tagging switch changes. Never throws: on any failure nobody comes
 * back and the page renders without the line. A read that failed for now
 * (not a database from before the migration) keeps that page a minute
 * instead of a day, so the next render brings the line back. While
 * building, the answer the build-data step read, shaped the same way (a
 * read that failed there counts as one failed here).
 */
export async function getTurfManagers(turfId: string): Promise<TurfManagers> {
  const built = recorded(buildData("turf-pages")?.managers, turfId);
  if (isFailed(built)) {
    await markStaleRender();
    return NO_MANAGERS;
  }
  if (built !== undefined) return shapeTurfManagers(built);
  try {
    return await readTurfManagers(createReadOnlyClient(), turfId, { failedForNow: markStaleRender });
  } catch {
    await markStaleRender();
    return NO_MANAGERS;
  }
}
