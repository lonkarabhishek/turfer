import { hasSignIn, signInToken, type TokenCheck } from "../account/client";
import { gaParams, makeDeviceTag, DEVICE_RE, toolUseOf, toolUseBody, signedInInit, type ToolUse } from "../tools/usage";

/**
 * GA4 events for the free cricket tools. Same gtag the rest of the
 * site uses; no new provider. Every event carries the tool name. A
 * tool's started and finished events are also logged for the admin
 * (lib/tools/usage.ts): the tool, the event, a few short tags, a live
 * link's code, and who: this device's sign-in, which the server verifies,
 * else a random device tag kept in this browser.
 */
/** tool_action: a milestone inside a longer tool session, like an over or a wicket in the live scorer. */
export type ToolEvent = "tool_opened" | "tool_used" | "tool_result_generated" | "tool_cta_clicked" | "tool_action";

export function trackTool(event: ToolEvent, tool: string, params: Record<string, string | number | boolean> = {}) {
  if (typeof window === "undefined") return;
  try {
    const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    gtag?.("event", event, { tool, ...gaParams(params) });
  } catch {
    /* ignore */
  }
  const use = toolUseOf(event, tool, params);
  if (use) logUse(use);
}

const USE_URL = "/api/tools/use";
const DEVICE_KEY = "tt_tools_device";
/** A sign-in token that takes longer than this (a cold Firebase load) makes the use a guest's. */
const TOKEN_WAIT_MS = 5_000;

/** This browser's random tag for a guest's uses, made once; null when storage is blocked. */
function deviceTag(): string | null {
  try {
    const kept = localStorage.getItem(DEVICE_KEY);
    if (kept && DEVICE_RE.test(kept)) return kept;
    const tag = makeDeviceTag(crypto.getRandomValues(new Uint8Array(12)));
    localStorage.setItem(DEVICE_KEY, tag);
    return tag;
  } catch {
    return null;
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
 * beacon at once, so it survives the page closing. Signed in: the sign-in
 * token can't ride a beacon, so a keepalive fetch carries it; no token in
 * time, and it goes as a guest's.
 */
function logUse(use: ToolUse) {
  try {
    const body = toolUseBody(use, deviceTag());
    if (!hasSignIn()) return beacon(body);
    void tokenSoon()
      .then((t) => ("token" in t ? fetch(USE_URL, signedInInit(body, t.token)).then(() => {}) : beacon(body)))
      .catch(() => {});
  } catch {
    /* ignore */
  }
}
