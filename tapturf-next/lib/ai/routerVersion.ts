import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Which reading of the sentence Ask uses: v9 (what production runs) or
 * v10 (lib/ai/ask.ts AskFiltersV10: claimed, owner prices, photos, player
 * reviews, open at a time, free and turf-booked games). v10 is off by
 * default. It is on for every request when ASK_ROUTER_VERSION is "10", and
 * for one request when its x-ask-eval header is ASK_EVAL_KEY, so the real
 * model can be graded on production (scripts/ask-eval) before anyone sees
 * it. With no ASK_EVAL_KEY set (or an empty one) the header does nothing.
 * Relative imports only (npm run test:ask).
 */

export type RouterVersion = 9 | 10;

export const EVAL_HEADER = "x-ask-eval";

/** Equal, in time that doesn't depend on where they differ: both are hashed first, so their lengths never show either. */
function sameSecret(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

/** `env`: process.env (ASK_ROUTER_VERSION, ASK_EVAL_KEY); `evalHeader`: the request's x-ask-eval. */
export function routerVersion(env: Readonly<Record<string, string | undefined>>, evalHeader: string | null | undefined): RouterVersion {
  if ((env.ASK_ROUTER_VERSION ?? "").trim() === "10") return 10;
  const key = (env.ASK_EVAL_KEY ?? "").trim();
  if (!key || !evalHeader) return 9;
  return sameSecret(key, evalHeader.trim()) ? 10 : 9;
}
