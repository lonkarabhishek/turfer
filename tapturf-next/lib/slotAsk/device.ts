import { DRAFT_KEY, askBody, readDraft, type AskDraft, type SlotAsk } from "./ask";

/**
 * The browser's side of "Ask for a slot": the ask sent to
 * POST /api/slot-ask as the tap opens WhatsApp, and the choice a
 * signed-out player made, kept in this tab while they sign in
 * (lib/slotAsk/ask.ts says what both are). Every storage read and write
 * is in a try: with storage blocked nothing is kept and the player picks
 * again. Relative imports only.
 */

/**
 * Store one ask. Sent with keepalive, so it finishes while WhatsApp takes
 * the screen; never awaited, and a failure changes nothing the player sees
 * (WhatsApp has opened either way).
 */
export function sendSlotAsk(a: SlotAsk): void {
  if (typeof window === "undefined") return;
  try {
    void fetch("/api/slot-ask", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify(askBody(a)) }).catch(() => {});
  } catch {
    /* not stored: nothing else changes */
  }
}

/** Keep what a signed-out player picked while they sign in. False when it could not be kept. */
export function saveDraft(d: AskDraft): boolean {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

/** The choice kept for this turf, if it is still good. */
export function loadDraft(turf: string, now: number): AskDraft | null {
  if (typeof window === "undefined") return null;
  try {
    return readDraft(window.sessionStorage.getItem(DRAFT_KEY), turf, now);
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nothing kept */
  }
}
