import { applyAskFilters, NO_EXTRAS, type AskReading } from "../ai/ask";
import type { SportBandMap } from "../utils/cardSport";
import type { Turf } from "../../types/turf";

// Relative imports only, so npm run test:ask runs this (lib/ask/freeHours.test.ts).

/**
 * Ask TapTurf's free hours answer to a list (lib/ask/freeHours.ts planFree)
 * with the reading's other filters: "free turf under ₹1,500 tonight",
 * "covered turf free tomorrow", "24 hour turf free tonight". The turfs
 * with hours marked free in the place and sport asked are kept only when
 * they also meet those filters as a turf search keeps them
 * (lib/ai/ask.ts applyAskFilters), with nothing dropped to find one: a
 * free hours answer never shows a turf over the budget asked for under
 * an "Under ₹1,500" chip. The place, the sport and the time are
 * planFree's own (the free window, not the hours a turf lists).
 */

/** Whether the reading asks for anything a free hours answer filters by besides the place, sport and time. */
export function freeFiltersAsked(f: AskReading): boolean {
  return f.max_price_per_hour != null || f.min_rating != null || f.open_24x7 || f.needs.length > 0 || f.with_photos === true;
}

/**
 * The ids of `turfs` (each with hours marked free in the place asked) that
 * meet the reading's budget, rating, facilities, 24 hours and photos, as a
 * turf search reads them (the sport's price with its bands when given):
 * every one asked, none dropped. Null when none is asked.
 */
export function freeKeep(turfs: readonly Turf[], f: AskReading, opts: { bands?: SportBandMap | null } = {}): Set<string> | null {
  if (!freeFiltersAsked(f)) return null;
  if (!turfs.length) return new Set();
  const asked: AskReading = {
    ...f,
    intent: "find_turf",
    // The place and time are the free answer's own; no venue name, area or words to search by.
    city: null,
    areas: [],
    turf_names: [],
    free_text: null,
    time: null,
    when: null,
    wants_nearby: false,
    sort: "rating",
    // Router v10's: photos only (no other read here); every free turf is claimed, and the hours are the owner's marks.
    ...NO_EXTRAS,
    with_photos: f.with_photos === true,
  };
  const r = applyAskFilters([...turfs], asked, { limit: turfs.length, sportPrices: { bands: opts.bands ?? null, times: null } });
  // A filter dropped to find any: none meets them all ("narrow_sport" is the sport's wider family, as a search widens it).
  if (r.relaxed.some((k) => k !== "narrow_sport")) return new Set();
  return new Set(r.turfs.map((t) => t.id));
}
