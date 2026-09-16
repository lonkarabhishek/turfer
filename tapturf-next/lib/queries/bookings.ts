import { createClient } from "@/lib/supabase/client";
import type { Booking, BookingStatus } from "@/types/booking";

const supa = () => createClient();

/**
 * All bookings a user has made, newest date first. Used for the
 * dashboard's "My bookings" view.
 */
export async function getUserBookings(userId: string): Promise<Booking[]> {
  try {
    const s = supa();
    const { data } = await s
      .from("bookings")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .order("start_time", { ascending: false });
    return (data || []) as Booking[];
  } catch (e) {
    console.warn("[bookings] getUserBookings failed:", e);
    return [];
  }
}

/**
 * Every booking held on a turf. Used server-side by owner surfaces;
 * public callers should filter further before rendering.
 */
export async function getTurfBookings(
  turfId: string,
  opts: { statuses?: BookingStatus[]; fromDate?: string } = {},
): Promise<Booking[]> {
  try {
    const s = supa();
    let q = s
      .from("bookings")
      .select("*")
      .eq("turf_id", turfId)
      .order("date", { ascending: true });
    if (opts.statuses && opts.statuses.length > 0) q = q.in("status", opts.statuses);
    if (opts.fromDate) q = q.gte("date", opts.fromDate);
    const { data } = await q;
    return (data || []) as Booking[];
  } catch (e) {
    console.warn("[bookings] getTurfBookings failed:", e);
    return [];
  }
}
