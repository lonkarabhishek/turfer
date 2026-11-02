import type { PushPayload } from "./types";

/**
 * The pure parts of Web Push, for the routes (lib/push/server.ts): what a
 * phone shows for a notification, which push addresses we send to, the
 * subscription a browser posts and the kind of device. No imports but
 * types, so node --test runs it (npm run test:push).
 */

/** Where a notification with no game of its own opens: the Me tab's Alerts. */
export const ALERTS_URL = "/dashboard?tab=notifications";

/** A notification as push_targets sends it (20261102_web_push.sql). */
export type PushNotificationRow = { id: string; type: string; title: string; message: string; url: string };

/** One line of text: no control characters, spaces collapsed, at most `max` characters (an ellipsis when cut). */
export function oneLine(x: unknown, max: number): string {
  if (typeof x !== "string") return "";
  const s = x.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The page to open: a path on TapTurf (one slash, then the characters a
 * URL path and query may have), else the Alerts. Never another site,
 * never a scheme.
 */
export function safePath(u: unknown): string {
  if (typeof u !== "string" || u.length > 300) return ALERTS_URL;
  return /^\/(?![/\\])[A-Za-z0-9\-._~!$&'()*+,;=:@/?%]*$/.test(u) ? u : ALERTS_URL;
}

const GAME_PATH = /^\/game\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/**
 * What the phone shows for one notification. Notifications of one kind
 * about one game share a tag, so a newer one replaces the older on the
 * phone (two join requests for one game: one notification, the newest);
 * anything else is its own.
 */
export function notificationPayload(n: PushNotificationRow): PushPayload {
  const url = safePath(n.url);
  const game = GAME_PATH.exec(url)?.[1];
  const type = /^[a-z_]{1,40}$/.test(n.type) ? n.type : "note";
  return {
    title: oneLine(n.title, 80) || "TapTurf",
    body: oneLine(n.message, 240),
    url,
    tag: game ? `tt-${type}-${game}` : `tt-${oneLine(n.id, 40)}`,
  };
}

/** "Send me a test". */
export function testPayload(): PushPayload {
  return {
    title: "TapTurf notifications are on",
    body: "This is a test. Join requests and game updates will show up like this.",
    url: ALERTS_URL,
    tag: "tt-test",
  };
}

/** A join request and an accepted request reach the phone at once, even on battery saver; the rest as usual. */
export function urgencyFor(type: string): "high" | "normal" {
  return type === "game_request" || type === "game_request_accepted" ? "high" : "normal";
}

/* ------------------------------------------------------------------ */
/* Push addresses                                                      */
/* ------------------------------------------------------------------ */

/** The push services browsers use: Google (Chrome, Edge on Android, Samsung), Mozilla, Apple (Safari, iPhone) and Microsoft (Edge). */
const PUSH_HOSTS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);
const PUSH_HOST_ENDINGS = [".push.apple.com", ".notify.windows.com", ".push.services.mozilla.com"];

type Env = Record<string, string | undefined>;
let warnedOrigin = false;

/**
 * A local stand-in push service for end-to-end tests (PUSH_TEST_ORIGIN,
 * https on 127.0.0.1 or localhost): honoured only off Vercel, so a value
 * copied into Vercel can never point our sends anywhere else.
 */
export function testPushOrigin(env: Env): string | null {
  const v = env.PUSH_TEST_ORIGIN;
  if (!v) return null;
  try {
    const u = new URL(v);
    if (!env.VERCEL && u.protocol === "https:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) return u.origin;
  } catch {
    /* not a URL */
  }
  if (!warnedOrigin) console.error("PUSH_TEST_ORIGIN is ignored here: only an https local address, and never on Vercel");
  warnedOrigin = true;
  return null;
}

/** Whether we send to this address: https at a known push service, nothing else (the server posts there). */
export function endpointOk(endpoint: unknown, env: Env): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length < 20 || endpoint.length > 1024) return false;
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const test = testPushOrigin(env);
  if (test && u.origin === test) return true;
  if (u.port) return false;
  const host = u.hostname.toLowerCase();
  return PUSH_HOSTS.has(host) || PUSH_HOST_ENDINGS.some((e) => host.endsWith(e));
}

/** A browser's P-256 public key (65 bytes, uncompressed, base64url) and auth secret (16 bytes). */
const P256DH = /^B[A-Za-z0-9_-]{86}$/;
const AUTH = /^[A-Za-z0-9_-]{22}$/;

export type ParsedSubscription = { endpoint: string; p256dh: string; auth: string };

/** The subscription a browser posts (PushSubscription.toJSON()), or which part is wrong. */
export function parseSubscription(body: unknown, env: Env): { ok: ParsedSubscription } | { bad: "endpoint" | "keys" } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(b).some((k) => k !== "endpoint" && k !== "keys" && k !== "expirationTime")) {
    return { bad: "endpoint" };
  }
  if (!endpointOk(b.endpoint, env)) return { bad: "endpoint" };
  const keys = (b.keys ?? {}) as Record<string, unknown>;
  const unpad = (x: unknown) => (typeof x === "string" ? x.replace(/=+$/, "") : "");
  const p256dh = unpad(keys.p256dh);
  const auth = unpad(keys.auth);
  if (!P256DH.test(p256dh) || !AUTH.test(auth)) return { bad: "keys" };
  return { ok: { endpoint: b.endpoint, p256dh, auth } };
}

export type Device = "iphone" | "ipad" | "android" | "mac" | "windows" | "linux" | "other";

/** The kind of device, from the user agent: all we keep about it. */
export function deviceFamily(ua: string | null | undefined): Device {
  const s = ua ?? "";
  if (/iPhone|iPod/.test(s)) return "iphone";
  if (/iPad/.test(s)) return "ipad";
  if (/Android/.test(s)) return "android";
  if (/Macintosh|Mac OS X/.test(s)) return "mac";
  if (/Windows/.test(s)) return "windows";
  if (/CrOS|Linux|X11/.test(s)) return "linux";
  return "other";
}
