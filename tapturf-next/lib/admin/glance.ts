import { addBuckets, defaultWindow, floorTo, totals, type TrendWindow } from "./trend";
import { claimTime, type ClaimCounts } from "./claimed";
import type { AdminClaim } from "./claims";

/**
 * The admin home's "at a glance" numbers, from rows it already reads: the
 * sign-ups today, in the last 7 and in the last 30 days as the sign-ups
 * chart counts them (India days, everyone in its list), each set against
 * the stretch just before up to the same point in time, as the chart does
 * (lib/admin/trend.ts totals); and the turfs whose owner claim went
 * through in the last 7 days. Pure; relative imports only (npm run test:trend).
 */

const DAY = 86_400_000;

/** A count and the one it is set against (null: nothing before it to compare). */
export type GlanceCount = { total: number; previous: number | null };

export type SignupGlance = { today: GlanceCount; week: GlanceCount; month: GlanceCount };

/** times: every sign-up, sorted ascending (epoch ms). */
export function signupGlance(times: readonly number[], now: number): SignupGlance {
  const of = (w: TrendWindow): GlanceCount => {
    const t = totals(times, w, now);
    return { total: t.total, previous: t.previous };
  };
  // Today so far against yesterday up to this time: the chart's view of today at 6 hours.
  const today: TrendWindow = { level: "6h", start: floorTo("day", now), end: addBuckets("day", now, 1), span: { level: "day", n: 1 }, label: "Today" };
  // The chart's "Last 7 days" (6 hr) and "Last 30 days" (Day) views: whole India days, today the last.
  return { today: of(today), week: of(defaultWindow("6h", now, null)), month: of(defaultWindow("day", now, null)) };
}

/** "+3", "−2" or "±0" against the stretch before; null when there is none. */
export function deltaText(c: GlanceCount): string | null {
  if (c.previous === null) return null;
  const d = c.total - c.previous;
  return `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d).toLocaleString("en-IN")}`;
}

/**
 * Turfs whose owner claim went through in the last 7 days: turfs with an
 * active claim whose first active claim (by when it went active) is that
 * recent. A second manager added to a turf claimed before is not new.
 */
export function claimedThisWeek(claims: readonly AdminClaim[], now: number): number {
  const first = new Map<string, number>();
  for (const c of claims) {
    if (c.status !== "active") continue;
    const t = claimTime(c);
    if (t === null) continue;
    first.set(c.turfId, Math.min(first.get(c.turfId) ?? Infinity, t));
  }
  // A turf with an active claim of unknown time counts as claimed before: never as new.
  for (const c of claims) if (c.status === "active" && claimTime(c) === null) first.set(c.turfId, -Infinity);
  return [...first.values()].filter((t) => t >= now - 7 * DAY).length;
}

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/** The owner-claims fold's line, on the server and after the panel reloads its claims. */
export function claimsLine(c: ClaimCounts): string {
  return `${count(c.turfs, "turf")} claimed · ${count(c.people, "person", "people")} managing · ${c.waiting ? `${count(c.waiting, "claim")} to approve` : "none waiting"}`;
}
