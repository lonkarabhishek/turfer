import { getBookingRequests, postBookingRequest } from "@/lib/booking/server";

// Booking requests, as the signed-in player (lib/booking/server.ts; the API in lib/booking/types.ts).

/** The caller's requests, newest first. */
export function GET(req: Request) {
  return getBookingRequests(req);
}

/** { turf_id, at, hours, note }: ask the turf for those free hours. */
export function POST(req: Request) {
  return postBookingRequest(req);
}
