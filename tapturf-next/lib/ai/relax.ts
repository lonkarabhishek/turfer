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

/**
 * applyAskFilters' drop order when nothing matches, softest first.
 *
 * A search: sport and an explicit city stay. A narrow sport widens after
 * the area (nets elsewhere in Pune beat cricket grounds in Kothrud) but
 * before the visitor's own city (cricket grounds in Nashik beat nets in
 * Mumbai). Area and pref_city never both apply; an area with no city
 * stays in the visitor's ("area_city") until the area alone has rows
 * elsewhere ("Begur" from Nashik). relaxSteps puts back
 * what the widening made possible again, so a budget dropped for an
 * empty area still applies across the city.
 *
 * A named venue (`named`): the cards are the venues by that name, and
 * every filter is softer than the name, so a guessed sport (Kage lists
 * cricket, not box cricket) or a city the venue isn't in never swaps it
 * for other turfs. The visitor's city goes first, then the sport and
 * area the player gave, then the reading's city, then the city the
 * player named ("asked_city").
 */
export function dropOrder(needKeys: readonly string[], named: boolean): string[] {
  return named
    ? ["rating", ...needKeys, "open_24x7", "price", "pref_city", "narrow_sport", "sport", "area", "city", "asked_city"]
    : ["text", "rating", ...needKeys, "open_24x7", "price", "area_city", "area", "narrow_sport", "pref_city"];
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
  /** A venue name the player typed that matched no venue anywhere ("Circuit"), or null. */
  name?: string | null;
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
  // Not "Let me look up Circuit" over other turfs.
  const where = i.city ?? (i.relaxed.includes("pref_city") ? null : i.prefCity);
  if (i.name && i.relaxed.includes("text")) out.push(`No venue called ${i.name} is listed on TapTurf yet, so here are other turfs${where ? ` in ${where}` : ""}.`);
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

// ── A named venue: say which city it is in ──────────────────────────

/** A venue as a reply names it: city as a label ("Pune"), area if known. */
export type VenuePlace = { name: string; area?: string | null; city: string };

const placeOf = (v: VenuePlace) => (v.area && v.area.toLowerCase() !== v.city.toLowerCase() ? `${v.area}, ${v.city}` : v.city);

/** "Mumbai", "Mumbai and Pune", "Mumbai, Ballari, Malegaon and 4 more cities". */
function cityList(cities: string[]): string {
  if (cities.length <= 3) return listJoin(cities);
  const more = cities.length - 3;
  return `${cities.slice(0, 3).join(", ")} and ${more} more cit${more === 1 ? "y" : "ies"}`;
}

export type VenueReplyInput = {
  /** The name as typed, without filler or a city: "Prime Turf". */
  label: string;
  /** The cards, in order. */
  shown: readonly VenuePlace[];
  /** Where the player is or asked about (the city named, the reading's, the visitor's), as a label; null when unknown. */
  home: string | null;
  /** A city the player named that has none of them ("Hotfut in Nashik"), as a label. */
  asked: string | null;
  /**
   * Set when no venue by that name is in `home` (applyAskFilters'
   * closest): the names there closest to it, as the cards show them,
   * maybe none.
   */
  closest?: readonly string[] | null;
};

/** "No turf called Kage in Mumbai.": the venue named isn't in the player's city. */
export function noneIn(label: string, home: string): string {
  return `No turf called ${label} in ${home}.`;
}

/**
 * The reply over the venues a search named (applyAskFilters' named
 * path), when they are not where the player is: which city each is in,
 * plainly. Null when they are all in the player's city: the parsed
 * reply stands. "DN Parande Football And Cricket Turf is in Dhanori,
 * Pune." / "There's no Hotfut in Nashik on TapTurf yet. 4 venues match
 * Hotfut, all in Pune." / "11 venues match Prime Turf, in Mumbai,
 * Ballari, Malegaon and 6 more cities."
 *
 * With `closest` (none by that name in the player's city), in the order
 * the cards are: no turf by that name here, the closest names here,
 * then where it is. "No turf called Dribble Den in Hyderabad. Closest
 * here: Cricket Den and Sports Den. Dribble Den is in Begur, Bangalore."
 * / "No turf called Kage in Mumbai. It's in Pathardi, Nashik."
 */
export function venueReply(i: VenueReplyInput): string | null {
  if (!i.shown.length) return null;
  const cities = [...new Set(i.shown.map((v) => v.city))];
  if (i.closest && i.home) {
    const near = i.closest.length ? ` Closest here: ${listJoin([...new Set(i.closest)])}.` : "";
    const where = i.shown.length === 1 ? placeOf(i.shown[0]) : cityList(cities);
    // After the closest names, "it" would be the last of them: name it again.
    const it = !near ? "It's" : `${i.shown.length === 1 ? i.shown[0].name : i.label} is`;
    return `${noneIn(i.label, i.home)}${near} ${it} in ${where}.`;
  }
  if (!i.asked && i.home && cities.length === 1 && cities[0] === i.home) return null;
  const lead = i.asked && !cities.includes(i.asked) ? `There's no ${i.label} in ${i.asked} on TapTurf yet. ` : "";
  if (i.shown.length === 1) return `${lead}${i.shown[0].name} is in ${placeOf(i.shown[0])}.`;
  const n = i.shown.length;
  return `${lead}${n} venues match ${i.label}, ${cities.length === 1 ? `all in ${cities[0]}` : `in ${cityList(cities)}`}.`;
}

/**
 * A name no venue has, over the closest names in the player's city
 * (closestNames, at least one): "No turf called Circuit on TapTurf yet.
 * Closest in Pune: Circuit House Arena."
 */
export function nowhereReply(name: string, home: string, closest: readonly string[]): string {
  return `No turf called ${name} on TapTurf yet. Closest in ${home}: ${listJoin([...new Set(closest)])}.`;
}

/** Headings over the rows of cards, in the reply's order: the closest names in the player's city, then the venues by the name typed. */
export type CardRow = { label: string; count: number };

/** The two rows for venueReply's `closest` (null without close names: one row, as before). */
export function venueRows(label: string, home: string, closest: number, shown: readonly VenuePlace[]): CardRow[] | null {
  if (!closest || !shown.length) return null;
  const cities = [...new Set(shown.map((v) => v.city))];
  const name = new Set(shown.map((v) => v.name)).size === 1 ? shown[0].name : label;
  return [
    { label: `Closest in ${home}`, count: closest },
    { label: `${name} in ${cities.length === 1 ? cities[0] : "other cities"}`, count: shown.length },
  ];
}

/**
 * For a question about one venue: which one it is, when it isn't in the
 * player's city or the name is shared ("It's the one in Marol, Mumbai.
 * There's also a Prime Turf in Ballari and Malegaon."). Null otherwise.
 * `others`: cities (labels) of other venues with exactly this name.
 */
export function venueLine(v: VenuePlace, home: string | null, others: readonly string[]): string | null {
  const also = [...new Set(others)].filter((c) => c !== v.city);
  if (also.length) return `It's the one in ${placeOf(v)}. There's also a ${v.name} in ${cityList(also)}.`;
  return v.city !== home ? `It's in ${placeOf(v)}.` : null;
}

/** For a comparison: where each venue is, when they aren't all in the player's city. */
export function citiesLine(venues: readonly VenuePlace[], home: string | null): string | null {
  const cities = [...new Set(venues.map((v) => v.city))];
  if (venues.length < 2 || (cities.length === 1 && cities[0] === home)) return null;
  if (cities.length === 1) return `${venues.length === 2 ? "Both are" : "All are"} in ${cities[0]}.`;
  return `${listJoin(venues.map((v) => `${v.name} is in ${v.city}`))}.`;
}
