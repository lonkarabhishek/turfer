/**
 * Booking requests (the site owner's option A, 6 Nov 2026; the database in
 * supabase/migrations/20261106_booking_requests.sql). A player asks a turf
 * that takes requests for 1 to 3 of the hours its owner marked free; the
 * turf confirms or declines on myTapturf; the player pays at the turf.
 *
 * Players, through the routes as the verified caller (lib/booking/server.ts,
 * lib/booking/client.ts); the browser never names a user id:
 *   POST   /api/booking-requests        send one (SendBody)
 *   GET    /api/booking-requests        mine, newest first ({ ready, requests })
 *   DELETE /api/booking-requests/[id]   cancel one of mine, waiting or confirmed, before it starts
 * Refusals: 400 bad { field } | { reason: "gone" }; 409 not_allowed { reason: off | own | no_phone |
 * started }; 409 conflict { reason: taken, booked } | { reason: past } | { reason: answered, status };
 * 429 limit { reason: day | waiting | sends }; 401 sign_in; 404 new; 429 slow; 503 unavailable
 * (with reason: not_ready before the migration). No answer ever carries a phone number.
 *
 * Owners, from the browser with their sign-in, as Free slots (lib/booking/ownerClient.ts):
 *   owner_booking_requests, owner_set_booking_requests, owner_answer_booking_request.
 * The turf page's card learns whether a turf takes requests from GET /api/availability/<id>
 * (requests: true), never from the page's HTML.
 */

import type { SlotKey } from "../availability/slots";

export type BookingStatus = "waiting" | "confirmed" | "declined" | "cancelled" | "expired";
/** Who changed it last: the turf's owner, the player, the hours went to someone else (taken), or its start came (clock). */
export type ChangedBy = "owner" | "player" | "taken" | "clock";

/** A request as its player sees it. Never a name or a number. */
export type MyBookingRequest = {
  id: string;
  turf_id: string;
  turf_name: string | null;
  turf_slug: string | null;
  /** The first hour's slot key, India time. */
  at: SlotKey;
  hours: number;
  /** "Sun 8 Nov, 7 PM to 9 PM" */
  when: string;
  note: string | null;
  status: BookingStatus;
  changed_by: ChangedBy | null;
  reason: string | null;
  created_at: string;
  changed_at: string | null;
  can_cancel: boolean;
};

/** A request as the turf's owners and managers see it: who asked, and their verified number. */
export type OwnerBookingRequest = {
  id: string;
  at: SlotKey;
  hours: number;
  when: string;
  name: string;
  /** +91 and 10 digits. */
  phone: string;
  note: string | null;
  created_at: string;
};

/** The owner's list: the switch, whether players can send now, waiting (newest first) and confirmed (soonest first). */
export type OwnerBookings = {
  ok: true;
  now: string;
  on: boolean;
  open: boolean;
  waiting: OwnerBookingRequest[];
  confirmed: OwnerBookingRequest[];
  done?: "confirm" | "decline" | "cancel";
  declined_others?: number;
};

/** What the sheet sends. */
export type SendBody = { turf_id: string; at: SlotKey; hours: number; note: string | null };

/** Why the server said no (the reason key of a refusal). */
export type BookingRefusal = "off" | "own" | "no_phone" | "started" | "taken" | "past" | "answered" | "day" | "waiting" | "sends" | "gone" | "not_ready";

export type BookingErrorBody = { error: string; reason?: BookingRefusal; field?: string; booked?: SlotKey[]; status?: BookingStatus };
export type SentResponse = { r: "ok"; request: MyBookingRequest };
export type MineResponse = { ready: boolean; requests: MyBookingRequest[] };
export type CancelledResponse = { r: "ok"; status: "cancelled"; request: MyBookingRequest };
