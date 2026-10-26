/**
 * Ask's "nothing matched, so widen the search" step, kept free of the
 * turf types and the Claude client so it can be tested on its own
 * (lib/ai/relax.test.ts). applyAskFilters builds the steps.
 */

export type RelaxStep<T> = { key: string; keep: (row: T) => boolean };

/**
 * Rows that pass every active step. When none do, drop steps in
 * `dropOrder` (softest first) until some row passes. Then put back,
 * most important first, each step dropped before the last one that
 * still leaves rows.
 *
 * Without that second pass, "football under ₹1,000 in Kothrud" (no
 * football turf in Kothrud on 26 Oct) dropped the budget first, then the
 * area, and listed Pune football turfs of any price as if none in Pune
 * listed a rate under ₹1,000. The budget only went because the area was
 * empty; once the area is widened it applies again.
 */
export function relaxSteps<T>(
  all: readonly T[],
  steps: readonly RelaxStep<T>[],
  dropOrder: readonly string[],
): { matched: T[]; relaxed: string[] } {
  const active = new Set(steps.map((s) => s.key));
  const run = () => all.filter((row) => steps.every((s) => !active.has(s.key) || s.keep(row)));
  const relaxed: string[] = [];
  let matched = run();
  while (matched.length === 0) {
    const next = dropOrder.find((k) => active.has(k));
    if (!next) break;
    active.delete(next);
    relaxed.push(next);
    matched = run();
  }
  // The last step dropped is the one that made rows appear: putting it
  // back would empty them again, so only the earlier ones are tried.
  if (matched.length > 0) {
    for (const key of relaxed.slice(0, -1).reverse()) {
      active.add(key);
      const kept = run();
      if (kept.length > 0) {
        matched = kept;
        relaxed.splice(relaxed.indexOf(key), 1);
      } else {
        active.delete(key);
      }
    }
  }
  return { matched, relaxed };
}

function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

export type WidenedReplyInput = {
  /** Keys applyAskFilters had to drop, as relaxSteps returns them. */
  relaxed: readonly string[];
  /** The budget the player gave, per hour. */
  maxPrice: number | null;
  /** The cards are sorted cheapest first (sort price_low). */
  cheapestFirst: boolean;
  /** Areas as the player typed them. */
  areas: readonly string[];
  /** The city the search stayed in ("Nashik"), or null. */
  city: string | null;
  /** The visitor's own city when the search was scoped to it ("Pune"), or null. */
  prefCity: string | null;
  /** A narrow sport that fell back to a wider one: what was missing and what is shown. */
  narrowed: { none: string; instead: string } | null;
};

/**
 * The reply when the search had to be widened, so it doesn't promise what
 * the cards don't have ("Here are football turfs in Kothrud under ₹1,000"
 * over Wakad turfs at ₹1,500). Null when nothing the reply speaks to
 * was dropped: the parsed reply stands.
 */
export function widenedReply(i: WidenedReplyInput): string | null {
  const out: string[] = [];
  const price = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  if (i.narrowed && i.relaxed.includes("narrow_sport")) {
    out.push(`No ${i.narrowed.none} are listed${i.city ? ` in ${i.city}` : ""} yet, so here are ${i.narrowed.instead} instead.`);
  } else if (i.relaxed.includes("area") && i.areas.length > 0) {
    out.push(`Nothing in ${listJoin([...i.areas])} matched, so here are matches from ${i.city ? `the rest of ${i.city}` : "other areas"}.`);
  } else if (i.relaxed.includes("pref_city") && i.prefCity) {
    out.push(`Nothing in ${i.prefCity} matched, so here are matches from other cities.`);
  }
  if (i.relaxed.includes("price") && i.maxPrice != null) {
    out.push(
      `None of ${out.length ? "these" : "the matching turfs"} list a rate under ${price(i.maxPrice)} an hour yet${
        i.cheapestFirst ? ", so the lowest listed rates come first" : ""
      }. Check the rate with the turf.`,
    );
  }
  return out.length ? out.join(" ") : null;
}
