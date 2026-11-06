import { createReadOnlyClient } from "@/lib/supabase/server";
import { availabilityResponse } from "@/lib/availability/route";

// A claimed turf's free slots, for its page's card (components/turf/FreeSlotsCard.tsx),
// read in the browser after the page has loaded: never in the page's HTML,
// which is kept a day. The CDN keeps an answer 60 s and serves it stale 60 s
// more; a query string or any other spelling of the path is refused, so
// nothing gets past that copy (lib/availability/route.ts has the rules). No cookies, no sign-in: the
// database's turf_availability gives slot status and the last update only,
// and only for an active claimed turf whose owner updated it within 24 hours.
// Under /api, so the proxy (proxy.ts) never runs for it.

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const r = await availabilityResponse(
    { id, pathname: url.pathname, search: url.search },
    async (turfId) => {
      const { data, error } = await createReadOnlyClient().rpc("turf_availability", { p_turf_id: turfId });
      return { data, error };
    },
    Date.now(),
    // Booking requests (20261106_booking_requests.sql): a boolean only; before that file, an error, which means no.
    async (turfId) => {
      const { data, error } = await createReadOnlyClient().rpc("turf_takes_requests", { p_turf_id: turfId });
      return { data, error };
    },
  );
  if (r.failed) console.error("availability: read failed", id, r.failed);
  return new Response(r.body, { status: r.status, headers: r.headers });
}
