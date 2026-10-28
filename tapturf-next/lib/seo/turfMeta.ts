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
 * venue's name is what people search. Descriptions stay within 155
 * characters, most useful fact first.
 *
 * Pure (relative imports only), so node --test runs it
 * (lib/seo/turfMeta.test.ts, npm run test:seo).
 */
import type { Turf } from "../../types/turf";
import { CITY_ALIASES, guessCityFromAddress, isCity, labelFor } from "../city";
import { courtType, sportPageForLabel } from "../sports";
import { areaFor } from "../utils/area";
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
/** All-caps words of 3 letters or fewer stay capitals (AMR, FC, KSR), except these ordinary words. */
const SHORT_WORDS = new Set(["THE", "AND", "FOR", "OF", "BOX", "NET", "PRO", "ONE", "TOP", "ACE", "HUB"]);
/** Connecting words that read lower case inside a title-cased name. */
const SMALL_WORDS = new Set(["and", "of", "for", "the"]);
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
  // Letters in any script, so "CAFÉ" reads "Café", not "CAFÉ".
  return name.replace(/\p{L}+/gu, (w) => {
    const out =
      w.length <= 3 && !SHORT_WORDS.has(w)
        ? w
        : !first && SMALL_WORDS.has(w.toLowerCase())
          ? w.toLowerCase()
          : w[0] + w.slice(1).toLowerCase();
    first = false;
    return out;
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

  s = s.replace(/\s*\(([^)]*)\)/g, (_m, inner: string) => {
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

  s = s
    .replace(/\s*(?:-|–|,)?\s*best turf.*$/i, "")
    .replace(/(\bturf)\s+(?:box cricket|cricket|football)(?:[,\s]+(?:box cricket|cricket|football|etc\.?))*$/i, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,–-]+|[\s,–-]+$/g, "")
    .trim();
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

// ── the template ──

export interface TurfMetaInput {
  turf: Turf;
  /** Which buttons the page shows: Call (getPhone) and WhatsApp (getWhatsAppPhone). */
  contact: { call: boolean; whatsapp: boolean };
  /** Live TapTurf player reports (turf_page review_stats: source null, status live). */
  reports?: { count: number; average: number } | null;
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

export function turfMeta({ turf, contact, reports }: TurfMetaInput): TurfMeta {
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
  const facets = (
    titlePrice
      ? [titlePrice, hasTimings && "Timings", (googleOk || reportCount > 0) && "Reviews", photos.length >= MIN_PHOTOS_TO_QUOTE && "Photos"]
      : [hasTimings && "Timings", (googleOk || reportCount > 0) && "Reviews", photos.length >= MIN_PHOTOS_TO_QUOTE && "Photos"]
  )
    .filter((f): f is string => !!f)
    .slice(0, 3);
  const head = (where: string) => (where ? `${name}, ${where}` : name);
  const withFacets = (where: string, k: number) => (facets.length >= k ? `${head(where)} – ${joinFacets(facets.slice(0, k))}` : null);
  const candidates = [
    withFacets(place.full, 3),
    withFacets(place.full, 2),
    withFacets(place.city, 3),
    withFacets(place.city, 2),
    // A price on its own earns a title slot; "Timings" alone does not.
    ...(titlePrice ? [withFacets(place.full, 1), withFacets(place.city, 1)] : []),
    head(place.full),
    head(place.city),
  ];
  let title = candidates.find((t): t is string => !!t && titleFits(t)) ?? null;
  for (let max = 60; !title && max > 8; max--) {
    const t = place.city ? `${truncateWords(name, max - place.city.length - 2)}, ${place.city}` : truncateWords(name, max);
    if (t.replace(/[, ]/g, "") && titleFits(t)) title = t;
  }
  title ??= truncateWords(name, 40);

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
  const format = turf.ground_format?.trim();
  if (format && format.length <= 12) optional.push(["extra", format]);
  if (photos.length >= MIN_PHOTOS_TO_QUOTE) optional.push(["fact", `${photos.length} photos`]);

  const build = (chosen: Opt[], o: { lead: string | null; where: boolean }) => {
    const extras = chosen.filter(([k]) => k === "extra").map(([, v]) => v);
    const facts = chosen.filter(([k]) => k === "fact").map(([, v]) => v);
    const typeLine = `${type}${o.where && !placeInTitle ? ` in ${place.full}` : ""}${extras.length ? `, ${extras.join(", ")}` : ""}.`;
    return [o.lead ? `${o.lead}.` : "", typeLine, facts.length ? `${facts.join(", ")}.` : "", cta].filter(Boolean).join(" ");
  };
  const hoursShort = hours ? compactHours(hours) : null;
  // The must-haves, trimmed only if a long place or type pushes them past the limit.
  const shapes = [
    { lead: [descPrice, hoursShort].filter(Boolean).join(" · ") || null, where: true },
    { lead: [descPrice, hoursShort].filter(Boolean).join(" · ") || null, where: false },
    { lead: descPrice ?? hoursShort, where: false },
    { lead: null, where: false },
  ];
  const shape = shapes.find((sh) => build([], sh).length <= DESCRIPTION_MAX_CHARS) ?? shapes[shapes.length - 1];
  const chosen: Opt[] = [];
  for (const o of optional) if (build([...chosen, o], shape).length <= DESCRIPTION_MAX_CHARS) chosen.push(o);
  let description = build(chosen, shape);
  if (description.length > DESCRIPTION_MAX_CHARS) description = `${truncateWords(description, DESCRIPTION_MAX_CHARS - 1)}.`;

  const first = turfPhotos(turf)[0];
  const alt = place.full ? `${name}, ${place.full}` : name;
  const ogImage = first ? { url: first, alt } : { ...DEFAULT_OG_IMAGE };

  return { name, cityId, cityLabel, place, title, description, type, ogImage };
}
