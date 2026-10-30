import { decodeWeek, encodeWeek, weekOf, type Week } from "./openAt";
import type { AskTurfFacts } from "./ask";
import type { OpeningHours } from "../../types/turf";

/**
 * Router v10's data the Ask turf rows leave out (lib/queries/askFacts.ts
 * reads it): each active turf's hours and whether its owner confirmed its
 * prices, and how many live reports TapTurf players left on each, with
 * their stars. Only ids, weeks, counts and stars are kept: never a name, a
 * number or a word of a review. Pure, relative imports only, so npm run
 * test:ask runs it.
 */

/** One active turf, as lib/queries/askFacts.ts reads it. */
export type HourRow = {
  id: string;
  opening_hours: OpeningHours | null;
  start_time: string | null;
  end_time: string | null;
  is_24x7: boolean | null;
  price_owner_confirmed: boolean | null;
};

/**
 * What the data cache keeps: each distinct week once (encodeWeek), each
 * turf's by its index, and the turfs whose owner confirmed their prices
 * (price_owner_confirmed alone: the page shows them as the owner's only when
 * the turf is claimed and has real prices, which applyAskFilters reads off
 * Ask's own rows).
 */
export type HoursCopy = { weeks: string[]; turfs: Record<string, number>; owner: string[] };

export function hoursCopyFrom(rows: readonly HourRow[]): HoursCopy {
  const weeks: string[] = [];
  const index = new Map<string, number>();
  const turfs: Record<string, number> = {};
  const owner = new Set<string>();
  for (const r of rows) {
    if (r.price_owner_confirmed === true) owner.add(r.id);
    const w = weekOf(r);
    if (!w) continue;
    const key = encodeWeek(w);
    let i = index.get(key);
    if (i == null) {
      i = weeks.length;
      weeks.push(key);
      index.set(key, i);
    }
    turfs[r.id] = i;
  }
  return { weeks, turfs, owner: [...owner].sort() };
}

/** A live TapTurf player report, as lib/queries/askFacts.ts reads it (no author, no words): its stars, 1 to 5, when given. */
export type ReportRow = { id: string; turf_id: string | null; rating: number | null };

/** Per turf id: how many reports, and the sum and count of their stars (the average is what the players gave it). */
export type ReportsCopy = Record<string, { n: number; sum: number; rated: number }>;

/** Reports per turf id. The read pages by offset, so a row can come twice: each report counts once. */
export function reportsCopyFrom(rows: readonly ReportRow[]): ReportsCopy {
  const seen = new Set<string>();
  const out: ReportsCopy = {};
  for (const r of rows) {
    if (!r.turf_id || seen.has(r.id)) continue;
    seen.add(r.id);
    const c = (out[r.turf_id] ??= { n: 0, sum: 0, rated: 0 });
    c.n += 1;
    const stars = Number(r.rating);
    if (r.rating != null && Number.isFinite(stars) && stars >= 1 && stars <= 5) {
      c.sum += stars;
      c.rated += 1;
    }
  }
  return out;
}

const hoursMemo = new WeakMap<HoursCopy, { hours: Map<string, Week>; owner: Set<string> }>();
const reportsMemo = new WeakMap<ReportsCopy, { reports: Map<string, number>; stars: Map<string, number> }>();

/** The copies as applyAskFilters reads them, built once per copy; a copy that failed to load is null there. */
export function askTurfFacts(hours: HoursCopy | null, reports: ReportsCopy | null): AskTurfFacts {
  let h = hours ? hoursMemo.get(hours) : undefined;
  if (hours && !h) {
    const decoded = hours.weeks.map(decodeWeek);
    h = { hours: new Map(Object.entries(hours.turfs).map(([id, i]) => [id, decoded[i]])), owner: new Set(hours.owner) };
    hoursMemo.set(hours, h);
  }
  let r = reports ? reportsMemo.get(reports) : undefined;
  if (reports && !r) {
    const all = Object.entries(reports);
    r = { reports: new Map(all.map(([id, c]) => [id, c.n])), stars: new Map(all.filter(([, c]) => c.rated > 0).map(([id, c]) => [id, c.sum / c.rated])) };
    reportsMemo.set(reports, r);
  }
  return { hours: h?.hours ?? null, ownerPrices: h?.owner ?? null, reports: r?.reports ?? null, stars: r?.stars ?? null };
}
