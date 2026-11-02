import type { TokenCheck } from "../account/client";
import { PUSH_WORKER_URL, VAPID_PUBLIC_KEY } from "./config";
import type { PushChangedResponse, PushErrorBody, PushStatusResponse, PushTestResponse } from "./types";

/**
 * Browser side of Web Push: whether this browser can get TapTurf's
 * notifications with the app closed, the service worker (public/sw.js),
 * the subscription and the calls to /api/push/* (lib/push/types.ts). An
 * iPhone gets them only in TapTurf added to its Home Screen (iOS 16.4 and
 * later), and asks only from a tap. Never a user id: the server works out
 * the account from the sign-in token.
 */

type GetToken = () => Promise<TokenCheck>;

/** The account that turned notifications on in this browser (whose subscription it holds). */
const OWNER_KEY = "tt_push_for";
/** The day this browser's subscription was last checked with the server, per account. */
const SYNCED_KEY = "tt_push_synced";

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const store = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage blocked */
  }
};

/* ------------------------------------------------------------------ */
/* What this browser can do                                            */
/* ------------------------------------------------------------------ */

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS asks for the desktop site: a "Mac" with a touch screen.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Opened from the Home Screen (or installed on Android and desktop). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const ios = (window.navigator as { standalone?: boolean }).standalone === true;
  return ios || (window.matchMedia?.("(display-mode: standalone)").matches ?? false);
}

/**
 * push: this browser can subscribe. ios-install: an iPhone or iPad in
 * Safari (or an app's browser), which can only once TapTurf is on the Home
 * Screen and opened from there. ios-update: on the Home Screen, but iOS is
 * older than 16.4. none: no Web Push here.
 */
export type PushSupport = "push" | "ios-install" | "ios-update" | "none";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "none";
  const ios = isIos();
  if (ios && !isStandalone()) return "ios-install";
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return "push";
  return ios ? "ios-update" : "none";
}

/** The browser's notification permission, or "default" where there is none. */
export function notificationPermission(): NotificationPermission {
  return typeof Notification === "undefined" ? "default" : Notification.permission;
}

/* ------------------------------------------------------------------ */
/* The service worker and the subscription                             */
/* ------------------------------------------------------------------ */

/** Registers public/sw.js for the whole site (no-op when it already is). Null where there are no service workers or it fails. */
export async function registerPushWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(PUSH_WORKER_URL, { scope: "/", updateViaCache: "none" });
  } catch {
    return null;
  }
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration("/")) ?? null;
  } catch {
    return null;
  }
}

/** This browser's push subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  if (!reg?.pushManager) return null;
  try {
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Whether TapTurf's pushes reach this browser, so an open tab doesn't ring
 * as well (lib/notifications/browser.ts notify): allowed, subscribed, and
 * turned on here by an account.
 */
export async function pushOnHere(): Promise<boolean> {
  if (notificationPermission() !== "granted" || !read(OWNER_KEY)) return false;
  return !!(await currentSubscription());
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64url.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Whether a subscription was made with our current VAPID key (an older pair's can't get our sends). */
function ourKey(sub: PushSubscription): boolean {
  const k = sub.options?.applicationServerKey;
  if (!k) return true;
  const a = new Uint8Array(k);
  const b = keyBytes(VAPID_PUBLIC_KEY);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function waitFor<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/* ------------------------------------------------------------------ */
/* The routes                                                          */
/* ------------------------------------------------------------------ */

type Answer<T> = { status: number; body: T | PushErrorBody };

async function call<T>(getToken: GetToken, path: string, body: unknown): Promise<Answer<T>> {
  let t: TokenCheck;
  try {
    t = await getToken();
  } catch {
    t = { unknown: true };
  }
  if (!("token" in t)) return "none" in t ? { status: 401, body: { error: "sign_in" } } : { status: 0, body: { error: "unavailable" } };
  try {
    const res = await fetch(path, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t.token}` },
      body: JSON.stringify(body),
    });
    const b = (await res.json().catch(() => null)) as T | PushErrorBody | null;
    return b && typeof b === "object" ? { status: res.status, body: b } : { status: res.status || 0, body: { error: "unavailable" } };
  } catch {
    return { status: 0, body: { error: "unavailable" } };
  }
}

/** Whether push can be turned on yet and whether this address is on for the caller; null when the server couldn't say. */
export async function pushStatus(getToken: GetToken, endpoint: string | null): Promise<PushStatusResponse | null> {
  const a = await call<PushStatusResponse>(getToken, "/api/push/status", { endpoint });
  const b = a.body as Partial<PushStatusResponse>;
  return a.status === 200 && typeof b.ready === "boolean" ? { ready: b.ready, on: b.on === true, devices: typeof b.devices === "number" ? b.devices : 0 } : null;
}

export type TurnOnResult = { ok: { devices: number } } | { error: "denied" | "dismissed" | "not_ready" | "limit" | "sign_in" | "unavailable" };

/**
 * "Notifications on this phone": asks the phone (call it straight from the
 * tap, before anything else: an iPhone asks only from the tap itself),
 * subscribes with our VAPID key and tells the server. When the server
 * doesn't take it, the subscription is undone, so nothing looks on that
 * isn't.
 */
export async function turnPushOn(getToken: GetToken, userId: string): Promise<TurnOnResult> {
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    return { error: "unavailable" };
  }
  if (permission === "denied") return { error: "denied" };
  if (permission !== "granted") return { error: "dismissed" };
  if (!(await registration()) && !(await registerPushWorker())) return { error: "unavailable" };
  let sub: PushSubscription;
  try {
    const ready = await waitFor(navigator.serviceWorker.ready, 15_000);
    let had = await ready.pushManager.getSubscription();
    if (had && !ourKey(had)) {
      await had.unsubscribe().catch(() => false);
      had = null;
    }
    sub = had ?? (await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  } catch {
    return { error: "unavailable" };
  }
  const a = await call<PushChangedResponse>(getToken, "/api/push/subscribe", sub.toJSON());
  if (a.status === 200 && (a.body as PushChangedResponse).r === "ok") {
    store(OWNER_KEY, userId);
    store(SYNCED_KEY, `${userId}:${today()}`);
    return { ok: { devices: (a.body as PushChangedResponse).devices } };
  }
  await sub.unsubscribe().catch(() => false);
  const b = a.body as PushErrorBody;
  return { error: b.reason === "not_ready" ? "not_ready" : a.status === 429 ? "limit" : a.status === 401 ? "sign_in" : "unavailable" };
}

/** Off for this browser: the subscription is ended here first (so nothing more can arrive), then the server is told. */
export async function turnPushOff(getToken: GetToken): Promise<boolean> {
  const sub = await currentSubscription();
  const endpoint = sub?.endpoint ?? null;
  if (sub) await sub.unsubscribe().catch(() => false);
  store(OWNER_KEY, null);
  store(SYNCED_KEY, null);
  if (!endpoint) return true;
  return (await call<PushChangedResponse>(getToken, "/api/push/unsubscribe", { endpoint })).status === 200;
}

export type TestResult = { ok: PushTestResponse } | { error: "none" | "limit" | "not_ready" | "unavailable" };

/** "Send me a test", to every phone of the caller's that is on. */
export async function sendPushTest(getToken: GetToken): Promise<TestResult> {
  const a = await call<PushTestResponse>(getToken, "/api/push/test", {});
  const b = a.body as Partial<PushTestResponse> & Partial<PushErrorBody>;
  if (a.status === 200 && b.r === "ok") return { ok: { r: "ok", sent: b.sent ?? 0, gone: b.gone ?? 0, failed: b.failed ?? 0 } };
  return { error: b.reason === "none" ? "none" : b.reason === "not_ready" ? "not_ready" : a.status === 429 ? "limit" : "unavailable" };
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * For a signed-in visit (components/layout/Header.tsx, after the page has
 * loaded): registers the worker and, at most once a day, checks this
 * browser's subscription with the server. One this account turned on
 * that the server doesn't have (the browser renewed it) is sent again; one
 * from another account that used this browser is ended, so nobody gets
 * another account's notifications here. mayAsk false: only the worker
 * (no sign-in token is fetched, so no sign-in SDK starts just for this).
 */
export async function syncPush(getToken: GetToken, userId: string, mayAsk = true): Promise<void> {
  if (pushSupport() !== "push" || userId === loggedOut) return;
  const reg = await registerPushWorker();
  const sub = reg?.pushManager ? await reg.pushManager.getSubscription().catch(() => null) : null;
  if (!sub || !mayAsk) return;
  const owner = read(OWNER_KEY);
  if (owner === userId && read(SYNCED_KEY) === `${userId}:${today()}`) return;
  const st = await pushStatus(getToken, sub.endpoint);
  if (!st?.ready) return;
  if (st.on) {
    store(OWNER_KEY, userId);
  } else if (owner === userId && notificationPermission() === "granted" && ourKey(sub)) {
    const a = await call<PushChangedResponse>(getToken, "/api/push/subscribe", sub.toJSON());
    if (a.status !== 200) return;
  } else {
    await sub.unsubscribe().catch(() => false);
    store(OWNER_KEY, null);
    return;
  }
  store(SYNCED_KEY, `${userId}:${today()}`);
}

/** The account logging out on this page: nothing registers the worker for it again (a check that was waiting to run). */
let loggedOut: string | null = null;

/**
 * Log out on this browser: notifications stop here (ended here, the server
 * told while the sign-in still works) and the worker goes. Never takes
 * more than about 3 s and never throws.
 */
export async function pushSignOut(getToken: GetToken, userId: string | null): Promise<void> {
  loggedOut = userId;
  try {
    const reg = await registration();
    if (!reg) return;
    await waitFor(turnPushOff(getToken), 3_000).catch(() => false);
    await reg.unregister().catch(() => false);
  } catch {
    /* never in the way of logging out */
  }
}
