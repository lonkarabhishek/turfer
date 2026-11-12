import type { Kind } from "./outcome";
import { MEMORY_KEY, TAP_KEY, newTap, readMemory, readTap, type Memory, type Tap } from "./prompt";

/**
 * The device's side of "Did you get a slot?" (lib/outcome/prompt.ts has the
 * rules): the tap this tab waits to ask about in sessionStorage, and the
 * marks that keep the card from nagging in localStorage. First-party, no
 * identifier, never sent anywhere, and not behind the cookie banner (it is
 * the site's own working memory, like a closed banner). Every read and
 * write is in a try: with storage blocked nothing is remembered and nothing
 * is ever asked. Relative imports only.
 */

function get(store: "session" | "local", key: string): string | null {
  try {
    return (store === "session" ? window.sessionStorage : window.localStorage).getItem(key);
  } catch {
    return null;
  }
}

function put(store: "session" | "local", key: string, value: string | null): boolean {
  try {
    const s = store === "session" ? window.sessionStorage : window.localStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Note a Call or WhatsApp tap that opened the dialer or WhatsApp, for the
 * card to ask about when the player is back. Called from
 * logContactClick (lib/analytics/contactClicks.ts), the one place every
 * such tap goes through. Never throws, never waits.
 */
export function rememberContactTap(t: { turfId: string; turfName: string; kind: Kind; source: string; signedIn: boolean }): void {
  if (typeof window === "undefined") return;
  try {
    const tap = newTap({ turf: t.turfId, name: t.turfName, kind: t.kind, source: t.source, signedIn: t.signedIn }, Date.now());
    if (tap) put("session", TAP_KEY, JSON.stringify(tap));
  } catch {
    /* nothing remembered: nothing asked */
  }
}

export function loadTap(): Tap | null {
  if (typeof window === "undefined") return null;
  const text = get("session", TAP_KEY);
  const tap = readTap(text);
  if (text && !tap) put("session", TAP_KEY, null);
  return tap;
}

export function saveTap(tap: Tap | null): void {
  if (typeof window === "undefined") return;
  put("session", TAP_KEY, tap ? JSON.stringify(tap) : null);
}

/** The device's marks; `ok` false when storage can't be read, and then nothing is asked (a snooze could not be kept). */
export function loadMemory(now: number): { memory: Memory; ok: boolean } {
  let text: string | null = null;
  let ok = false;
  try {
    text = window.localStorage.getItem(MEMORY_KEY);
    ok = true;
  } catch {
    /* blocked */
  }
  return { memory: readMemory(text, now), ok };
}

/** False when the marks could not be kept. */
export function saveMemory(m: Memory): boolean {
  if (typeof window === "undefined") return false;
  return put("local", MEMORY_KEY, JSON.stringify(m));
}
