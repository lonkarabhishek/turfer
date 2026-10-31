/**
 * Search title, description and share card for a turf page, filled only
 * from the turf's own row: its name, area and city, the prices its
 * Pricing table lists, its hours, photos, Google rating and TapTurf
 * player reports. Nothing is invented, nothing promises a booking
 * (players call or WhatsApp the turf), and a fact is left out rather
 * than guessed.
 *
 * Titles fit 60 characters and about 580px (lib/seo/width.ts) with no
 * " | TapTurf": Google shows the site name above every result, and the
 * venue's name is what people search. The title keeps the area and the
 * strongest facts (price, timings, reviews). The description leads with
 * the sport, so a brand search still sees what the place is before the
 * price. Descriptions stay within 155 characters.
 *
 * Pure (relative imports only), so node --test runs it
 * (lib/seo/turfMeta.test.ts, npm run test:seo).
 */
import type { Turf } from "../../types/turf";
import { CITY_ALIASES, guessCityFromAddress, isCity, labelFor } from "../city";
import { courtType, sportPageForLabel } from "../sports";
import { areaFor } from "../utils/area";
import { formatLabel } from "../utils/formats";
import { dailyHoursSummary, normaliseOpeningHours } from "../utils/hours";
import { orderPhotos, turfPhotos } from "../utils/images";
import { priceUnitSuffix, showsPriceBands, summarisePagePrice } from "../utils/prices";
import { DEFAULT_OG_IMAGE } from "./defaults";
import { DESCRIPTION_MAX_CHARS, titleFits, truncateWords } from "./width";

// ── names ──

/** Sport and "turf" padding that says nothing about which venue this is. */
const FILLER =
  /^(?:box\s*cricket|cricket(?:\s*box)?|football(?:\s*academy)?|futsal|pickle\s*ball|pickleball|badminton|turf|turfs|sports?|arena|ground|academy|multi\s*sports?|etc\.?|&|and|,|\s)+$/i;
/** Words a " - " part may also carry and still be padding ("The Multisports Turf", "Best Turf in Thane"). */
const PAD_WORDS = new Set(["the", "a", "an", "in", "best", "first"]);
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu;
/**
 * All-caps words of 3 letters or fewer stay capitals (AMR, FC, KSR, SVA,
 * ARK), except these ordinary words ("THE BIG TURF" -> "The Big Turf",
 * "HULK IN THE BOX" -> "Hulk in the Box"). No vowel rule: real acronyms
 * have vowels too (MAC, ANA, OMR, AUK).
 */
const SHORT_WORDS = new Set([
  "THE", "AND", "FOR", "OF", "BOX", "NET", "PRO", "ONE", "TOP", "ACE", "HUB",
  "AIR", "ALL", "AT", "BIG", "BY", "DE", "DEN", "EL", "FIT", "GEN", "HIT", "IN", "LEO", "LET", "MUD", "NOU", "OFF",
  "OLD", "OM", "ON", "OUT", "RAJ", "RAM", "RUN", "SIX", "SKY", "TO", "TON", "TWO", "WAR", "ZAM",
]);
/** Connecting words that read lower case inside a title-cased name. */
const SMALL_WORDS = new Set(["and", "of", "for", "the", "in", "by", "to", "at"]);
/** A name ending in dotted initials (F.A.S.E.) keeps its last dot; any other trailing dot goes. */
const DOTTED_END = /(?:^|[^\p{L}.])(?:\p{L}\.){2,}$/u;
/** Vowel-less 2-3 letter words that are abbreviations, not initials. */
const NOT_INITIALS = new Set(["st", "dr", "mr", "mrs", "rd", "no", "ltd", "pvt", "sq", "ch"]);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Lower case, punctuation gone, "sec" read as "sector": the form two place names are compared in. */
export function normPlace(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bsec\b\.?/g, "sector")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Whether `needle` appears in `hay` as whole words, compared as normPlace. */
function containsPlace(hay: string, needle: string): boolean {
  const n = normPlace(needle);
  return !!n && ` ${normPlace(hay)} `.includes(` ${n} `);
}

/** The city's label and every other name it goes by (CITY_ALIASES: Gurugram, Thane, Bengaluru...). */
export function cityNames(cityId: string | null): string[] {
  if (!cityId) return [];
  const out = [labelFor(cityId)];
  for (const [alias, id] of Object.entries(CITY_ALIASES)) if (id === cityId) out.push(alias);
  return out;
}

function unShout(name: string): string {
  const letters = name.replace(/[^\p{L}]/gu, "");
  if (letters.length < 8 || letters !== letters.toUpperCase()) return name;
  let first = true;
  // Letters in any script, so "CAFÉ" reads "Café", not "CAFÉ". A word
  // runs on past an apostrophe: "CHAMPION'S" -> "Champion's" (one letter
  // after it is a possessive), "D'SOUZA" -> "D'Souza".
  return name.replace(/\p{L}+(?:['’"]\p{L}+)*/gu, (tok) => {
    const at = tok.search(/['’"]/);
    const w = at < 0 ? tok : tok.slice(0, at);
    const tail = at < 0 ? "" : tok.slice(at);
    const out =
      w.length <= 3 && !SHORT_WORDS.has(w)
        ? w
        : !first && SMALL_WORDS.has(w.toLowerCase())
          ? w.toLowerCase()
          : w[0] + w.slice(1).toLowerCase();
    first = false;
    return out + (tail.length <= 2 ? tail.toLowerCase() : tail.slice(0, 2) + tail.slice(2).toLowerCase());
  });
}

/** "Jk" -> "JK": a short word with no vowel (y counts as one: Sky, My, By, Fly) is someone's initials. */
function fixInitials(s: string): string {
  return s.replace(/\b[B-DF-HJ-NP-TV-XZb-df-hj-np-tv-xz]{2,3}\b/g, (w) =>
    NOT_INITIALS.has(w.toLowerCase()) || w === w.toLowerCase() ? w : w.toUpperCase(),
  );
}

/**
 * The venue's name as people search it, from the stored listing name:
 * - cut at the first emoji or "!" when two or more words come before it
 *   ("Bellator Sports Arena 🏟️ Cricket box ! pickleball" -> "Bellator Sports Arena");
 * - never split on "/" (24/7, A/C, Football/Cricket stay whole);
 * - " | " parts: a branch stays ("ClayGrounds | Sec 65 Gurugram" ->
 *   "ClayGrounds Sec 65"), a part that is only the city or sport words goes;
 * - brackets: a place stays ("(Gandhi Bhavan)"), sport words or the city go;
 * - a " - " part of sport words plus at most the area or city goes ("THE
 *   TOWN CRICKET TURF - BOX CRICKET TURF Jagatpura" -> "The Town Cricket
 *   Turf"), never a name ("Football Turf Thane - Strikers Arena" stays),
 *   and never when the part before it is itself only sport words and a
 *   place ("Jaipur Futsal - Jaipur Football Academy" stays);
 * - "Best turf in ..." padding and a trailing sport list go;
 * - an all-caps name is title-cased, keeping short capitals (AMR, FC);
 *   vowel-less short words become initials ("Jk" -> "JK").
 * The database keeps the original; the data team cleans names separately.
 */
export function seoName(raw: string, cityId: string | null, area?: string | null): string {
  let s = raw ?? "";
  const cut = s.search(/[\p{Extended_Pictographic}!]/u);
  if (cut > 0 && s.slice(0, cut).trim().split(/\s+/).length >= 2) s = s.slice(0, cut);
  s = s.replace(EMOJI, " ").replace(/!/g, " ").replace(/\s{2,}/g, " ").trim();

  const cities = cityNames(cityId);
  const stripCity = (t: string) =>
    cities.reduce((acc, c) => acc.replace(new RegExp(`\\b${escapeRe(c)}\\b`, "gi"), " "), t).replace(/\s{2,}/g, " ").trim();
  const isCityOnly = (t: string) => cities.some((c) => normPlace(c) === normPlace(t));

  const [base, ...rest] = s.split(/\s*\|\s*/);
  const branches = rest.map(stripCity).filter((t) => t && !FILLER.test(t));
  s = [base, ...branches].join(" ");

  // A bracket inside a word is part of the brand ("M(R)ETRO Play Arena").
  s = s.replace(/\s*\(([^)]*)\)(?!\p{L})/gu, (_m, inner: string) => {
    const t = inner.trim();
    return !t || FILLER.test(t) || isCityOnly(t) ? "" : ` (${t})`;
  });

  // The words of the area and the city's names; what is left of a part
  // without them and PAD_WORDS ("" when it was only those).
  const placeWords = new Set([displayArea(area) ?? "", ...cities].flatMap((p) => normPlace(p).split(" ")).filter(Boolean));
  const withoutPlace = (t: string) =>
    normPlace(t)
      .split(" ")
      .filter((w) => w && !placeWords.has(w) && !PAD_WORDS.has(w))
      .join(" ");
  s = s.replace(/^(.*?)\s+[-–]\s+(.+)$/, (m, before: string, seg: string) => {
    const words = seg.trim().split(/\s+/);
    const fill = words.filter((w) => FILLER.test(w)).length;
    const mostlyFiller = fill >= Math.ceil(words.length / 2) && words.length - fill <= 2;
    // The other words must be the area, the city or PAD_WORDS, and the
    // part before must name the venue by itself.
    const rest = withoutPlace(seg);
    const head = withoutPlace(before);
    return mostlyFiller && rest && FILLER.test(rest) && head && !FILLER.test(head) ? before : m;
  });

  const tidy = (t: string) => {
    const x = t.replace(/\s{2,}/g, " ").replace(/^[\s,–-]+|[\s,–-]+$/g, "").trim();
    // "Skyland Turf." and "Game On.." (from "Game On..!") end clean; "F.A.S.E." keeps its dot.
    return DOTTED_END.test(x) ? x : x.replace(/[\s,.–-]+$/u, "");
  };
  const named = tidy(s);
  // "Best turf in ..." padding, with a "The Multisport's" just before it, and a trailing sport list.
  s = tidy(
    s
      .replace(/\s*(?:-|–|,)?\s*(?:(?:the\s+)?\S+['’]s\s+)?best turf.*$/i, "")
      .replace(/(\bturf)\s+(?:box cricket|cricket|football)(?:[,\s]+(?:box cricket|cricket|football|etc\.?))*$/i, "$1"),
  );
  // Only sport words left ("Turf cricket" -> "Turf"): the name before those cuts.
  if (!s || FILLER.test(s)) s = named;
  return fixInitials(unShout(s)) || raw.trim();
}

/** The area as a title shows it: "Karanje / Gendamal Naka" -> "Karanje", "Sun City (NH-24)" -> "Sun City", "opposite Sector 23" -> "Sector 23". */
export function displayArea(area: string | null | undefined): string | null {
  if (!area) return null;
  const a = area
    .split(/\s*\/\s*/)[0]
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/^(?:opp(?:osite)?\.?|near|behind|next to)\s+/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return a || null;
}

/**
 * Where the turf is, minus what its name already says: `full` is
 * "Area, City" (either part left out when the name has it), `city` the
 * city alone, or "" when the name names it.
 */
export function placeFor(name: string, area: string | null | undefined, cityId: string | null): { full: string; city: string } {
  const city = cityId ? labelFor(cityId) : null;
  const a = displayArea(area);
  const parts: string[] = [];
  if (a && !containsPlace(name, a) && !(city && normPlace(a) === normPlace(city))) parts.push(a);
  const cityInName = cityNames(cityId).some((c) => containsPlace(name, c));
  if (city && !cityInName) parts.push(city);
  return { full: parts.join(", "), city: city && !cityInName ? city : "" };
}

// ── facts ──

const inr = (n: number) => n.toLocaleString("en-IN");

/** "Open 6:00 AM – 12:00 AM daily" -> "Open 6 AM–midnight daily". */
export function compactHours(h: string): string {
  return h
    .replace(/:00 /g, " ")
    .replace(/ – /g, "–")
    .replace(/\b12 AM\b/g, "midnight")
    .replace(/\b12 PM\b/g, "noon");
}

/**
 * "Football Turf", "Cricket & Football Turf", "Badminton Court" from the
 * sports list, main sport first. `short` is the one-sport form.
 */
export function describeTurfType(sports: string[]): { full: string | null; short: string | null } {
  const norm = sports.map((s) => s.trim().toLowerCase()).filter(Boolean);
  const label = (s: string): string | null =>
    s === "box cricket" ? "Box Cricket" : s === "cricket" || s === "cricket nets" ? "Cricket" : s === "football" ? "Football" : null;
  const main = norm[0] ? label(norm[0]) : null;
  if (!main) {
    const court = courtType(sports);
    return { full: court, short: court };
  }
  const second = norm.slice(1).map(label).find((l): l is string => !!l && l !== main);
  return { full: second ? `${main} & ${second} Turf` : `${main} Turf`, short: `${main} Turf` };
}

/** "Box cricket & football turf with pickleball court", sentence case. */
export function typePhrase(sports: string[]): string {
  const { full } = describeTurfType(sports);
  const courts = [
    ...new Set(
      sports
        .map((x) => sportPageForLabel(x))
        .filter((p) => !!p && p.venue === "court")
        .map((p) => p!.name.toLowerCase()),
    ),
  ];
  const named = sports.map((s) => s.trim()).filter(Boolean);
  let s = (full ?? (named.length ? `${named.slice(0, 2).join(" & ")} venue` : "sports venue")).toLowerCase();
  if (full && !/court/i.test(full) && courts.length) s += ` with ${courts.slice(0, 2).join(" & ")} court${courts.length > 1 ? "s" : ""}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function joinFacets(f: string[]): string {
  return f.length <= 1 ? f.join("") : `${f.slice(0, -1).join(", ")} & ${f.at(-1)}`;
}

/**
 * "Football Turf" or "Badminton Court" when the cleaned name does not
 * already say that sport ("JDS Box Cricket" does; "Turf Up" does not).
 * A bare "Turf" in the name does not count. Used to decide whether the
 * description needs to lead with the sport.
 */
function titleSport(name: string, sports: string[]): string | null {
  const { short } = describeTurfType(sports);
  if (!short) return null;
  const kind = short.replace(/\s+(?:turfs?|courts?|pools?|tables?|nets?)$/i, "");
  const said = kind.split(/\s+&\s+/).some((bit) => bit.split(/\s+/).some((w) => w.length >= 4 && containsPlace(name, w)));
  return said ? null : short;
}

/** Without a "(" the cut left open: "ASSC Cricket Academy (Elegants Cricket Nets" -> "ASSC Cricket Academy". */
function closeBrackets(s: string): string {
  let t = s;
  while ((t.match(/\(/g)?.length ?? 0) > (t.match(/\)/g)?.length ?? 0)) t = t.slice(0, t.lastIndexOf("("));
  return t.replace(/[\s,:;@|–—-]+$/u, "").trim();
}

/**
 * Shorter forms of a name too long for a title, longest first: first cut
 * where a part ends (" - ", " – ", " | ", ": ", " @ ", ", ", " ("), each
 * keeping a word of 4 letters or two words ("BSA - Blitzz Sports Academy",
 * "Skygoal"), then cut at a word. None leaves a "(" open.
 */
export function nameCuts(name: string): { parts: string[]; words: string[] } {
  const parts: string[] = [];
  let from = 0;
  for (const m of name.matchAll(/\s+[-–—|@]\s*|\s*:\s+|,\s+|\s+\(/gu)) {
    // A cut that ends on sport words ("Sportozen: Box Cricket") says no more than the part before it.
    const last = name.slice(from, m.index).replace(/^[\s(]+/, "");
    from = m.index + m[0].length;
    if (FILLER.test(last)) continue;
    const t = closeBrackets(name.slice(0, m.index));
    if (t && !FILLER.test(t) && (t.split(/\s+/).length >= 2 || t.replace(/[^\p{L}\d]/gu, "").length >= 4)) parts.push(t);
  }
  const words: string[] = [];
  for (let max = name.length - 1; max > 8; max--) words.push(closeBrackets(truncateWords(name, max)));
  const uniq = (a: string[]) => [...new Set(a)].filter((t) => t && t !== name);
  return { parts: uniq(parts).sort((a, b) => b.length - a.length), words: uniq(words) };
}

// ── the template ──

export interface TurfMetaInput {
  turf: Turf;
  /** Which buttons the page shows: Call (getPhone) and WhatsApp (getWhatsAppPhone). */
  contact: { call: boolean; whatsapp: boolean };
  /** Live TapTurf player reports (turf_page review_stats: source null, status live). */
  reports?: { count: number; average: number } | null;
  /**
   * Another active turf in the same city has this name (sharedNameKey):
   * the title keeps the area before any facet, so the two differ.
   */
  nameShared?: boolean;
}

export interface TurfMeta {
  /** seoName(): the H1, the title and the JSON-LD name. */
  name: string;
  cityId: string | null;
  cityLabel: string | null;
  place: { full: string; city: string };
  title: string;
  description: string;
  /** "Box cricket & football turf with pickleball court". */
  type: string;
  /** Share card: the turf's best photo, else the site card. */
  ogImage: { url: string; alt: string; width?: number; height?: number };
}

/** Google's rating as a fact worth quoting: at least 5 reviews. */
export const MIN_GOOGLE_REVIEWS_TO_QUOTE = 5;
/** Photos worth mentioning. */
const MIN_PHOTOS_TO_QUOTE = 3;

export function turfMeta({ turf, contact, reports, nameShared = false }: TurfMetaInput): TurfMeta {
  const cityId = isCity(turf.city) ? turf.city : guessCityFromAddress(turf.address);
  const cityLabel = cityId ? labelFor(cityId) : null;
  const name = seoName(turf.name, cityId, areaFor(turf));
  const place = placeFor(name, areaFor(turf), cityId);

  // The page's own Pricing table (bands when it lists them); reported or
  // player prices never reach a snippet.
  const page = summarisePagePrice(turf);
  const real = page.kind === "real" && page.min != null && page.max != null;
  const unit = showsPriceBands(turf) ? "/hr" : priceUnitSuffix(turf, { short: true });
  const titlePrice = real ? (page.min === page.max ? `₹${inr(page.min!)}${unit}` : `from ₹${inr(page.min!)}${unit}`) : null;
  const descPrice = real ? (page.min === page.max ? `₹${inr(page.min!)}${unit}` : `₹${inr(page.min!)}–${inr(page.max!)}${unit}`) : null;

  const fallback = { start_time: turf.start_time, end_time: turf.end_time, is_24x7: turf.is_24x7 };
  const hours = dailyHoursSummary(turf.opening_hours, fallback);
  const hasTimings = normaliseOpeningHours(turf.opening_hours, fallback).length > 0;
  // Counted from what the gallery shows (orderPhotos of images); the
  // share card still leads with the cover.
  const photos = orderPhotos(turf.images ?? []);
  const googleOk = Number(turf.total_reviews) >= MIN_GOOGLE_REVIEWS_TO_QUOTE && Number(turf.rating) > 0;
  const reportCount = reports && reports.count > 0 ? reports.count : 0;

  // ── title: "{name}, {place} – {facets}", the first that fits ──
  // The sport is not squeezed in here: it would push out the area or the
  // price. The description leads with it instead (below).
  const sportBit = titleSport(name, turf.sports ?? []);
  const facets = (
    titlePrice
      ? [titlePrice, hasTimings && "Timings", (googleOk || reportCount > 0) && "Reviews", photos.length >= MIN_PHOTOS_TO_QUOTE && "Photos"]
      : [hasTimings && "Timings", (googleOk || reportCount > 0) && "Reviews", photos.length >= MIN_PHOTOS_TO_QUOTE && "Photos"]
  )
    .filter((f): f is string => !!f)
    .slice(0, 3);
  const head = (where: string) => (where ? `${name}, ${where}` : name);
  const withFacets = (where: string, k: number) => (facets.length >= k ? `${head(where)} – ${joinFacets(facets.slice(0, k))}` : null);
  // A price on its own earns a title slot; "Timings" alone does not.
  const byArea = [withFacets(place.full, 3), withFacets(place.full, 2), ...(titlePrice ? [withFacets(place.full, 1)] : []), head(place.full)];
  const byCity = [withFacets(place.city, 3), withFacets(place.city, 2), ...(titlePrice ? [withFacets(place.city, 1)] : []), head(place.city)];
  const candidates = nameShared
    ? // Two "Sportyzo Sports Academy" in Gurgaon: the area tells them apart, so it goes before any facet.
      [...byArea, ...byCity]
    : [byArea[0], byArea[1], byCity[0], byCity[1], ...(titlePrice ? [withFacets(place.full, 1), withFacets(place.city, 1)] : []), head(place.full), head(place.city)];
  let title = candidates.find((t): t is string => !!t && titleFits(t)) ?? null;
  if (!title) {
    // Too long even with the city alone: a shorter name, cut where a part
    // ends before anywhere else, with the place worked out again for it (a
    // cut can drop the area or city the name carried, "... - Salem").
    const area = areaFor(turf);
    const cuts = nameCuts(name);
    const tries = [
      ...cuts.parts.map((c) => [c, placeFor(c, area, cityId).full] as const),
      ...cuts.parts.map((c) => [c, placeFor(c, area, cityId).city] as const),
      ...cuts.words.map((c) => [c, placeFor(c, area, cityId).city] as const),
      ...cuts.words.map((c) => [c, ""] as const),
    ];
    title = tries.map(([c, where]) => (where ? `${c}, ${where}` : c)).find((t) => titleFits(t)) ?? null;
  }
  title ??= closeBrackets(truncateWords(name, 40));

  // ── description: facts, most useful first, each only while it fits ──
  const type = typePhrase(turf.sports ?? []);
  const placeInTitle = !place.full || title.includes(place.full);
  const membersOnly = turf.membership_required === true;
  const channel = contact.call && contact.whatsapp ? "Call or WhatsApp the turf" : contact.call ? "Call the turf" : contact.whatsapp ? "WhatsApp the turf" : null;
  const cta = membersOnly
    ? channel
      ? "Members' club: call to ask about guest access."
      : "Members' club. See the map and directions."
    : channel
      ? `${channel}${descPrice ? "" : " for rates"}, no booking fee.`
      : "See the map and directions.";

  type Opt = ["fact" | "extra", string];
  const optional: Opt[] = [];
  if (googleOk) optional.push(["fact", `${Number(turf.rating).toFixed(1)} on Google (${inr(Number(turf.total_reviews))} reviews)`]);
  if (turf.has_floodlights === true) optional.push(["extra", "floodlit"]);
  if (turf.is_covered === true) optional.push(["extra", "covered"]);
  if (reports && reports.count >= 5) optional.push(["fact", `${reports.average.toFixed(1)} from ${reports.count} TapTurf player reports`]);
  else if (reportCount > 0) optional.push(["fact", `${reportCount} TapTurf player report${reportCount > 1 ? "s" : ""}`]);
  // The format the page's Format row shows (TurfDetails: formats first,
  // ground_format only without them), and only side counts ("7-a-side"):
  // "box cricket" is in the type already.
  const sides = (turf.formats ?? []).map((f) => formatLabel(f)).filter((f) => /^\d+-a-side$/i.test(f));
  const format = turf.formats?.length ? [...new Set(sides)].join(" / ") : turf.ground_format?.trim();
  if (format && format.length <= 12) optional.push(["extra", format]);
  if (photos.length >= MIN_PHOTOS_TO_QUOTE) optional.push(["fact", `${photos.length} photos`]);

  const build = (chosen: Opt[], o: { lead: string | null; where: boolean }, sportFirst = false) => {
    const extras = chosen.filter(([k]) => k === "extra").map(([, v]) => v);
    const facts = chosen.filter(([k]) => k === "fact").map(([, v]) => v);
    const typeLine = `${type}${o.where && !placeInTitle ? ` in ${place.full}` : ""}${extras.length ? `, ${extras.join(", ")}` : ""}.`;
    const lead = o.lead ? `${o.lead}.` : "";
    const factLine = facts.length ? `${facts.join(", ")}.` : "";
    // The title already names the sport when it fitted beside the area.
    // When it did not, lead with the sport so a brand snippet still says
    // what the place is before the price.
    return (sportFirst ? [typeLine, lead, factLine, cta] : [lead, typeLine, factLine, cta]).filter(Boolean).join(" ");
  };
  const hoursShort = hours ? compactHours(hours) : null;
  // The must-haves, trimmed only if a long place or type pushes them past the limit.
  const shapes = [
    { lead: [descPrice, hoursShort].filter(Boolean).join(" · ") || null, where: true },
    { lead: [descPrice, hoursShort].filter(Boolean).join(" · ") || null, where: false },
    { lead: descPrice ?? hoursShort, where: false },
    { lead: null, where: false },
  ];
  const sportFirst = !!sportBit && !title.includes(sportBit);
  const shape = shapes.find((sh) => build([], sh, sportFirst).length <= DESCRIPTION_MAX_CHARS) ?? shapes[shapes.length - 1];
  const chosen: Opt[] = [];
  for (const o of optional) if (build([...chosen, o], shape, sportFirst).length <= DESCRIPTION_MAX_CHARS) chosen.push(o);
  let description = build(chosen, shape, sportFirst);
  if (description.length > DESCRIPTION_MAX_CHARS) description = `${truncateWords(description, DESCRIPTION_MAX_CHARS - 1)}.`;

  const first = turfPhotos(turf)[0];
  const alt = place.full ? `${name}, ${place.full}` : name;
  const ogImage = first ? { url: first, alt } : { ...DEFAULT_OG_IMAGE };

  return { name, cityId, cityLabel, place, title, description, type, ogImage };
}
