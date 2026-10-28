import { areaFor } from "../utils/area";
import { CITIES, CITY_ALIASES, NOT_IN_TEXT, cityInText, labelFor, type CityId } from "../city";
import { SPORT_PAGES } from "../sports";
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
    "side one ones two three four five six seven eight nine ten"
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
    "hi hii hello hey thanks thank ok okay it its this that here how much what when time does do did can have has " +
    "book booking available under below upto within rs inr rupees per make made more other another also only same cheaper better " +
    "now tell about timing timings"
  ).split(" "),
);

/** What a player asks after a venue's name ("dribble den price"): never the end of the name as said back. */
const ASKED = new Set("price prices rate rates cost costs charge charges fee fees".split(" "));
const PREP = new Set("in at on near to of for with".split(" "));

// Spellings people type for the generic words, so "Royal multisports
// truf" is read as "royal multisports turf".
const TYPO: Record<string, string> = { truf: "turf", turff: "turf", trf: "turf", tuff: "turf", turv: "turf", grnd: "ground", groud: "ground", sprts: "sports", spots: "sports", arina: "arena" };
const NUM: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" };

const wordsOf = (s: string) => norm(s).split(" ").filter(Boolean).map((w) => TYPO[w] ?? w);
/** Distinctive words run together with numbers as digits: "A One Turf" and "A1 Turf" both give "a1". */
const compactOf = (words: string[]) => words.filter((w) => !STOP.has(w)).map((w) => NUM[w] ?? w).join("");
/** Every word run together, the generic ones too: "Club 19" and "Club19" both give "club19". */
const fullOf = (words: string[]) => words.map((w) => NUM[w] ?? w).join("");

/**
 * A typed word against one of ours: whole, or by prefix ("multisport"
 * finds "multisports", "one" does not find "zone", "ones" does not find
 * ONESTOP). A typed word longer than ours matches only as its plural
 * ("titans" for Titan): "Turfsquad" is not every venue with "turf" in
 * its name, "Mahadevapura" not Jay mahadev, "Arena32" not "Arena".
 */
const hitWord = (w: string, h: string) => h === w || (w.length >= 5 && h.startsWith(w)) || (h.length >= 4 && w.startsWith(h) && /^(?:s|es|z)$/.test(w.slice(h.length)));
const hitIn = (w: string, hay: readonly string[]) => hay.some((h) => hitWord(w, h));
/** The same word, or one as the other's plural ("champion" and Champions, "titans" and Titan): never the start of a longer one (Supernova is no "super"). */
const sameWord = (w: string, n: string) => w === n || [[w, n], [n, w]].some(([a, b]) => a.length >= 4 && b.startsWith(a) && /^(?:s|es|z)$/.test(b.slice(a.length)));

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

/** compact: the name's distinctive words run together; full: every word of it, for names with a number ("club19"). */
type Hay = { name: string[]; place: string[]; addr: string[]; compact: string; full: string };
const hays = new WeakMap<Turf, Hay>();
function hayOf(t: Turf): Hay {
  let h = hays.get(t);
  if (!h) {
    const name = wordsOf(t.name);
    h = { name, place: wordsOf(areaFor(t) ?? ""), addr: wordsOf(t.address ?? ""), compact: compactOf(name), full: fullOf(name) };
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
/**
 * A typed name, read: the words that must match (core), the rest, and a
 * city named in it. letters: one-letter words typed ("K" of K Turf).
 * placed: a word after "in", "at" or "near" that is not a city ("turf in
 * Deccan"), so the words may be a place there rather than a venue's name
 * (Deccan Turf).
 */
type Typed = {
  words: Word[];
  of: number;
  city: CityId | null;
  label: string;
  compact: string;
  compactOK: boolean;
  short: boolean;
  full: string | null;
  letters: string[];
  placed: boolean;
};

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
  const raw = wordsOf(text);
  // "turf in Deccan", not "Pitch In a Box" or "Hotfut in Hyderabad".
  const placed = raw.some((w, i) => {
    const next = raw[i + 1];
    if (!(w === "in" || w === "at" || w === "near") || !next || next.length < 3 || FILLER.has(next) || next === "the") return false;
    return ![1, 2, 3].some((n) => cities.has(raw.slice(i + 1, i + 1 + n).join(" ")));
  });
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
  // The name as typed, without the words around it: filler, a city, a
  // price asked ("number of Kage", "Kage Turf broo", "Hotfut in Navi
  // Mumbai", "dribble den price"). Only at the ends: "Balls Of Fury",
  // "Kick it arena" and "Box22 Drive in" keep their small words.
  const toks = text.trim().split(/\s+/);
  const around = (w: string) => !norm(w) || FILLER.has(norm(w));
  // A city of up to three words at the start or the end of toks[a, b).
  const cityEdge = (a: number, b: number, end: boolean) =>
    [3, 2, 1].find((n) => b - a >= n && cities.has(norm(toks.slice(end ? b - n : a, end ? b : a + n).join(" ")))) ?? 0;
  let a = 0;
  let b = toks.length;
  for (let k = 1; k && a < b; a += k) k = around(toks[a]) ? 1 : cityEdge(a, b, false);
  // A last word "in" or "on" with nothing after it is the name's ("Score On"), not "Hotfut in Hyderabad"'s.
  const last = (w: string) => b === toks.length && PREP.has(norm(w));
  for (let k = 1; k && b > a; b -= k) k = (around(toks[b - 1]) && !last(toks[b - 1])) || ASKED.has(norm(toks[b - 1])) ? 1 : cityEdge(a, b, true);
  const label = tidy(toks.slice(a, b).join(" ")) || tidy(text);
  // With a number, the generic words run together too: "Club 19" is
  // Club19, "Turf 28" is Turf28 Bijapur (the run-together form above
  // leaves "club" and "turf" out, so it was only "19" and "28").
  const full = /\d/.test(compact) ? fullOf(all.filter((_, i) => !cityAt[i])) : null;
  return { words, of: core.length || 1, city, label, compact, compactOK, short, full: full && full.length >= 4 ? full : null, letters: all.filter((w) => /^[a-z]$/.test(w)), placed };
}

/**
 * One venue the typed name could mean. tier 0: every word matched; 1:
 * every word of the name; 2: the same, with a misspelling; 3: most of
 * it. exact: every word of the venue's name was typed. inName: every
 * word of the typed name is in the venue's own name, not only its area
 * or address ("Shivaji Nagar" is not Chatrapati Shivaji Maharaj Turf);
 * partName: at least one is.
 * whole: the venue's name, typed: each of its words as itself, its
 * plural or misspelt ("Dribbel Den" for Dribble Den), never only the
 * start of one, or all its distinctive words ("Power play" for
 * POWERPLAY ARENA TURF). cover: the share of the
 * venue's own words typed ("Kage Turf": 2 of Kage Multisport Turf's 3).
 */
export type VenueMatch = { turf: Turf; tier: number; nameHits: number; exact: boolean; inName: boolean; partName: boolean; whole: boolean; cover: number };

function matchOne(t: Turf, typed: Typed, fuzzy: boolean, cities: ReadonlyMap<string, CityId>): VenueMatch | null {
  const h = hayOf(t);
  let coreHits = 0;
  let coreInName = 0;
  let coreOwn = 0;
  let nameHits = 0;
  // A word around the name (turf, a city) that this venue doesn't have;
  // the generic ones ("turf") apart, as the run-together name leaves them out.
  let otherMissed = false;
  let stopMissed = false;
  let misspelt = false;
  const cityIsName = typed.words.every((y) => !y.core || y.city);
  // The run-together name with the generic words: "Turf 28" for Turf28 Bijapur covers "turf" too.
  const fullHit = typed.full != null && h.full.startsWith(typed.full);
  // A run-together start of the name needs five letters, as a word does ("sure" is not Surekha Turf), or a digit ("a1").
  const longEnough = typed.compact.length >= 5 || /\d/.test(typed.compact) || h.compact === typed.compact;
  const compact = (typed.compactOK && longEnough && h.compact.startsWith(typed.compact)) || (typed.short && h.compact === typed.compact) || fullHit;
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
    // A bare number ("19", "28") names a venue only in its name, not as "Zone C-19" or "Sector 28".
    const bare = /^\d+$/.test(x.w) && !inName;
    if (bare) hit = false;
    let named = !bare && (inName || inPlace);
    let ownName = inName;
    if (!hit && fuzzy && h.name.some((n) => nearWord(x.w, n))) {
      hit = named = ownName = misspelt = true;
      nameHits++;
    }
    if (hit) coreHits++;
    if (named) coreInName++;
    if (ownName) coreOwn++;
    if (!compact && coreHits + coreLeft < typed.of * 0.75) return null;
  }
  // "A one" for A-One Turf or A1 Turf; "T & R" for T & R CRICKET;
  // "Power play" for POWERPLAY ARENA TURF. The run-together name covers
  // every word but the generic ones, which still have to match.
  if ((coreHits < typed.of || (otherMissed && !stopMissed)) && compact) {
    coreHits = typed.of;
    coreInName = Math.max(coreInName, 1);
    coreOwn = typed.of;
    nameHits = Math.max(nameHits, typed.of);
    otherMissed = fullHit ? false : stopMissed;
  }
  if (coreInName === 0) return null;
  let tier: number;
  if (coreHits >= typed.of) tier = misspelt ? 2 : otherMissed ? 1 : 0;
  else if (coreHits / typed.of >= 0.75) tier = 3;
  else return null;
  // Every word of the venue's name was typed: "Prime Turf" is Prime Turf,
  // not Prime Turf and pickleball arena; K Turf needs the "K" ("turf in
  // CIDCO" is not it); Club19 is "Club 19" too.
  const own = h.name.filter((n) => !FILLER.has(n) && n !== "the" && n !== "and");
  const exact =
    (own.some((n) => n.length >= 2) && own.every((n) => (n.length >= 2 ? typed.words.some((x) => hitWord(x.w, n)) : typed.letters.includes(n)))) ||
    (typed.full != null && typed.full === h.full);
  const long = own.filter((n) => n.length >= 2);
  // The whole name: each of its words typed (or its plural, or misspelt:
  // "Dribbel Den"), never only the start of one ("Super Cricket Box" is
  // not SuperOver Box Cricket), or its distinctive words run together.
  // Its own city needn't be typed: "Sportify" is Sportify Hyderabad's
  // name, as is "Sportify Hyderabad" read with the city apart.
  const said = (n: string) => typed.words.some((x) => sameWord(x.w, n) || (misspelt && nearWord(x.w, n))) || (cities.get(n) === t.city && long.some((m) => cities.get(m) !== t.city));
  const whole =
    (long.length > 0 && own.every((n) => (n.length >= 2 ? said(n) : typed.letters.includes(n)))) ||
    (typed.full != null && typed.full === h.full) ||
    (typed.compact.length >= 4 && typed.compact === h.compact);
  const cover = long.length ? long.filter((n) => typed.words.some((x) => hitWord(x.w, n))).length / long.length : 0;
  return { turf: t, tier, nameHits, exact, inName: coreOwn >= typed.of, partName: coreOwn > 0, whole, cover };
}

function matchAll(all: readonly Turf[], typed: Typed): VenueMatch[] {
  const cities = cityWordsFor(all);
  const pass = (fuzzy: boolean) => all.map((t) => matchOne(t, typed, fuzzy, cities)).filter((m): m is VenueMatch => m !== null);
  const out = pass(false);
  // Misspellings only when nothing matches as typed.
  return out.some((m) => m.tier <= 1) ? out : pass(true);
}

const cityRank = (t: Turf, cities: readonly (CityId | null | undefined)[]) => {
  const i = cities.findIndex((c) => c != null && c === t.city);
  return i < 0 ? cities.length : i;
};

/**
 * Best first: the closest match, a city typed with the name, then the
 * whole name over part of it ("Golden turf" from Mumbai is Lucknow's
 * Golden turf, not Golden Boot Turf in Airoli), then the preferred
 * cities in order, then the exact name, then the most reviewed.
 */
function byMatch(cities: readonly (CityId | null | undefined)[], typedCity: CityId | null = null) {
  const whole = (m: VenueMatch) => Number(m.whole);
  return (a: VenueMatch, b: VenueMatch) =>
    a.tier - b.tier ||
    b.nameHits - a.nameHits ||
    cityRank(a.turf, [typedCity]) - cityRank(b.turf, [typedCity]) ||
    whole(b) - whole(a) ||
    cityRank(a.turf, cities) - cityRank(b.turf, cities) ||
    Number(b.exact) - Number(a.exact) ||
    (b.turf.total_reviews ?? 0) - (a.turf.total_reviews ?? 0);
}

export type Resolved = {
  name: string;
  turf: Turf | null;
  /** Other venues with exactly this name, in other cities ("Prime Turf" is in Mumbai, Ballari and Malegaon). */
  others: Turf[];
  /** The name typed is the venue's whole name ("Kage Multisport Turf"), not part of it ("Kage"). */
  whole: boolean;
};

/**
 * A name with no distinctive word, typed whole: "Coimbatore Sports
 * Club" (a city and generic words), "Turf 9 Arena", "Hi 5ers" (filler
 * and a number). Its words run together must be a venue's name run
 * together; with a number the venue's name may go on ("Turf 9" is Turf 9
 * Arena). Only for text that is a name (turf_names, a compare, a
 * question: `asName`) or that has a number: a plain search for "Pune
 * turf" stays a city search.
 */
function wholeName(all: readonly Turf[], text: string, asName: boolean): VenueMatch[] {
  const ws = wordsOf(text);
  const digit = /\d/.test(text);
  if (ws.length < 2 || (!asName && !digit)) return [];
  const run = fullOf(ws);
  if (run.length < 5) return [];
  return all.flatMap((t) => {
    const f = hayOf(t).full;
    return f === run || (digit && f.startsWith(run)) ? [{ turf: t, tier: 0, nameHits: ws.length, exact: f === run, inName: true, partName: true, whole: f === run, cover: f === run ? 1 : 0 }] : [];
  });
}

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
  opts: { distinct?: boolean; exclude?: readonly Turf[] } = {},
): Resolved[] {
  const prefer = Array.isArray(cities) ? (cities as readonly (CityId | null | undefined)[]) : [cities as CityId | null | undefined];
  const cityWords = cityWordsFor(all);
  // distinct (a comparison): each name a venue the earlier ones didn't
  // take, so "Huddle Arena" twice is two Huddle Arenas, not one compared
  // with itself. exclude: venues already on the sheet (the page's own).
  const taken = new Set<Turf>(opts.exclude ?? []);
  return names.map((name) => {
    const typed = readName(name, cityWords, false);
    const read = typed ? matchAll(all, typed) : [];
    const found = (read.length ? read : wholeName(all, name, true)).sort(byMatch(prefer, typed?.city ?? null));
    const best = opts.distinct || taken.size ? found.find((m) => !taken.has(m.turf)) : found[0];
    if (!best) return { name, turf: null, others: [], whole: false };
    if (opts.distinct) taken.add(best.turf);
    // Only venues by the very same name: "There's also a Prime Turf in Ballari", never another name.
    const same = norm(best.turf.name);
    const others = found
      .filter((m) => m.exact && m.tier === best.tier && m.turf.city !== best.turf.city && norm(m.turf.name) === same)
      .map((m) => m.turf);
    return { name, turf: best.turf, others, whole: best.whole };
  });
}

/**
 * resolveTurfNames for a comparison or a question asked on a venue's
 * page: a name that is the page's own ("this turf", or the page venue's
 * name copied into turf_names) is that page's row, not whichever venue
 * by that name ranks first (three Huddle Arenas in Vadodara), and the
 * other names are each another venue (`distinct`).
 */
export function resolveWithPage(
  all: readonly Turf[],
  names: string[],
  cities: readonly (CityId | null | undefined)[],
  page: { name?: string | null; turf: Turf | null },
  opts: { distinct?: boolean } = {},
): Resolved[] {
  const at = page.turf && page.name ? names.findIndex((n) => norm(n) === norm(page.name!)) : -1;
  const rest = resolveTurfNames(all, names.filter((_, i) => i !== at), cities, { distinct: opts.distinct, exclude: at >= 0 && page.turf ? [page.turf] : [] });
  if (at < 0 || !page.turf) return rest;
  return [...rest.slice(0, at), { name: names[at], turf: page.turf, others: [], whole: true }, ...rest.slice(at)];
}

export type NamedVenues = {
  /** The matches of the closest tier, best first (no city preference applied). */
  matches: VenueMatch[];
  /** A city typed with the name ("Hotfut in Hyderabad"), or null. */
  city: CityId | null;
  /** The name as typed, without filler or a city: "Hotfut". */
  label: string;
  /** Words after "in", "at" or "near" that are not a city: maybe a place, not a name ("turf in Deccan"). */
  placed: boolean;
};

/**
 * The venues a turf search names, in every city, or null when the words
 * name none ("best turf", "sports arena", "24 hour turf"): those stay a
 * search in the visitor's city. For free_text, namedInSearch decides.
 */
export function findNamedVenues(all: readonly Turf[], text: string | null | undefined, asName = false): NamedVenues | null {
  if (!text) return null;
  const typed = readName(text, cityWordsFor(all), true);
  const found = typed ? matchAll(all, typed) : [];
  if (!typed || !found.length) {
    // `asName`: the text is a venue's name (turf_names), so a name of only a city and generic words counts too.
    const whole = wholeName(all, text, asName);
    return whole.length ? { matches: whole.sort(byMatch([])), city: null, label: text.replace(/[?.!,]+$/, "").trim(), placed: false } : null;
  }
  const tier = Math.min(...found.map((m) => m.tier));
  return { matches: found.filter((m) => m.tier === tier).sort(byMatch([], typed.city)), city: typed.city, label: typed.label, placed: typed.placed };
}

/** Words of a row a search could find: its name, area, address and sports. */
const rowWords = (t: Turf) => {
  const h = hayOf(t);
  return [...h.name, ...h.place, ...h.addr, ...wordsOf((t.sports ?? []).join(" "))];
};

/**
 * findNamedVenues for the words a search could not map (free_text).
 * They are not always a name: "skating", "snooker", "rooftop", "mall"
 * match a few venues' names somewhere in India, and as a name the
 * search left the player's city ("skating in bangalore" showed one
 * Hyderabad venue over six in Bangalore that list it). So unless a
 * match in `city` (the city asked about, else the reading's, else the
 * visitor's) has the words in its name, or one is a venue's exact name
 * typed as a name, rows in `city` with the words in their name, area,
 * address or sports make it a search there (null), as before. Numbers
 * don't count ("Club 19" is not house number 19), and an area no row in
 * `city` has stays a place elsewhere ("Marathahalli" from Noida).
 *
 * words: set when it is a search there, the words that decide it ("best
 * turf in lonaval today" is "lonaval"), so the search finds the rows
 * this found rather than none for want of "today".
 */
export function namedInSearch(
  all: readonly Turf[],
  text: string | null | undefined,
  city: CityId | null | undefined,
): { named: NamedVenues | null; words: string[] | null } {
  const named = findNamedVenues(all, text);
  if (!named || !city || named.matches.some((m) => (m.exact && m.tier <= 1 && !named.placed) || (m.turf.city === city && m.partName))) return { named, words: null };
  const cities = cityWordsFor(all);
  const ws = wordsOf(text ?? "").filter((w) => w.length >= 2 && !/^\d+$/.test(w) && !FILLER.has(w) && !STOP.has(w) && !WEAK.has(w) && !cities.has(w));
  const there = ws.length > 0 && all.some((t) => t.city === city && ws.every((w) => rowWords(t).some((h) => h.startsWith(w))));
  return there ? { named: null, words: ws } : { named, words: null };
}

/**
 * Whether the text names a venue by its own name, for the keyword
 * reading of "A vs B" and "does X have parking": every word in the
 * venue's name, or its whole name. "Does Andheri have box cricket" and
 * "does Shivaji Nagar have box cricket" name areas, not a venue there.
 */
export function namesVenue(all: readonly Turf[], text: string | null | undefined): boolean {
  return !!findNamedVenues(all, text, true)?.matches.some((m) => m.tier <= 2 && (m.exact || m.inName));
}

/**
 * The venues a message is the whole name of ("Dribble den", "Power
 * play"), or nearly all of the one venue it matches ("No Kage Turf" for
 * Kage Multisport Turf), or null. For a message the reading took for
 * small talk: not a word some venue's name starts with ("sure",
 * "really", "fine").
 */
export function wholeVenueName(all: readonly Turf[], text: string): NamedVenues | null {
  const named = findNamedVenues(all, text);
  const one = named?.matches.length === 1;
  const matches = named?.matches.filter((m) => m.tier === 0 && (m.whole || (one && m.cover >= 2 / 3))) ?? [];
  return named && matches.length ? { ...named, matches } : null;
}

/**
 * Words that say what or where a venue is, not which one, for closest
 * names only: the sports, and words many names carry ("zone" is in 71
 * names on 28 Oct, "cafe" in 76, "nagar" in 20). A venue still matches
 * by them (Champions Zone); they just never make a name close.
 */
const KIND = new Set([
  ...SPORT_PAGES.flatMap((s) => s.labels.flatMap((l) => norm(l).split(" "))),
  ...("zone cafe caf soccer futsal pickle pitch nets net pool park centre center stadium pavilion station spot point corner square yard garden house adda " +
    "fitness gym khel khelo fc sc cc sportz sporting sporty international india indian sevens eleven by de nagar road rd sector sec colony layout phase town greater " +
    // What a venue has, asked for ("rooftop turf", "astro turf", "real grass", "turf for kids").
    "rooftop terrace snooker billiards astro astroturf grass natural artificial synthetic kids kid camp camps coaching").split(" "),
]);

/**
 * Words many venues' names have that still name one: adjectives, game
 * terms, team nouns and kinds of place ("hit" is in 31 names in 21 cities on 28 Oct,
 * "champions" 28 in 21, "royal" 21 in 16). For closest names they count
 * only between names with nothing else of their own: "Champions Arena"
 * is close to Champion's Turf, but "Free Hit Turf" is not to Free Kick
 * Sports Arena, nor "Pro Turf Arena" to Pro Legacy Sports Academy.
 */
const COMMON = new Set(
  (
    "free high super pro elite prime royal golden green urban united grand mega ultra max smart sky true real active fun young little premier premium classic ace first star stars power " +
    "hit hits kick kicks kickoff off goal goals strike striker strikers score scorer scores six sixes sixer sixers boundary boundaries wicket wickets over overs innings " +
    "bat bats bowl bowler bowlers bowling dugout powerplay hattrick header korner penalty shot shots run runs out stumps yorker catch drive cover sweep spin googly bouncer " +
    "champion champions champs king kings warriors legend legends titan titans tiger tigers lion lions eagle eagles knight knights rider riders challenger challengers " +
    "player players master masters hero heroes gladiators spartans panthers falcons hawks sharks bulls rangers world nation land kingdom palace " +
    "village campus junction plaza tower towers valley hills estate society residency enclave lounge mall metro school college"
  ).split(" "),
);


const nameWordMemo = new WeakMap<readonly Turf[], Set<string>>();
/** Every word of every venue's name, to tell a misspelling from another name ("Pride" is no misspelt "Prime"). */
function nameWordsFor(all: readonly Turf[]): Set<string> {
  let m = nameWordMemo.get(all);
  if (!m) {
    m = new Set(all.flatMap((t) => hayOf(t).name));
    nameWordMemo.set(all, m);
  }
  return m;
}

/**
 * The venues in `city` whose names are closest to a typed name that
 * isn't there ("Dribble Den" from Hyderabad: Cricket Den, Sports Den,
 * Gamer's Den), best first, at most `limit`, often none. Close is by
 * name only: a distinctive word shared (the same word or its plural,
 * never the start of a longer one: Greenbox is no "Green"), the same
 * word misspelt (nearWord; a five-letter word only when no venue's name
 * has it as typed), or the whole name run together or as initials
 * ("Dribbleden", "S K"). Generic words (turf, sports, arena, a sport, a
 * city, "zone", "rooftop") never count, common ones (COMMON: "hit",
 * "pro", "champions") only between names with no other word, nor the
 * area of the venues it was found at (`found`): "Kharadi" of Hotfut
 * Kharadi is where it is. At least half the typed name's distinctive
 * words must be in the venue's, a word of three letters or more among
 * them when it has one ("Level Up" is no Turf Up); every one with
 * `every` (a name no venue has). More words shared first, then more of
 * the venue's own name typed, then the most reviewed.
 *
 * `also`: venues there the matcher took for the name (Golden Boot Turf
 * for "Golden turf", when Lucknow has the Golden turf), first, when a
 * word of the name is a word of theirs. `keep`: the search's other
 * filters (sport, budget, area) every venue must pass.
 */
export function closestNames(
  all: readonly Turf[],
  text: string | null | undefined,
  city: CityId,
  found: readonly Turf[] = [],
  limit = 3,
  opts: { also?: readonly Turf[]; every?: boolean; keep?: (t: Turf) => boolean } = {},
): Turf[] {
  const typed = text ? readName(text, cityWordsFor(all), false) : null;
  if (!typed) return [];
  const keep = (t: Turf) => t.city === city && (!opts.keep || opts.keep(t));
  const core = typed.words.filter((x) => x.core && !x.city).map((x) => x.w);
  const first = (opts.also ?? [])
    .filter((t) => keep(t) && hayOf(t).name.some((n) => core.some((w) => sameWord(w, n))))
    .sort((a, b) => (b.total_reviews ?? 0) - (a.total_reviews ?? 0));
  const own = (w: string) => w.length >= 2 && !/^\d+$/.test(w) && !STOP.has(w) && !WEAK.has(w) && !FILLER.has(w) && !KIND.has(w);
  const there = new Set(found.flatMap((t) => hayOf(t).place));
  const typedOwn = [...new Set(typed.words.filter((x) => !x.city && own(x.w) && !there.has(x.w)).map((x) => x.w))];
  // Only common words typed ("Champions Arena"): those, against names with no other word of their own.
  const weak = typedOwn.every((w) => COMMON.has(w));
  const ws = weak ? typedOwn : typedOwn.filter((w) => !COMMON.has(w));
  // Run together, only for a name with a word of its own or initials ("Sports Zone" is no "Zone Turf").
  const run = ws.length || typed.short ? typed.compact : "";
  if (!ws.length && !run) return first.slice(0, limit);
  const known = nameWordsFor(all);
  // Not the "sport" coinages either, a letter or two apart by design (Sportivo, Sportingo, Sportygen).
  const misspelt = ws.filter((w) => (w.length >= 6 || !known.has(w)) && !w.startsWith("sport"));
  // Two letters ("SB" of Hotfut SB Road, "Up" of Level Up) never make a name close alone when it has a longer word.
  const long = ws.some((w) => w.length >= 3);
  const close = all.flatMap((t) => {
    if (!keep(t) || first.includes(t)) return [];
    const h = hayOf(t);
    const mine = h.name.filter(own);
    const joined = run.length >= 2 && h.compact === run;
    // Common words alone: a venue with a word of its own is another name (Pro Legacy Sports Academy for "Pro Turf Arena").
    if (weak && !joined && mine.some((n) => !COMMON.has(n))) return [];
    const theirs = weak ? mine : mine.filter((n) => !COMMON.has(n));
    const hit = (w: string) => theirs.some((n) => sameWord(w, n));
    const near = (w: string) => misspelt.includes(w) && theirs.some((n) => nearWord(w, n));
    const matched = ws.filter((w) => hit(w) || near(w));
    // Half the name's words at least: one of three is another name ("Royal" of Royal Challengers Kings). Every one of common words only.
    const enough = matched.length > 0 && (opts.every || weak ? matched.length === ws.length : matched.length * 2 >= ws.length) && (!long || matched.some((w) => w.length >= 3));
    if (!joined && !enough) return [];
    // A two-letter word counts for less than a word ("Hotfut").
    const hits = matched.filter(hit).reduce((n, w) => n + (w.length >= 3 ? 2 : 1), 0);
    const nears = matched.filter((w) => !hit(w)).length;
    const cover = theirs.length ? theirs.filter((n) => ws.some((w) => sameWord(w, n) || (misspelt.includes(w) && nearWord(w, n)))).length / theirs.length : 0;
    return [{ t, score: (joined ? 10 : 0) + hits + nears, cover }];
  });
  close.sort((a, b) => b.score - a.score || b.cover - a.cover || (b.t.total_reviews ?? 0) - (a.t.total_reviews ?? 0));
  return [...first, ...close.map((c) => c.t)].slice(0, limit);
}

/**
 * Whether typed words name a venue rather than say what one has: a word
 * that is no generic word, sport, facility or kind of place (KIND), nor
 * a city, or initials. "Kage", "Golden turf" and "Champions Arena" do;
 * "rooftop turf", "astro turf", "turf with cafe" and "snooker" don't,
 * though venues have them in their names (The Sky Arena - Rooftop Turf,
 * Astro Turf).
 */
export function namesWhich(all: readonly Turf[], text: string | null | undefined): boolean {
  const typed = text ? readName(text, cityWordsFor(all), true) : null;
  return !!typed && (typed.short || typed.words.some((x) => x.core && !x.city && !KIND.has(x.w)));
}

/**
 * Whether free text reads as a venue's name on its own, for "No turf
 * called X on TapTurf yet": it names one (namesWhich), with no number,
 * no place after "in" or "near", and three words at most that aren't
 * generic ("Dribble Zone Sports Arena" is two). Not "turf for 14
 * players", "turf near metro station" or "I know tapturf has a score
 * tracker".
 */
export function readsAsName(all: readonly Turf[], text: string | null | undefined): boolean {
  if (!text || /\d/.test(text)) return false;
  const typed = readName(text, cityWordsFor(all), true);
  if (!typed || typed.placed) return false;
  return typed.words.filter((x) => !x.city && !STOP.has(x.w) && !WEAK.has(x.w)).length <= 3 && namesWhich(all, text);
}

/**
 * Whether the player said where the venue is, as when they type its
 * city: a word (three letters or more) of a found venue's area, in the
 * name typed or the areas, that is no word of any found venue's name
 * ("Dribble Den in Begur", "Prime Turf Marol"; not "Zeta" for Zeta
 * Sports Arena, though Darbari Lal Sports Arena is in Zeta 1).
 */
export function placedAt(found: readonly Turf[], text: string | null | undefined, areas: readonly string[] = []): boolean {
  const words = (s: string | null | undefined) => norm(s ?? "").split(" ").filter((w) => w.length >= 3);
  const said = new Set(words([text ?? "", ...areas].join(" ")));
  const names = new Set(found.flatMap((t) => words(t.name)));
  return found.some((t) => words(areaFor(t)).some((w) => said.has(w) && !names.has(w)));
}

const nameCounts = new WeakMap<readonly Turf[], Map<string, number>>();
/**
 * The shown venues as the next turn names them ("compare the top two",
 * "the second one"): a name that another card or venue shares gets its
 * area and city, "Huddle Arena, Vemali, Vadodara", which resolveTurfNames
 * reads back as that one venue.
 */
export function shownNames(cards: readonly Turf[], all: readonly Turf[]): string[] {
  let counts = nameCounts.get(all);
  if (!counts) {
    counts = new Map();
    for (const t of all) counts.set(norm(t.name), (counts.get(norm(t.name)) ?? 0) + 1);
    nameCounts.set(all, counts);
  }
  const inList = new Map<string, number>();
  for (const t of cards) inList.set(norm(t.name), (inList.get(norm(t.name)) ?? 0) + 1);
  return cards.map((t) => {
    const k = norm(t.name);
    if ((inList.get(k) ?? 0) < 2 && (counts.get(k) ?? 0) < 2) return t.name;
    const city = t.city ? labelFor(t.city) : null;
    const area = areaFor(t);
    return [t.name, area && area.toLowerCase() !== city?.toLowerCase() ? area : null, city].filter(Boolean).join(", ");
  });
}

/**
 * Whether a city inferred for a search (the page's, not one the player
 * typed) gives way to the area asked for: only when another city lists
 * it as one of its areas ("Begur" is Bangalore's) and no row in this
 * city has it in its area or address. A locality that only shows up in
 * other cities' addresses ("College Road", "CIDCO") keeps the city.
 */
export function areaElsewhere(all: readonly Turf[], areas: readonly string[], city: CityId): boolean {
  const want = areas.map(norm).filter(Boolean);
  if (!want.length) return false;
  // As listed, or misspelt by an edit or two ("Marathalli" for Marathahalli, ask 211).
  const listed = (t: Turf) => {
    const label = norm(areaFor(t) ?? "");
    return !!label && want.some((a) => a === label || nearWord(a.replace(/ /g, ""), label.replace(/ /g, "")));
  };
  const here = (t: Turf) => {
    const hay = `${norm(areaFor(t) ?? "")} ${norm(t.address ?? "")}`;
    return want.some((a) => hay.includes(a));
  };
  return all.some((t) => t.city !== city && listed(t)) && !all.some((t) => t.city === city && here(t));
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
