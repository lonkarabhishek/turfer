import { call, type GetToken } from "../games/client";
import type { BookingErrorBody, CancelledResponse, MineResponse, SendBody, SentResponse } from "./types";

/**
 * Browser side of booking requests for players: calls to /api/booking-requests
 * (lib/booking/types.ts) with this device's sign-in token, as the games
 * calls do. Never a user id. status 0 means offline or no answer.
 */

export type BookingAnswer<T> = { status: number; body: T | BookingErrorBody };

export const sendBookingCall = (getToken: GetToken, body: SendBody) =>
  call<SentResponse>(getToken, "/api/booking-requests", { method: "POST", body: JSON.stringify(body) }) as Promise<BookingAnswer<SentResponse>>;
export const myBookingsCall = (getToken: GetToken) => call<MineResponse>(getToken, "/api/booking-requests") as Promise<BookingAnswer<MineResponse>>;
/** expect: the state the row showed, so a request the turf answered meanwhile is not cancelled (lib/booking/server.ts). */
export const cancelBookingCall = (getToken: GetToken, requestId: string, expect: "waiting" | "confirmed") =>
  call<CancelledResponse>(getToken, `/api/booking-requests/${encodeURIComponent(requestId)}?expect=${expect}`, { method: "DELETE" }) as Promise<
    BookingAnswer<CancelledResponse>
  >;
