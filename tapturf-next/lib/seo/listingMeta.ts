/**
 * Titles and descriptions for the listing pages (home, /<city>,
 * /<city>/<sport>, /sport/<sport>), filled from live counts: how many
 * venues, which sports, where most of them are, how many list prices.
 * Same rules as the turf pages (lib/seo/turfMeta.ts): 60 characters and
 * about 580px for a title, 155 characters for a description, no booking
 * claims, nothing that is not on the page.
 *
 * Pure (relative imports only), so node --test runs it.
 */
import type { Turf } from "../../types/turf";
import { sportVenues, venueWord, type SportPage } from "../sports";
import { areaFor } from "../utils/area";
import { isOwnPhoto, turfPhotos } from "../utils/images";
import { summarisePrice } from "../utils/prices";
import { DEFAULT_OG_IMAGE } from "./defaults";
import { displayArea } from "./turfMeta";
import type { ListingReach } from "./turfFacts";
import { DESCRIPTION_MAX_CHARS, titleFits, withBrand } from "./width";

const inr = (n: number) => n.toLocaleString("en-IN");
const fits = (d: string) => d.length <= DESCRIPTION_MAX_CHARS;

/** "A, B and C". */
export function andList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** The first candidate that fits, else the last one. */
function firstFitting(candidates: (string | null | false | undefined)[], ok: (s: string) => boolean): string {
  const list = candidates.filter((c): c is string => !!c);
  return list.find(ok) ?? list[list.length - 1] ?? "";
}

/**
 * Keep adding optional parts, in order, while the whole still fits.
 * `make` builds the text from the parts chosen so far.
 */
function greedy<T>(options: T[][], make: (chosen: T[]) => string, limit = DESCRIPTION_MAX_CHARS): string {
  // Each option is a list of alternatives, richest first; the first that fits is taken.
  const chosen: T[] = [];
  for (const alternatives of options) {
    const pick = alternatives.find((a) => make([...chosen, a]).length <= limit);
    if (pick !== undefined) chosen.push(pick);
  }
  return make(chosen);
}

/** Areas with 2 or more of these venues, most first ("Karanje / Gendamal Naka" read as "Karanje"). */
export function busiestAreas(turfs: readonly Pick<Turf, "address" | "city" | "area">[], limit = 3): string[] {
  const counts = new Map<string, number>();
  for (const t of turfs) {
    const a = displayArea(areaFor(t));
    if (a) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([a]) => a);
}

/** How many of these venues list real prices (never reported ones). */
export function pricedCount(turfs: readonly Turf[]): number {
  return turfs.filter((t) => summarisePrice(t).kind === "real").length;
}

/**
 * The end of a city or city+sport description: "Call or WhatsApp" only
 * when at least one of the venues has a number the page can dial or
 * WhatsApp (ListingReach.contactable).
 */
function listingCta(contactable: number): string {
  return contactable > 0 ? "Call or WhatsApp, no booking fee." : "No booking fee.";
}

/** "Timings", "Photos", "Ratings" in a listing title, each only when a venue behind the page has it. */
function facetsFrom(on: { timings: boolean; photos: boolean; ratings?: boolean }): string[] {
  const have = [on.timings && "Timings", on.photos && "Photos", on.ratings && "Ratings"].filter((f): f is string => !!f);
  const join = (f: string[]) => (f.length <= 1 ? f.join("") : `${f.slice(0, -1).join(", ")} & ${f.at(-1)}`);
  return [...new Set([have, have.slice(0, 2), have.slice(0, 1)].map(join))].filter(Boolean);
}

/** The top venue's own photo (our storage, not an expiring Google link), else the site card. */
export function listingOgImage(turfs: readonly Turf[], alt: string): { url: string; alt: string; width?: number; height?: number } {
  const own = turfs[0] ? turfPhotos(turfs[0]).find(isOwnPhoto) : undefined;
  return own ? { url: own, alt } : { ...DEFAULT_OG_IMAGE };
}

// ── /<city> ──

export interface CityFacts extends ListingReach {
  label: string;
  count: number;
  /** Sport pages in this city, most venues first (practice nets and futsal are inside cricket and football). */
  sports: { name: string; count: number }[];
  areas: string[];
  floodlit: number;
  priced: number;
}

export function cityFacts(
  label: string,
  turfs: readonly Turf[],
  sportLinks: readonly { slug: string; name: string; count: number }[],
  reach: ListingReach,
): CityFacts {
  return {
    ...reach,
    label,
    count: turfs.length,
    sports: sportLinks
      .filter((s) => s.slug !== "cricket-nets" && s.slug !== "futsal")
      .map((s) => ({ name: s.name, count: s.count }))
      .sort((a, b) => b.count - a.count),
    areas: busiestAreas(turfs),
    floodlit: turfs.filter((t) => t.has_floodlights === true).length,
    priced: pricedCount(turfs),
  };
}

/** "44 Turfs in Surat: Box Cricket & Football, Timings & Photos". */
export function cityTitle(f: CityFacts): string {
  // A read that came back empty states no count (the next render has the rows).
  if (f.count <= 0) return `Turfs in ${f.label}: Football & Box Cricket`;
  const head = `${inr(f.count)} ${f.count === 1 ? "Turf" : "Turfs"} in ${f.label}`;
  const top = f.sports.slice(0, 2).map((s) => s.name);
  const pricedMost = f.priced * 2 > f.count;
  // A facet only when a turf here has it: no "Timings" for a city none of whose turfs lists hours.
  const facets = pricedMost
    ? [f.withHours > 0 && "Prices & Timings", "Prices"].filter((x): x is string => !!x)
    : facetsFrom({ timings: f.withHours > 0, photos: f.withPhotos > 0 }).slice(0, 2);
  const sports = [top.join(" & "), top[0]].filter((s, i, all) => !!s && all.indexOf(s) === i);
  const candidates: string[] = [];
  for (const sp of sports) for (const fc of facets) candidates.push(`${head}: ${sp}, ${fc}`);
  for (const sp of sports) candidates.push(`${head}: ${sp}`);
  if (facets[0]) candidates.push(`${head}: ${facets[0]}`);
  candidates.push(head);
  return firstFitting(candidates, titleFits);
}

/** "44 turfs in Surat: 41 box cricket, 8 football, 3 pickleball. Most in Vesu, ...; 17 floodlit. Call or WhatsApp, no booking fee." */
export function cityDescription(f: CityFacts): string {
  if (f.count <= 0) return `Football, box cricket and sports turfs in ${f.label}. Timings, photos and maps. Call or WhatsApp, no booking fee.`;
  const noun = f.count === 1 ? "turf" : "turfs";
  const sportLists = [3, 2, 1].map((k) => f.sports.slice(0, k).map((s) => `${inr(s.count)} ${s.name.toLowerCase()}`).join(", ")).filter(Boolean);
  const areaLists = [3, 2, 1].map((k) => andList(f.areas.slice(0, k))).filter(Boolean);
  type Part = { kind: "sports" | "areas" | "floodlit" | "cta"; text: string };
  const options: Part[][] = [
    sportLists.map((text) => ({ kind: "sports", text })),
    areaLists.map((text) => ({ kind: "areas", text })),
    f.floodlit > 0 ? [{ kind: "floodlit", text: `${inr(f.floodlit)} floodlit` }] : [],
  ];
  const make = (chosen: Part[]) => {
    const get = (k: Part["kind"]) => chosen.find((p) => p.kind === k)?.text;
    const sports = get("sports");
    const areas = get("areas");
    const lit = get("floodlit");
    const where = areas ? `Most in ${areas}${lit ? `; ${lit}` : ""}.` : lit ? `${lit.charAt(0).toUpperCase()}${lit.slice(1)}.` : "";
    return [`${inr(f.count)} ${noun} in ${f.label}${sports ? `: ${sports}` : ""}.`, where, listingCta(f.contactable)].filter(Boolean).join(" ");
  };
  return greedy(options, make);
}

// ── /<city>/<sport> ──

/** Off until the data team confirms the listed rates are per hour (some look per player). */
export const QUOTE_CITY_PRICE_RANGE = false;

export interface CitySportFacts extends ListingReach {
  cityLabel: string;
  sport: SportPage;
  count: number;
  priced: number;
  floodlit: number;
  areas: string[];
  priceMin: number | null;
  priceMax: number | null;
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** "31 Badminton Courts in Hyderabad: Prices & Timings". */
export function citySportTitle(f: CitySportFacts): string {
  const venues = f.count === 1 ? `${f.sport.name} ${cap(venueWord(f.sport, 1))}` : sportVenues(f.sport, { title: true });
  const head = `${inr(f.count)} ${venues} in ${f.cityLabel}`;
  const facets =
    f.priced * 2 > f.count
      ? [f.withHours > 0 && "Prices & Timings", "Prices"].filter((x): x is string => !!x)
      : facetsFrom({ timings: f.withHours > 0, photos: f.withPhotos > 0, ratings: f.rated > 0 });
  return firstFitting([...facets.map((fc) => `${head}: ${fc}`), head], titleFits);
}

/** "31 badminton courts in Hyderabad, 30 with listed prices. Most in Alwal, ... Timings, photos, map. Call or WhatsApp, no booking fee." */
export function citySportDescription(f: CitySportFacts): string {
  const lower = f.sport.name.toLowerCase();
  const venues = venueWord(f.sport, f.count);
  const priced =
    f.priced <= 0 ? null : f.priced === f.count && f.count > 1 ? "all with listed prices" : f.priced === 1 ? "1 with a listed price" : `${inr(f.priced)} with listed prices`;
  const range =
    QUOTE_CITY_PRICE_RANGE && f.priceMin != null && f.priceMax != null ? `₹${inr(f.priceMin)} to ₹${inr(f.priceMax)} an hour listed` : null;
  const lit = f.sport.venue === "turf" && f.floodlit > 0 ? `${inr(f.floodlit)} floodlit` : null;
  type Part = { kind: "priced" | "range" | "areas" | "lit" | "what"; text: string };
  const options: Part[][] = [
    priced ? [{ kind: "priced", text: priced }] : [],
    range ? [{ kind: "range", text: range }] : [],
    [3, 2, 1].map((k) => ({ kind: "areas" as const, text: andList(f.areas.slice(0, k)) })).filter((p) => !!p.text),
    lit ? [{ kind: "lit", text: lit }] : [],
    // What the turf pages show: the map always, timings and photos when a venue has them.
    [{ kind: "what", text: f.withHours > 0 || f.withPhotos > 0 ? `${cap([f.withHours > 0 && "timings", f.withPhotos > 0 && "photos", "map"].filter(Boolean).join(", "))}.` : "Map and directions." }],
  ];
  const make = (chosen: Part[]) => {
    const get = (k: Part["kind"]) => chosen.find((p) => p.kind === k)?.text;
    const head = `${inr(f.count)} ${lower} ${venues} in ${f.cityLabel}${get("priced") ? `, ${get("priced")}` : ""}${get("range") ? `, ${get("range")}` : ""}.`;
    const areas = get("areas");
    const litText = get("lit");
    const where = areas ? `Most in ${areas}${litText ? `; ${litText}` : ""}.` : litText ? `${cap(litText)}.` : "";
    return [head, where, get("what"), listingCta(f.contactable)].filter(Boolean).join(" ");
  };
  return greedy(options, make);
}

// ── /sport/<sport> ──

export interface SportFacts {
  sport: SportPage;
  count: number;
  priced: number;
  /** Cities with this sport, most venues first. */
  cities: { label: string; count: number }[];
}

/** "53 Pickleball Courts in 50 Cities: Prices & Timings" ("in Pune & Nashik" for three cities or fewer). */
export function sportTitle(f: SportFacts): string {
  // No venues listed yet (the sitemap leaves such a page out): no "0 ... in India".
  if (f.count <= 0) return `${sportVenues(f.sport, { title: true })} in India`;
  const venues = f.count === 1 ? `${f.sport.name} ${cap(venueWord(f.sport, 1))}` : sportVenues(f.sport, { title: true });
  const n = f.cities.length;
  const names = f.cities.map((c) => c.label);
  const where = n > 3 ? `in ${inr(n)} Cities` : n === 0 ? "in India" : `in ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`}`;
  const head = `${inr(f.count)} ${venues} ${where}`;
  const facets = f.priced * 2 > f.count ? ["Prices & Timings", "Prices"] : ["Timings & Photos", "Timings"];
  return firstFitting([...facets.map((fc) => `${head}: ${fc}`), head], titleFits);
}

/** "53 pickleball courts in 50 cities, most in Pune (12), ... Timings, photos and listed prices. Call or WhatsApp, no booking fee." */
export function sportDescription(f: SportFacts): string {
  if (f.count <= 0) return firstFitting([`${f.sport.blurb} Call or WhatsApp the venue, no booking fee.`, f.sport.blurb], fits);
  const lower = f.sport.name.toLowerCase();
  const venues = venueWord(f.sport, f.count);
  const n = f.cities.length;
  const tops = [3, 2, 1].map((k) => andList(f.cities.slice(0, k).map((c) => `${c.label} (${inr(c.count)})`))).filter(Boolean);
  type Part = { kind: "tops" | "what"; text: string };
  const what = f.priced > 0 ? "Timings, photos and listed prices." : "Timings, photos and maps.";
  const options: Part[][] = [tops.map((text) => ({ kind: "tops", text })), [{ kind: "what", text: what }]];
  const make = (chosen: Part[]) => {
    const t = chosen.find((p) => p.kind === "tops")?.text;
    const w = chosen.find((p) => p.kind === "what")?.text;
    const place = n > 3 ? `in ${inr(n)} cities` : n === 0 ? "in India" : `in ${andList(f.cities.map((c) => c.label))}`;
    const head = n > 3 && t ? `${inr(f.count)} ${lower} ${venues} ${place}, most in ${t}.` : `${inr(f.count)} ${lower} ${venues} ${place}.`;
    return [head, w, "Call or WhatsApp, no booking fee."].filter(Boolean).join(" ");
  };
  return greedy(options, make);
}

// ── /turfs and /turf-near-me ──

/** "Hyderabad, Bangalore, Pune and 171 more cities", or the names alone when they are all. */
function citiesLine(labels: string[], cityCount: number, k: number): string {
  const named = labels.slice(0, k);
  const more = Math.max(0, cityCount - named.length);
  if (named.length === 0) return cityCount > 0 ? `${inr(cityCount)} ${cityCount === 1 ? "city" : "cities"}` : "India";
  return more > 0 ? `${named.join(", ")} and ${inr(more)} more ${more === 1 ? "city" : "cities"}` : andList(named);
}

/** /turfs: every city, biggest first, within 155 characters. */
export function allTurfsDescription(labels: string[], cityCount: number): string {
  return firstFitting(
    [5, 4, 3, 2, 1, 0].map(
      (k) => `Football, box cricket and sports turfs in ${citiesLine(labels, cityCount, k)}. Prices, timings and photos. Call or WhatsApp the turf, no booking fee.`,
    ),
    fits,
  );
}

/**
 * /turf-near-me. The HTML lists turfs by city and area; sorting by
 * distance happens after "Use my location", so the snippet says that.
 */
export function nearMeDescription(total: number, labels: string[], cityCount: number): string {
  return firstFitting(
    [3, 2, 1, 0].map(
      (k) =>
        `Tap Use my location to sort ${inr(total)} football and box cricket turfs by distance, or browse ${citiesLine(labels, cityCount, k)}. No booking fee.`,
    ),
    fits,
  );
}

// ── home ──

/** "Find a Turf Near You: 3,660+ Turfs in 174 Cities | TapTurf" (count floored to 5). */
export function homeTitle(total: number, cityCount: number): string {
  const rounded = Math.floor(total / 5) * 5;
  const cities = cityCount > 0 ? `${inr(cityCount)} ${cityCount === 1 ? "City" : "Cities"}` : "India";
  const where = cityCount > 0 ? `in ${cities}` : "in India";
  return firstFitting(
    [
      rounded >= 50 && withBrand(`Find a Turf Near You: ${inr(rounded)}+ Turfs ${where}`),
      withBrand(`Find a Turf Near You: Football & Box Cricket Turfs ${where}`),
      withBrand(`Find a Turf Near You ${where}`),
      "Find a Turf Near You | TapTurf",
    ],
    titleFits,
  );
}

/** "Football, box cricket and pickleball turfs in Hyderabad, Bangalore, Pune and 171 more cities. Timings, photos, prices. Call or WhatsApp, no booking fee." */
export function homeDescription(topCityLabels: string[], cityCount: number): string {
  const tail = "Timings, photos, prices. Call or WhatsApp, no booking fee.";
  const where = (k: number) => {
    const named = topCityLabels.slice(0, k);
    const more = Math.max(0, cityCount - named.length);
    if (named.length === 0) return "across India";
    return more > 0 ? `in ${named.join(", ")} and ${inr(more)} more ${more === 1 ? "city" : "cities"}` : `in ${andList(named)}`;
  };
  return firstFitting(
    [3, 2, 1, 0].map((k) => `Football, box cricket and pickleball turfs ${where(k)}. ${tail}`),
    fits,
  );
}
