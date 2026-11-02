/**
 * Web Push settings both sides share (no imports, so the browser bundle and
 * node --test can use it).
 *
 * VAPID_PUBLIC_KEY is the public half of TapTurf's VAPID key pair: browsers
 * subscribe with it, and push services accept only messages signed with its
 * private half, which lives only in Vercel's VAPID_PRIVATE_KEY (server only;
 * lib/push/server.ts). A new pair means every phone has to turn
 * notifications on again: change both together, never one.
 */
export const VAPID_PUBLIC_KEY = "BN1xfFdYZP-xpHf_W8-Nyb02xq6HWrn51NBR5dz9PbVIXt-ufxNiovqw8Hpji-_aSg0965ytm0hIjv7PoEWIK4M";

/** Who push services contact about our messages (the VAPID subject). */
export const VAPID_SUBJECT = "https://www.tapturf.in";

/** How long a push service keeps a message for a phone that is off: a day. */
export const PUSH_TTL_S = 86_400;

/** The service worker: Web Push only (public/sw.js). */
export const PUSH_WORKER_URL = "/sw.js";
