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
 * "Near me" with the visitor's location: how far from them the cards may
 * be, in km, each tried in turn until NEARBY_MIN match. Never all of
 * India: on 30 Oct "cheapest football turf near me" from Pune listed
 * venues in Hyderabad, Bangalore and Delhi, 493 to 1,161 km away.
 */
export const NEARBY_KM = [25, 50, 100] as const;
export const NEARBY_MIN = 3;

/**
 * relaxSteps over the rows within NEARBY_KM of the visitor, widening to
 * the next radius only while fewer than NEARBY_MIN match (after the usual
 * widening inside it), whatever the sort. A row with no location is never
 * near. A radius past the first is said first in `relaxed` ("near:50",
 * nearbyLabel); nothing within the last one gives none.
 */
export function relaxNearby<T>(
  all: readonly T[],
  steps: readonly RelaxStep<T>[],
  dropOrder: readonly string[],
  km: (row: T) => number | null | undefined,
): { matched: T[]; relaxed: string[] } {
  const dist = new Map<T, number>();
  for (const row of all) {
    const d = km(row);
    if (d != null && Number.isFinite(d) && d <= NEARBY_KM[NEARBY_KM.length - 1]) dist.set(row, d);
  }
  const near = [...dist.keys()];
  let out: { matched: T[]; relaxed: string[] } = { matched: [], relaxed: [] };
  let radius: number = NEARBY_KM[0];
  for (const r of NEARBY_KM) {
    radius = r;
    out = relaxSteps(near.filter((row) => dist.get(row)! <= r), steps, dropOrder);
    if (out.matched.length >= NEARBY_MIN) break;
  }
  return { matched: out.matched, relaxed: radius > NEARBY_KM[0] ? [`near:${radius}`, ...out.relaxed] : out.relaxed };
}

/** A radius relaxNearby widened to, for the "after widening ..." line: "the distance to 50 km". Null for any other key. */
export function nearbyLabel(key: string): string | null {
  const m = /^near:(\d+)$/.exec(key);
  return m ? `the distance to ${m[1]} km` : null;
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

/**
 * Its area and city, or the city alone when the area adds nothing: the
 * city again ("Kudasan, Gandhinagar" in Gandhinagar is Kudasan), or no
 * place at all ("Near", "PIN 395013", "near global Indian international school").
 */
function placeOf(v: VenuePlace): string {
  let area = (v.area ?? "").trim();
  const tail = /,\s*([^,]+)$/.exec(area);
  if (tail && tail[1].trim().toLowerCase() === v.city.toLowerCase()) area = area.slice(0, tail.index).trim();
  if (area.toLowerCase() === v.city.toLowerCase() || /^(?:near|opp|opposite|pin)\b|^\d/i.test(area)) area = "";
  return area ? `${area}, ${v.city}` : v.city;
}

/** The words typed, starting a sentence or a heading: "dhaneri" is Dhaneri. */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const TIMES = ["", "", "two", "three"];
/**
 * Card names as a reply lists them, in order: a name on two cards once
 * ("two venues called Huddle Arena"), and semicolons between the names
 * when one has a comma of its own ("Players Turf, Mahakali Caves;
 * PLAYERS TURF -PPS BHANDUP; and Players Turf At Saki Naka").
 */
function namesList(names: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  const items = [...counts].map(([n, k]) => (k > 1 ? `${TIMES[k] ?? k} venues called ${n}` : n));
  if (items.length < 3 || !items.some((x) => x.includes(","))) return listJoin(items);
  return `${items.slice(0, -1).join("; ")}; and ${items.at(-1)}`;
}

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
  /**
   * The cards have the name typed, whole ("Dribble Den", "dribble den
   * price"), not only part of it ("Kage" for Kage Multisport Turf,
   * "Thunder Arena" for Thunderbird turf). Only with `closest`.
   */
  whole?: boolean;
};

/** "No turf called Kage in Mumbai.": the venue named isn't in the player's city. */
export function noneIn(label: string, home: string): string {
  return `No turf called ${label} in ${home}.`;
}

const article = (s: string) => (/^[aeiou]/i.test(s) ? "an" : "a");

/** The cards' names, one each however written ("Kick Off Turf" and "KICK OFF TURF" are one). */
const namesOf = (shown: readonly VenuePlace[]) => shown.map((v) => v.name).filter((n, i, all) => all.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i);

/**
 * The reply over the venues a search named (applyAskFilters' named
 * path): which city each is in, plainly. "DN Parande Football And
 * Cricket Turf is in Dhanori, Pune." / "There's no Hotfut in Nashik on
 * TapTurf yet. 4 venues match Hotfut, all in Pune." / "11 venues match
 * Prime Turf, in Mumbai, Ballari, Malegaon and 6 more cities." Also when
 * they are all in the player's city, not the parsed reply: the model
 * wrote "Let me find Hotfut in Gachibowli." over the card (28 Oct).
 *
 * With `closest` (none by that name in the player's city), in the order
 * the cards are: no turf by that name here, the closest names here,
 * then where it is. The name said is the venues' own when they have it
 * whole and share it, and "It's" is only ever that venue; other names
 * are similar names. "No turf called Dribble Den in Hyderabad. Closest
 * here: Cricket Den and Sports Den. Dribble Den is in Begur, Bangalore."
 * / "No turf called Huddle Arena in Pune. There's one in Vadodara and
 * Mumbai." / "No turf called Kage in Mumbai. Kage Multisport Turf is in
 * Pathardi, Nashik." / "No turf called Thunder Arena in Hyderabad.
 * Similar names are in Kolhapur and Nagercoil."
 */
export function venueReply(i: VenueReplyInput): string | null {
  if (!i.shown.length) return null;
  const cities = [...new Set(i.shown.map((v) => v.city))];
  if (i.closest && i.home) {
    const names = namesOf(i.shown);
    const same = !!i.whole && names.length === 1;
    // Written as typed when a card has it so ("Prime Turf" over Ballari's "Prime turf").
    const called = same ? (i.shown.find((v) => v.name === i.label)?.name ?? names[0]) : cap(i.label);
    const near = i.closest.length ? ` Closest here: ${namesList(i.closest)}.` : "";
    const one = i.shown.length === 1 ? i.shown[0] : null;
    // After the closest names, "it" would be the last of them: name it again.
    const where = one
      ? `${same && !near ? "It's" : `${one.name} is`} in ${placeOf(one)}.`
      : same
        ? `There's ${near ? `${article(called)} ${called}` : "one"} in ${cityList(cities)}.`
        : `Similar names are in ${cityList(cities)}.`;
    return `${noneIn(called, i.home)}${near} ${where}`;
  }
  const label = cap(i.label);
  const lead = i.asked && !cities.includes(i.asked) ? `There's no ${label} in ${i.asked} on TapTurf yet. ` : "";
  if (i.shown.length === 1) return `${lead}${i.shown[0].name} is in ${placeOf(i.shown[0])}.`;
  const n = i.shown.length;
  return `${lead}${n} venues match ${label}, ${cities.length === 1 ? `all in ${cities[0]}` : `in ${cityList(cities)}`}.`;
}

/**
 * A name no venue has, over the closest names in the player's city
 * (closestNames, at least one): "No turf called Circuit on TapTurf yet.
 * Closest in Pune: Circuit House Arena."
 */
export function nowhereReply(name: string, home: string, closest: readonly string[]): string {
  return `No turf called ${cap(name)} on TapTurf yet. Closest in ${home}: ${namesList(closest)}.`;
}

/**
 * A heading over a row of cards, in the reply's order: the closest
 * names in the player's city, then the venues by the name typed. It
 * reads "<label> in <place>"; the place is apart so a long name can be
 * cut short without it ("Champion’s Field Turf and Pickle… in Pune").
 */
export type CardRow = { label: string; place: string; count: number };

/** The row of the closest names in the player's city. */
export const closestRow = (home: string, count: number): CardRow => ({ label: "Closest", place: home, count });

/**
 * The two rows for venueReply's `closest` (null without close names: one
 * row, as before). The second is headed by the venues' name when they
 * share one, else "Similar names" (Thunder turf and Thunder Club Turf
 * for "Thunder Arena"), never the name typed over other names.
 */
export function venueRows(home: string, closest: number, shown: readonly VenuePlace[]): CardRow[] | null {
  if (!closest || !shown.length) return null;
  const cities = [...new Set(shown.map((v) => v.city))];
  const names = namesOf(shown);
  return [closestRow(home, closest), { label: names.length === 1 ? names[0] : "Similar names", place: cities.length === 1 ? cities[0] : "other cities", count: shown.length }];
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
