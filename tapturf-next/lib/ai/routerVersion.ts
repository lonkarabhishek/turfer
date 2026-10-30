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

/**
 * The version, and whether the request is an eval ask (its x-ask-eval is
 * the key, whatever ASK_ROUTER_VERSION says). `env`: process.env
 * (ASK_ROUTER_VERSION, ASK_EVAL_KEY); `evalHeader`: the request's x-ask-eval.
 */
export function routerChoice(env: Readonly<Record<string, string | undefined>>, evalHeader: string | null | undefined): { version: RouterVersion; eval: boolean } {
  const key = (env.ASK_EVAL_KEY ?? "").trim();
  const isEval = !!key && !!evalHeader && sameSecret(key, evalHeader.trim());
  return { version: isEval || (env.ASK_ROUTER_VERSION ?? "").trim() === "10" ? 10 : 9, eval: isEval };
}

/** The version alone (routerChoice). */
export function routerVersion(env: Readonly<Record<string, string | undefined>>, evalHeader: string | null | undefined): RouterVersion {
  return routerChoice(env, evalHeader).version;
}

/**
 * The turfs an ask's log row says it showed (ask_queries.filters.shown_ids).
 * None for an eval ask: owner_dashboard counts shown_ids for myTapturf's
 * "Shown in Ask TapTurf", and the eval set's answers are no player's. The
 * row is marked _eval instead (the route), so admin readers can leave it out.
 */
export function loggedShownIds(ids: readonly string[], choice: { eval: boolean }): string[] {
  return choice.eval ? [] : [...ids];
}
