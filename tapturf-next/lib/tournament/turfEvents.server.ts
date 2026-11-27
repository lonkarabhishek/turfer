import { unstable_cache } from "next/cache";
import { createReadOnlyClient } from "../supabase/server";
import { missingFn, tournamentKey } from "./server";
import { toTurfEvents, type TurfEvents } from "./turfEvents";

/**
 * Server side of "what is on at a turf" (lib/tournament/turfEvents.ts):
 * the one list every turf page shares, public.turf_events_now
 * (supabase/migrations/20261128_turf_events.sql), read with the live
 * write key and kept in Next's data cache for a minute, so the database
 * sees at most one small read a minute however many turf pages are open.
 * Only GET /api/turf-events calls it; no page reads it on the server.
 */

/** How long one read of the list is shared, in seconds (the CDN keeps the route's answer as long, and serves it two minutes more while it asks again): a match that starts shows on its turf's page within a few minutes. */
export const TURF_EVENTS_FRESH_S = 60;

/** Before 20261128_turf_events.sql the function is not there: left alone a minute per instance, and never kept as "nothing on". */
let offUntil = 0;
class EventsOff extends Error {}

const readList = unstable_cache(
  async (): Promise<TurfEvents[]> => {
    const key = tournamentKey();
    if (!key) throw new EventsOff();
    const { data, error } = await createReadOnlyClient().rpc("turf_events_now", { p_key: key });
    if (error) {
      if (missingFn(error.code)) {
        offUntil = Date.now() + 60_000;
        throw new EventsOff();
      }
      // Thrown, so a failed read is never kept as "nothing on".
      throw new Error(`turf events read failed: ${error.code} ${error.message}`);
    }
    const list = toTurfEvents(data);
    if (!list) throw new Error("turf events read: not a list");
    return list;
  },
  ["turf-events-v1"],
  { revalidate: TURF_EVENTS_FRESH_S },
);

/**
 * Every turf with something on right now. An empty list when live
 * tournaments are off here (no key) or the database has no such function
 * yet (asked again only after a minute per instance): a turf page then
 * looks as it always did. Throws when the read itself failed, so the
 * route can say so instead of answering "nothing on".
 */
export async function turfEventsNow(): Promise<TurfEvents[]> {
  if (!tournamentKey() || Date.now() < offUntil) return [];
  try {
    return await readList();
  } catch (e) {
    if (e instanceof EventsOff) return [];
    throw e;
  }
}
