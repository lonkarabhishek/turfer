import { createReadOnlyClient } from "@/lib/supabase/server";
import { markStaleRender } from "@/lib/queries/turfs";
import { NO_MANAGERS, readTurfManagers, type TurfManagers } from "@/lib/turfPage/managers";

/**
 * "Managed by @a and @b" for a claimed turf's page (public.turf_managers,
 * 20261028_turf_managers.sql): usernames and ticks only. Like turf_page it
 * is read when the page renders and kept in the page's ISR copy; the cache
 * queue purges that copy when a claim is decided or a manager's username
 * or tagging switch changes. Never throws: on any failure nobody comes
 * back and the page renders without the line. A read that failed for now
 * (not a database from before the migration) keeps that page a minute
 * instead of a day, so the next render brings the line back.
 */
export async function getTurfManagers(turfId: string): Promise<TurfManagers> {
  try {
    return await readTurfManagers(createReadOnlyClient(), turfId, { failedForNow: markStaleRender });
  } catch {
    await markStaleRender();
    return NO_MANAGERS;
  }
}
