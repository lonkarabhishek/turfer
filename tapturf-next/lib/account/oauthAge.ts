/**
 * The browser's own read of a Supabase access token. Relative imports
 * only (npm run test:account).
 */

/**
 * Seconds since this Google session's own sign-in with Google (the
 * `amr` oauth timestamp of its access token), or null. Read without
 * checking the token: it only picks what to show (the server checks).
 */
export function oauthAgeS(googleToken: string, nowMs = Date.now()): number | null {
  const part = googleToken.split(".")[1];
  if (!part || part.length > 8_000) return null;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
    const amr = (JSON.parse(json) as { amr?: unknown }).amr;
    if (!Array.isArray(amr)) return null;
    let at: number | null = null;
    for (const e of amr) {
      const { method, timestamp } = (e ?? {}) as { method?: unknown; timestamp?: unknown };
      if (method === "oauth" && typeof timestamp === "number" && Number.isFinite(timestamp) && (at === null || timestamp > at)) at = timestamp;
    }
    return at === null ? null : Math.floor(nowMs / 1000) - at;
  } catch {
    return null;
  }
}
