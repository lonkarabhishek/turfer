import { areaFor } from "../utils/area";
import { CITIES, CITY_ALIASES, NOT_IN_TEXT, cityInText, type CityId } from "../city";
import type { Turf } from "../../types/turf";

// Venue-name matching for Ask TapTurf (find a turf, compare, a question
// about one venue) and game drafts. No "@/" imports so the test can
// compile it on its own (npm run test:names).
//
// A named venue is looked up in every city: "Prime Turf Marol" asked
// from Pune is the Mumbai venue, not Pune's top rated turfs (ask 383
// showed 390 Hyderabad turfs for a Pune venue). The city only decides
// between venues that match the name equally well.

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const STOP = new Set(["turf", "turfs", "ground", "grounds", "sports", "sport", "arena", "academy", "club", "the", "and", "box", "cricket", "football", "complex", "hub"]);

/**
 * Words that describe a venue rather than name it, so "best turf",
 * "cheap turf" and "turf with parking" name no venue (Best cricket hub
 * is in Vijayawada). They still count when the venue's name has them.
 */
const WEAK = new Set(
  (
    "best good nice top great famous popular rated cheap cheapest budget affordable new big open late night tonight today tomorrow " +
    "morning evening weekend indoor outdoor covered parking light lights floodlight floodlights washroom toilet changing room " +
    "hour hours hr hrs 24 24x7 7 x7 game games match matches play playing city multi multisport multisports " +
    "cage cages court courts field fields venue venues place places gear kit equipment bat ball balls slot slots price rate cost " +
    "side one two three four five six seven eight nine ten"
  ).split(" "),
);

/**
 * Words around a typed name that are never part of it: "Kage Turf
 * broo", "Dribble Den near me", "number of Kage", "Hotfut in
 * Hyderabad". Dropped before matching, from the venue's name too.
 */
const FILLER = new Set(
  (
    "in at on near nearby nearest me my mere paas bro broo bruh bhai yaar pls plz please show find get give want need " +
    "number num no not contact phone details location address is there any for to of with hai kya wala wale wali ka ki ke " +
    "hi hii hello hey thanks thank ok okay it this that here how much what when time does do did can have has " +
    "book booking available under below upto within rs inr rupees per make made more other another also only same cheaper better"
  ).split(" "),
);

// Spellings people type for the generic words, so "Royal multisports
// truf" is read as "royal multisports turf".
const TYPO: Record<string, string> = { truf: "turf", turff: "turf", trf: "turf", tuff: "turf", turv: "turf", grnd: "ground", groud: "ground", sprts: "sports", spots: "sports", arina: "arena" };
const NUM: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" };

const wordsOf = (s: string) => norm(s).split(" ").filter(Boolean).map((w) => TYPO[w] ?? w);
/** Distinctive words run together with numbers as digits: "A One Turf" and "A1 Turf" both give "a1". */
const compactOf = (words: string[]) => words.filter((w) => !STOP.has(w)).map((w) => NUM[w] ?? w).join("");

/** A typed word against one of ours: whole, or by prefix ("multisport" finds "multisports", "one" does not find "zone"). A typed word longer than ours matches unless what it adds is a number: "Arena32" is not "Arena". */
const hitWord = (w: string, h: string) => h === w || (w.length >= 4 && h.startsWith(w)) || (h.length >= 4 && w.startsWith(h) && !/^\d/.test(w.slice(h.length)));
const hitIn = (w: string, hay: readonly string[]) => hay.some((h) => hitWord(w, h));

/** Optimal string alignment distance (a swap of two letters is one edit), or max + 1 once it is over max. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * A misspelt distinctive word: "Kridadam", "Olrownd", "Dribbel". Same
 * first letter, both at least 5 letters, one edit (two from 9 letters).
 * Looser than that, "Circuit" found Cricfit and "Bouds" Blooming buds.
 */
function nearWord(w: string, h: string): boolean {
  if (w.length < 5 || h.length < 5 || w[0] !== h[0] || /\d/.test(w) || STOP.has(h) || WEAK.has(h)) return false;
  const max = w.length >= 9 ? 2 : 1;
  return editDistance(w, h, max) <= max;
}

type Hay = { name: string[]; place: string[]; addr: string[]; compact: string };
const hays = new WeakMap<Turf, Hay>();
function hayOf(t: Turf): Hay {
  let h = hays.get(t);
  if (!h) {
    const name = wordsOf(t.name);
    h = { name, place: wordsOf(areaFor(t) ?? ""), addr: wordsOf(t.address ?? ""), compact: compactOf(name) };
    hays.set(t, h);
  }
  return h;
}

const curatedCityWords: [string, CityId][] = [
  ...CITIES.filter((c) => !NOT_IN_TEXT.has(c.id)).flatMap((c): [string, CityId][] => [[norm(c.label), c.id], [norm(c.id), c.id]]),
  ...Object.entries(CITY_ALIASES).map(([alias, id]): [string, CityId] => [norm(alias), id]),
];
const cityMemo = new WeakMap<readonly Turf[], Map<string, CityId>>();
/** Every way a player names a city, as words: the curated labels and other names, and the city of every row (one the data team added last week too). */
function cityWordsFor(all: readonly Turf[]): Map<string, CityId> {
  const hit = cityMemo.get(all);
  if (hit) return hit;
  const m = new Map<string, CityId>(curatedCityWords);
  for (const t of all) {
    if (!t.city || NOT_IN_TEXT.has(t.city)) continue;
    const k = norm(t.city);
    if (k && !m.has(k)) m.set(k, t.city);
  }
  cityMemo.set(all, m);
  return m;
}

type Word = { w: string; city: CityId | null; core: boolean };
/** A typed name, read: the words that must match (core), the rest, and a city named in it. */
type Typed = { words: Word[]; of: number; city: CityId | null; label: string; compact: string; compactOK: boolean; short: boolean };

/**
 * `search`: for a turf search, where the words may not be a name at all
 * ("best turf", "sports arena"). It needs a distinctive word. Compare
 * and questions only get here with a name, so any word will do.
 */
function readName(text: string, cities: Map<string, CityId>, search: boolean): Typed | null {
  const all = wordsOf(text).filter((w) => !FILLER.has(w));
  // City names in it, up to three words ("navi mumbai"): "Hotfut in Hyderabad", "The Pitch Belagavi".
  const cityAt: (CityId | null)[] = all.map(() => null);
  let city: CityId | null = null;
  for (let i = 0; i < all.length; i++) {
    for (let n = Math.min(3, all.length - i); n >= 1; n--) {
      const id = cities.get(all.slice(i, i + n).join(" "));
      if (!id) continue;
      for (let k = i; k < i + n; k++) cityAt[k] = id;
      city ??= id;
      i += n - 1;
      break;
    }
  }
  const long = (w: string) => w.length >= 2 || /\d/.test(w);
  const kept = all.map((w, i) => ({ w, city: cityAt[i] })).filter((x) => long(x.w));
  // A lone digit ("4-5", "5 a side") is never what names a venue; "Arena 51" is.
  const distinct = (x: { w: string }) => !STOP.has(x.w) && !WEAK.has(x.w) && !/^\d$/.test(x.w);
  // The name's own words. A city in it only locates the venue. For a
  // question or a compare, a city can be the whole name ("Pune Turf")
  // and generic words still match ("Sports Arena"); a search of only a
  // city and generic words ("Bangalore bro", "Pune turf") is a city search.
  let core = kept.filter((x) => distinct(x) && !x.city);
  if (!core.length && !search) core = kept.filter(distinct);
  if (!core.length && !search) core = kept;
  // Core words first: matchOne stops at the first venue that misses too many.
  const words = kept.map((x) => ({ ...x, core: core.includes(x) })).sort((a, b) => Number(b.core) - Number(a.core));
  const compact = compactOf(all);
  // Run-together matching only when it adds something: a digit ("a1") or a long enough name.
  const compactOK = compact.length >= 4 || (compact.length >= 2 && /\d/.test(compact));
  // One-letter words ("T & R"): only the whole name, run together, can match.
  const short = all.some((w) => /^[a-z]$/.test(w)) && compact.length >= 2;
  // A search with no word of a name ("24 hour turf") is no venue, unless
  // it is all initials ("T & R"); nor is a bare number ("2100" is a budget).
  if (!core.length && !(search ? short : compactOK || short)) return null;
  if (search && kept.length && kept.every((x) => /^\d+$/.test(x.w))) return null;
  const tidy = (s: string) => s.replace(/[?.!,]+$/, "").trim();
  const label =
    tidy(
      text
        .split(/\s+/)
        .filter((w) => {
          const n = norm(w);
          return !n || (!FILLER.has(n) && !cities.has(n));
        })
        .join(" "),
    ) || tidy(text);
  return { words, of: core.length || 1, city, label, compact, compactOK, short };
}

/** One venue the typed name could mean. tier 0: every word matched; 1: every word of the name; 2: the same, with a misspelling; 3: most of it. */
export type VenueMatch = { turf: Turf; tier: number; nameHits: number; exact: boolean };

function matchOne(t: Turf, typed: Typed, fuzzy: boolean): VenueMatch | null {
  const h = hayOf(t);
  let coreHits = 0;
  let coreInName = 0;
  let nameHits = 0;
  // A word around the name (turf, a city) that this venue doesn't have;
  // the generic ones ("turf") apart, as the run-together name leaves them out.
  let otherMissed = false;
  let stopMissed = false;
  let misspelt = false;
  const cityIsName = typed.words.every((y) => !y.core || y.city);
  const compact = (typed.compactOK && h.compact.startsWith(typed.compact)) || (typed.short && h.compact === typed.compact);
  let coreLeft = typed.words.filter((x) => x.core).length;
  // Core words first (readName orders them so): most venues miss one, and are out.
  for (const x of typed.words) {
    if (x.core) coreLeft--;
    const inName = hitIn(x.w, h.name);
    const inPlace = hitIn(x.w, h.place);
    const inCity = x.city != null && x.city === t.city;
    const inAddr = !inName && !inPlace && hitIn(x.w, h.addr);
    if (inName) nameHits++;
    if (!x.core) {
      if (!(inName || inPlace || inCity || inAddr)) {
        otherMissed = true;
        if (STOP.has(x.w)) stopMissed = true;
      }
      continue;
    }
    // A city that is the name ("Pune Turf") has to be in the name, not just be the venue's city.
    let hit = x.city && cityIsName ? inName || inPlace : inName || inPlace || inCity || inAddr;
    let named = inName || inPlace;
    if (!hit && fuzzy && h.name.some((n) => nearWord(x.w, n))) {
      hit = named = misspelt = true;
      nameHits++;
    }
    if (hit) coreHits++;
    if (named) coreInName++;
    if (!compact && coreHits + coreLeft < typed.of * 0.75) return null;
  }
  // "A one" for A-One Turf or A1 Turf; "T & R" for T & R CRICKET;
  // "Power play" for POWERPLAY ARENA TURF. The run-together name covers
  // every word but the generic ones, which still have to match.
  if ((coreHits < typed.of || (otherMissed && !stopMissed)) && compact) {
    coreHits = typed.of;
    coreInName = Math.max(coreInName, 1);
    nameHits = Math.max(nameHits, typed.of);
    otherMissed = stopMissed;
  }
  if (coreInName === 0) return null;
  let tier: number;
  if (coreHits >= typed.of) tier = misspelt ? 2 : otherMissed ? 1 : 0;
  else if (coreHits / typed.of >= 0.75) tier = 3;
  else return null;
  // Every word of the venue's name was typed: "Prime Turf" is Prime Turf, not Prime Turf and pickleball arena.
  const own = h.name.filter((n) => n.length >= 2 && !FILLER.has(n) && n !== "the" && n !== "and");
  const exact = own.length > 0 && own.every((n) => typed.words.some((x) => hitWord(x.w, n)));
  return { turf: t, tier, nameHits, exact };
}

function matchAll(all: readonly Turf[], typed: Typed): VenueMatch[] {
  const pass = (fuzzy: boolean) => all.map((t) => matchOne(t, typed, fuzzy)).filter((m): m is VenueMatch => m !== null);
  const out = pass(false);
  // Misspellings only when nothing matches as typed.
  return out.some((m) => m.tier <= 1) ? out : pass(true);
}

const cityRank = (t: Turf, cities: readonly (CityId | null | undefined)[]) => {
  const i = cities.findIndex((c) => c != null && c === t.city);
  return i < 0 ? cities.length : i;
};

/** Best first: the closest match, then the preferred cities in order, then the exact name, then the most reviewed. */
function byMatch(cities: readonly (CityId | null | undefined)[]) {
  return (a: VenueMatch, b: VenueMatch) =>
    a.tier - b.tier ||
    b.nameHits - a.nameHits ||
    cityRank(a.turf, cities) - cityRank(b.turf, cities) ||
    Number(b.exact) - Number(a.exact) ||
    (b.turf.total_reviews ?? 0) - (a.turf.total_reviews ?? 0);
}

export type Resolved = {
  name: string;
  turf: Turf | null;
  /** Other venues with exactly this name, in other cities ("Prime Turf" is in Mumbai, Ballari and Malegaon). */
  others: Turf[];
};

/**
 * Match typed venue names against our rows, in every city. Generic
 * words (turf, arena, sports) don't count, so "Vedant" finds Vedant
 * Sports Academy and "CC Turf Pardi" needs both "cc" and "pardi". Words
 * match whole or by prefix, common typos are fixed first, a name typed
 * with or without spaces matches ("A one truf" finds A-One Turf), and a
 * misspelt name is tried when nothing matches as typed. A city typed
 * with the name decides ("The Pitch Belagavi"); else `cities`, in order
 * (the city the player named, then theirs), decides between venues that
 * match equally well. One result per typed name.
 */
export function resolveTurfNames(
  all: readonly Turf[],
  names: string[],
  cities?: CityId | null | readonly (CityId | null | undefined)[],
): Resolved[] {
  const prefer = Array.isArray(cities) ? (cities as readonly (CityId | null | undefined)[]) : [cities as CityId | null | undefined];
  const cityWords = cityWordsFor(all);
  return names.map((name) => {
    const typed = readName(name, cityWords, false);
    if (!typed) return { name, turf: null, others: [] };
    const found = matchAll(all, typed).sort(byMatch([typed.city, ...prefer]));
    const best = found[0];
    if (!best) return { name, turf: null, others: [] };
    const others = found.filter((m) => m.exact && m.tier === best.tier && m.turf.city !== best.turf.city).map((m) => m.turf);
    return { name, turf: best.turf, others };
  });
}

export type NamedVenues = {
  /** The matches of the closest tier, best first (no city preference applied). */
  matches: VenueMatch[];
  /** A city typed with the name ("Hotfut in Hyderabad"), or null. */
  city: CityId | null;
  /** The name as typed, without filler or a city: "Hotfut". */
  label: string;
};

/**
 * The venues a turf search names, in every city, or null when the words
 * name none ("best turf", "sports arena", "rooftop"): those stay a
 * search in the visitor's city.
 */
export function findNamedVenues(all: readonly Turf[], text: string | null | undefined): NamedVenues | null {
  if (!text) return null;
  const typed = readName(text, cityWordsFor(all), true);
  if (!typed) return null;
  const found = matchAll(all, typed);
  if (!found.length) return null;
  const tier = Math.min(...found.map((m) => m.tier));
  return { matches: found.filter((m) => m.tier === tier).sort(byMatch([typed.city])), city: typed.city, label: typed.label };
}

/**
 * The words as a venue's name, without filler or a city ("Circuit near
 * me" gives "Circuit"), or null when they can't be one: "cheap turf",
 * "Pune" and "football" name no venue.
 */
export function nameIn(all: readonly Turf[], text: string | null | undefined): string | null {
  if (!text) return null;
  const typed = readName(text, cityWordsFor(all), true);
  return typed && typed.words.some((x) => x.core && !x.city) ? typed.label : null;
}

/** The city a player's message names: a curated name ("Bengaluru"), else the city of any of our rows ("Ballari"). */
export function cityNamed(all: readonly Turf[], text: string): CityId | null {
  const curated = cityInText(text);
  if (curated) return curated;
  const cities = cityWordsFor(all);
  const ws = norm(text).split(" ").filter(Boolean);
  for (let i = 0; i < ws.length; i++) {
    for (let n = Math.min(3, ws.length - i); n >= 1; n--) {
      const id = cities.get(ws.slice(i, i + n).join(" "));
      if (id) return id;
    }
  }
  return null;
}
