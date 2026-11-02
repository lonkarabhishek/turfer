import type { AccountError } from "../account/types";

/**
 * The Web Push routes (app/api/push/**, lib/push/server.ts). Each takes
 * the signed-in caller's token, never a user id; the endpoint is the
 * browser's push address (PushSubscription.endpoint).
 */

/**
 * POST /api/push/status { endpoint | null }. ready: phone notifications can
 * be turned on (the server has its VAPID key and the database its push
 * functions); until then the switch says coming soon. on: this push
 * address is on for the caller. gone (once ready): why the server stopped
 * this address of the caller's, else null; the browser ends it too and
 * never sends it again by itself. devices: how many of theirs are on.
 */
export type PushStatusResponse = { ready: boolean; on: boolean; devices: number; gone?: PushGone | null };

/** Why a subscription stopped: turned off there, the push service ended it (404, 410), 8 failures in a row, or an 11th phone took its place. */
export type PushGone = "off" | "expired" | "failing" | "replaced";

/** POST /api/push/subscribe: PushSubscription.toJSON() (expirationTime is ignored). */
export type PushSubscribeBody = { endpoint: string; keys: { p256dh: string; auth: string }; expirationTime?: number | null };

/** POST /api/push/subscribe and /api/push/unsubscribe { endpoint }. */
export type PushChangedResponse = { r: "ok"; devices: number };

/** POST /api/push/test: sent to the caller's own phones, each one's fate counted. */
export type PushTestResponse = { r: "ok"; sent: number; gone: number; failed: number };

/**
 * not_ready: before the VAPID key or the push functions; none: nothing is on
 * to test; expired (409, subscribe): the push service has ended that
 * address, so the browser makes a new one.
 */
export type PushErrorBody = { error: AccountError; reason?: "not_ready" | "none" | "expired"; field?: "endpoint" | "keys" };

/** What the service worker gets in each push (public/sw.js reads these keys). */
export type PushPayload = { title: string; body: string; url: string; tag: string };
