import type { DailyAllowance } from "./types";

/**
 * One new report a day (supabase/migrations/20261101_reviews_policy.sql,
 * private.review_daily): one, or one for each turf the player played a
 * TapTurf game at that day, India time. Edits never count. The words the
 * sheet uses, and review_mine's daily key read safely. Pure.
 */

/** On the sheet's first and last screens: reports come from people who played. */
export const PLAYED_HERE_LINE = "Only review a turf you have actually played at.";

/** The rule, as the sheet says it. */
export const DAILY_RULE = "You can post one review a day. Played at more than one turf today? Each one you played at counts.";

const count = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : null);

/** review_mine's daily key; null when it's missing (a database from before the rule) or malformed. */
export function toDaily(x: unknown): DailyAllowance | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const allowed = count(o.allowed);
  const posted = count(o.posted);
  const played = count(o.played);
  if (allowed === null || allowed < 1 || posted === null || played === null || typeof o.full !== "boolean") return null;
  return { allowed, posted, played, full: o.full };
}

/**
 * What the sheet says when a new report would be over the day's limit: the
 * rule, or, for someone who played at two or more turfs today, that they have
 * posted that many. The count is all the rule checks (not which turfs the
 * reports were on), so the words say no more than that. Then that the
 * answers wait on this phone.
 */
export function dailyMessage(d: { allowed?: number | null; played?: number | null } | null): string {
  const allowed = d?.allowed ?? 1;
  const head = allowed >= 2 && (d?.played ?? 0) >= 2 ? `You've posted today's ${allowed} reviews (you played at ${allowed} turfs today).` : DAILY_RULE;
  return `${head} Your answers stay on this phone, so you can post tomorrow.`;
}
