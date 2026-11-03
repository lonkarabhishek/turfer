import { hasSignIn, signInKnown, signInToken, type TokenCheck } from "../account/client";

/**
 * How TapTurf's own anonymous counts leave the browser (the map's,
 * lib/map/track.ts, and the traffic counter's, lib/traffic/track.ts): one
 * small JSON body, after the fact and never waited on. A beacon when
 * signed out (it survives the page going); a keepalive fetch with the
 * sign-in when signed in (a beacon can't carry it), read quietly as the
 * free tools do, so it never signs anyone out; no token in time and it goes
 * as a guest's. While AuthProvider is still reading this device's sign-in,
 * it waits for that, as long as a token may take. Nothing is kept on the
 * device; same-origin only, no third-party request.
 */

/** A sign-in token (or AuthProvider's first answer) that takes longer than this (a cold Firebase load) makes the event a guest's. */
export const TOKEN_WAIT_MS = 5_000;

function beacon(url: string, body: string) {
  try {
    if (navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) return;
  } catch {
    /* a browser that refuses the beacon: the fetch below */
  }
  void fetch(url, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true, cache: "no-store" }).catch(() => {});
}

const tokenSoon = (): Promise<TokenCheck> =>
  Promise.race([signInToken(), new Promise<TokenCheck>((resolve) => setTimeout(() => resolve({ unknown: true }), TOKEN_WAIT_MS))]);

function sendNow(url: string, body: string) {
  try {
    if (hasSignIn() !== true) return beacon(url, body);
    void tokenSoon()
      .then((t) =>
        "token" in t
          ? fetch(url, { method: "POST", body, keepalive: true, cache: "no-store", headers: { "content-type": "application/json", Authorization: `Bearer ${t.token}` } }).then(() => {})
          : beacon(url, body),
      )
      .catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Send one count to this site's own route. Never throws, never in the way. */
export function sendCount(url: string, body: string): void {
  try {
    if (hasSignIn() !== null) return sendNow(url, body);
    void signInKnown(TOKEN_WAIT_MS)
      .then(() => sendNow(url, body))
      .catch(() => {});
  } catch {
    /* ignore */
  }
}
