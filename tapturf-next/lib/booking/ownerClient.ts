import { ownerRpc } from "@/lib/my/client";
import { parseOwnerBookings } from "./requests";
import type { OwnerBookings } from "./types";

/**
 * The owner's side of booking requests on myTapturf: the database's own
 * functions (20261106_booking_requests.sql), called with the owner's
 * sign-in as Free slots calls them (lib/my/client.ts ownerRpc). Each checks
 * that the caller runs the turf (private.slots_guard): anyone else gets
 * { error: "forbidden" }.
 */

export type OwnerAnswer = OwnerBookings | { error: string; status?: string };

/** The list and the switch; "missing" while the database has no booking requests yet. */
export async function getOwnerBookings(turfId: string): Promise<OwnerAnswer | "missing"> {
  let raw: unknown;
  try {
    raw = await ownerRpc<unknown>("owner_booking_requests", { p_turf_id: turfId });
  } catch (e) {
    if (e instanceof Error && /Could not find the function/i.test(e.message)) return "missing";
    throw e;
  }
  return parseOwnerBookings(raw) ?? { error: "malformed" };
}

/** "Take booking requests on TapTurf": on or off. The answer is the list after it. */
export async function setBookingRequests(turfId: string, on: boolean): Promise<OwnerAnswer> {
  return parseOwnerBookings(await ownerRpc<unknown>("owner_set_booking_requests", { p_turf_id: turfId, p_on: on })) ?? { error: "malformed" };
}

/** Confirm or decline a waiting request, or cancel a confirmed one; reason optional. The answer is the list after it. */
export async function answerBooking(requestId: string, action: "confirm" | "decline" | "cancel", reason: string | null = null): Promise<OwnerAnswer> {
  return (
    parseOwnerBookings(await ownerRpc<unknown>("owner_answer_booking_request", { p_request_id: requestId, p_action: action, p_reason: reason })) ?? { error: "malformed" }
  );
}
