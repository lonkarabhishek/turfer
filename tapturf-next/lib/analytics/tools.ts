import { hasSignIn, signInKnown, signInToken, type TokenCheck } from "../account/client";
import { gaParams, makeDeviceTag, DEVICE_RE, toolUseOf, toolUseBody, signedInInit, type ToolUse } from "../tools/usage";
import { analyticsAllowed } from "../consent";
import { gaEvent } from "./ga";

/**
 * GA4 events for the free cricket tools. Same gtag the rest of the
 * site uses; no new provider. Every event carries the tool name. A
 * tool's started and finished events are also logged for the admin
 * (lib/tools/usage.ts): the tool, the event, a few short tags, a live
 * link's code, and who: this device's sign-in, which the server verifies,
 * else a random device tag kept in this browser. The tag goes only with a
 * signed-out use and starts over on every sign-in and sign-out
 * (forgetToolDevice), so it is never tied to an account. The tag and the
 * GA events need Accept on the cookie banner (lib/consent.ts); without it
 * a guest's use is still counted, with no tag, and nothing is kept here.
 */
/** tool_action: a milestone inside a longer tool session, like an over or a wicket in the live scorer. */
export type ToolEvent = "tool_opened" | "tool_used" | "tool_result_generated" | "tool_cta_clicked" | "tool_action";

export function trackTool(event: ToolEvent, tool: string, params: Record<string, string | number | boolean> = {}) {
  if (typeof window === "undefined") return;
  gaEvent(event, { tool, ...gaParams(params) });
  const use = toolUseOf(event, tool, params);
  if (use) logUse(use);
}

const USE_URL = "/api/tools/use";
/** The guest tag's key; lib/consent.ts deletes it on Reject. */
export const TOOL_DEVICE_KEY = "tt_tools_device";
/** A sign-in token that takes longer than this (a cold Firebase load) makes the use a guest's. */
const TOKEN_WAIT_MS = 5_000;

/** This browser's random tag for a guest's uses, made once per signed-out spell; null without consent or when storage is blocked. */
function deviceTag(): string | null {
  if (!analyticsAllowed()) return null;
  try {
    const kept = localStorage.getItem(TOOL_DEVICE_KEY);
    if (kept && DEVICE_RE.test(kept)) return kept;
    const tag = makeDeviceTag(crypto.getRandomValues(new Uint8Array(12)));
    localStorage.setItem(TOOL_DEVICE_KEY, tag);
    return tag;
  } catch {
    return null;
  }
}

/**
 * Start the guest tag over: AuthProvider calls it on every sign-in and
 * sign-out, so the uses before signing in, and after signing out, never
 * share a tag with each other or with the account's.
 */
export function forgetToolDevice(): void {
  try {
    localStorage.removeItem(TOOL_DEVICE_KEY);
  } catch {
    /* ignore */
  }
}

function beacon(body: string) {
  if (navigator.sendBeacon?.(USE_URL, new Blob([body], { type: "application/json" }))) return;
  void fetch(USE_URL, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
}

const tokenSoon = (): Promise<TokenCheck> =>
  Promise.race([signInToken(), new Promise<TokenCheck>((resolve) => setTimeout(() => resolve({ unknown: true }), TOKEN_WAIT_MS))]);

/**
 * One use to /api/tools/use, never in the way of the tool. Signed out: a
 * beacon at once with the guest tag, so it survives the page closing.
 * Signed in: the sign-in token can't ride a beacon, so a keepalive fetch
 * carries it, and no guest tag goes with it; no token in time, and it goes
 * as a guest's with no tag (and the server keeps no live link code for a
 * guest), so nothing ties it to the account or to this browser's tag.
 * While AuthProvider is still reading this device's sign-in (a Google
 * session refreshing on a cold load, a scorecard handed over from the live
 * scorer right after mount), the use waits for that, as long as a token
 * may take; still unknown then, and it goes as a guest's with no tag.
 */
function logUse(use: ToolUse) {
  try {
    if (hasSignIn() !== null) return sendUse(use);
    void signInKnown(TOKEN_WAIT_MS)
      .then(() => sendUse(use))
      .catch(() => {});
  } catch {
    /* ignore */
  }
}

function sendUse(use: ToolUse) {
  try {
    const signedIn = hasSignIn();
    if (signedIn === false) return beacon(toolUseBody(use, deviceTag()));
    const body = toolUseBody(use, null);
    if (signedIn === null) return beacon(body);
    void tokenSoon()
      .then((t) => ("token" in t ? fetch(USE_URL, signedInInit(body, t.token)).then(() => {}) : beacon(body)))
      .catch(() => {});
  } catch {
    /* ignore */
  }
}
