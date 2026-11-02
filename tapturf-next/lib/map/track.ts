import { hasSignIn, signInKnown, signInToken, type TokenCheck } from "../account/client";
import { newViewTag } from "../live/views";
import { MAP_SEEN_KEY, mapCardKind, mapUseBody, personHere, planMapView, readMapSeen, type MapKind, type MapSeen } from "./views";

/**
 * The browser's side of the map's counts (lib/map/views.ts says what
 * counts): one view of /map once it is up and on screen, a card opened
 * from it, a turf page's map opened. Each goes to POST /api/map/views
 * after the fact and is never waited on: a beacon when signed out (it
 * survives the page going), a keepalive fetch with the sign-in when signed
 * in (a beacon can't carry it), read quietly as the free tools do, so it
 * never signs anyone out; no token in time and it goes as a guest's. Like
 * TapTurf's other anonymous counts it runs with or without cookie consent:
 * it sends no tag about the browser, and keeps one note here (MAP_SEEN_KEY,
 * the day and the time of the last counted view) so a reload or Back is not
 * another view. No third-party request.
 */

const USE_URL = "/api/map/views";
/** A sign-in token that takes longer than this (a cold Firebase load) makes the event a guest's. */
const TOKEN_WAIT_MS = 5_000;
/** The same card tapped again this soon (a double tap) is one tap. */
const TAP_AGAIN_MS = 2_000;

/** The note, kept in memory too: storage that is blocked or throws still counts once per VIEW_AGAIN_MS in this page. */
let seenHere: MapSeen | null = null;
let lastTap: { href: string; at: number } | null = null;

const person = () => personHere(navigator.userAgent, navigator.webdriver === true);

function beacon(body: string) {
  try {
    if (navigator.sendBeacon?.(USE_URL, new Blob([body], { type: "application/json" }))) return;
  } catch {
    /* a browser that refuses the beacon: the fetch below */
  }
  void fetch(USE_URL, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true, cache: "no-store" }).catch(() => {});
}

const tokenSoon = (): Promise<TokenCheck> =>
  Promise.race([signInToken(), new Promise<TokenCheck>((resolve) => setTimeout(() => resolve({ unknown: true }), TOKEN_WAIT_MS))]);

function sendNow(body: string) {
  try {
    if (hasSignIn() !== true) return beacon(body);
    void tokenSoon()
      .then((t) =>
        "token" in t
          ? fetch(USE_URL, { method: "POST", body, keepalive: true, cache: "no-store", headers: { "content-type": "application/json", Authorization: `Bearer ${t.token}` } }).then(() => {})
          : beacon(body),
      )
      .catch(() => {});
  } catch {
    /* ignore */
  }
}

/** One event, never in the way: while AuthProvider is still reading this device's sign-in, it waits for that (as long as a token may take). */
function send(kind: MapKind, unique = false) {
  try {
    const body = mapUseBody(kind, unique, newViewTag());
    if (hasSignIn() !== null) return sendNow(body);
    void signInKnown(TOKEN_WAIT_MS)
      .then(() => sendNow(body))
      .catch(() => {});
  } catch {
    /* ignore */
  }
}

/** This showing of /map as a view, if it is one: the note is kept at once, so a second tab opened meanwhile does not count it too. */
export function countMapView(now = Date.now()): void {
  try {
    if (!person()) return;
    let stored: MapSeen | null = null;
    try {
      stored = readMapSeen(localStorage.getItem(MAP_SEEN_KEY));
    } catch {
      /* no storage (a private window): the note in memory */
    }
    const seen = [stored, seenHere].reduce<MapSeen | null>((a, b) => (b && (!a || b.at > a.at) ? b : a), null);
    const plan = planMapView(seen, now);
    if (!plan.send) return;
    seenHere = plan.next;
    try {
      localStorage.setItem(MAP_SEEN_KEY, JSON.stringify(plan.next));
    } catch {
      /* as above */
    }
    send("view", plan.unique);
  } catch {
    /* ignore */
  }
}

/**
 * Count the view once /map is up and on screen (never a prerender or a
 * background tab), when the browser is idle, so the map never waits for
 * it. Returns the cleanup for the page's effect.
 */
export function countMapViewWhenShown(): () => void {
  let off = false;
  let idle: number | null = null;
  const go = () => {
    if (off || document.visibilityState !== "visible") return;
    document.removeEventListener("visibilitychange", go);
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) idle = w.requestIdleCallback(() => countMapView(), { timeout: 3_000 });
    else setTimeout(() => !off && countMapView(), 0);
  };
  document.addEventListener("visibilitychange", go);
  go();
  return () => {
    off = true;
    document.removeEventListener("visibilitychange", go);
    const w = window as Window & { cancelIdleCallback?: (id: number) => void };
    if (idle !== null) w.cancelIdleCallback?.(idle);
  };
}

/**
 * A link tapped on /map: counted when it opens a turf's or a game's page (a card, in the list or over the map).
 * A card tapped on the list before the map came up brings its view along (the note makes that nothing once counted).
 */
export function countMapTap(href: string, now = Date.now()): void {
  try {
    if (!person() || !mapCardKind(href, window.location.origin)) return;
    countMapView(now);
    if (lastTap && lastTap.href === href && now - lastTap.at >= 0 && now - lastTap.at < TAP_AGAIN_MS) return;
    lastTap = { href, at: now };
    send("tap");
  } catch {
    /* ignore */
  }
}

/** A turf page's "This turf on the map" tapped open. */
export function countMiniMapOpen(): void {
  try {
    if (person()) send("mini");
  } catch {
    /* ignore */
  }
}
