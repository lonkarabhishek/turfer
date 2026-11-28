import type { Turf, PriceBand, PriceMention } from "@/types/turf";
import { cleanPriceMentions } from "./bookingApps";

type NumericMention = PriceMention & { price_inr: number };

/** The price columns the listed-price rules read: a turf row, or just these of one (the admin's estimate, lib/admin/growth.ts). */
export type PricedTurf = Pick<
  Turf,
  "morning_price" | "afternoon_price" | "evening_price" | "weekend_morning_price" | "weekend_afternoon_price" | "weekend_evening_price" | "price_unit" | "slot_minutes"
> &
  Pick<Partial<Turf>, "pricing_bands" | "price_owner_confirmed">;

const PRICE_FIELDS = [
  "morning_price",
  "afternoon_price",
  "evening_price",
  "weekend_morning_price",
  "weekend_afternoon_price",
  "weekend_evening_price",
] as const;

/**
 * A price we can show: a finite number above zero. 0, negatives, NaN and
 * anything that isn't a number count as "no price", never as ₹0.
 */
export function positivePrice(p: unknown): number | null {
  return typeof p === "number" && Number.isFinite(p) && p > 0 ? p : null;
}

/**
 * The per-hour range players shared on the turf page ("From players"),
 * or null when none shared a price. Only positive numbers count, so a
 * stray 0 never reads as ₹0.
 */
export function playerPriceRange(
  list: readonly { price_min?: number | null; price_max?: number | null }[],
): { min: number; max: number; count: number } | null {
  const num = (v: unknown) => positivePrice(typeof v === "string" ? Number(v) : v);
  const ranges = list.flatMap((s) => {
    const lo = num(s.price_min) ?? num(s.price_max);
    const hi = num(s.price_max) ?? lo;
    return lo != null && hi != null ? [{ lo: Math.min(lo, hi), hi: Math.max(lo, hi) }] : [];
  });
  if (!ranges.length) return null;
  return { min: Math.min(...ranges.map((r) => r.lo)), max: Math.max(...ranges.map((r) => r.hi)), count: ranges.length };
}

/**
 * Collect only real, positive prices from a turf. 1,909 of 3,120 active
 * turfs (26 Oct) have every price column NULL; this returns [] for
 * those. Never defaults to a fake number.
 */
function realPrices(turf: PricedTurf): number[] {
  return PRICE_FIELDS.map((f) => positivePrice(turf[f])).filter((p): p is number => p != null);
}

/** True when the turf has at least one real price column set. */
export function hasRealPrices(turf: PricedTurf): boolean {
  return realPrices(turf).length > 0;
}

/**
 * Minimum real price in ₹, or null when no price column is set.
 * Callers MUST handle null — do not coerce to a default.
 */
export function getMinimumPrice(turf: PricedTurf): number | null {
  const p = realPrices(turf);
  return p.length ? Math.min(...p) : null;
}

/**
 * Maximum real price in ₹, or null when no price column is set.
 */
export function getMaximumPrice(turf: PricedTurf): number | null {
  const p = realPrices(turf);
  return p.length ? Math.max(...p) : null;
}

/**
 * A range extracted from Google reviews (price_mentions). NEVER treat
 * these as our own prices — they must be labelled as unverified in the
 * UI and MUST NOT go into JSON-LD priceRange. Returns null when the
 * mentions array is empty or missing.
 */
export function getReportedPriceRange(
  turf: Pick<Turf, "price_mentions">,
): { min: number; max: number; mentions: NumericMention[] } | null {
  const mentions = (turf.price_mentions ?? []).filter(
    (m): m is NumericMention => !!m && positivePrice(m.price_inr) != null,
  );
  if (mentions.length === 0) return null;
  const values = mentions.map((m) => m.price_inr);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    mentions,
  };
}

/**
 * "/hr", "/90-min slot" or "/person": what the listed prices are per.
 * Defaults to per hour, which is what the price columns always meant.
 */
export function priceUnitSuffix(turf: Pick<Turf, "price_unit" | "slot_minutes">, opts: { short?: boolean } = {}): string {
  switch (turf.price_unit) {
    case "per_slot":
      return turf.slot_minutes && !opts.short ? `/${turf.slot_minutes}-min slot` : "/slot";
    case "per_person":
      return "/person";
    default:
      return "/hr";
  }
}

/**
 * Research notes about prices (free text with a source). Shown as
 * "Reported" lines with an unverified label; never numbers we claim.
 */
export function getTextPriceMentions(turf: Pick<Turf, "price_mentions">): PriceMention[] {
  return (turf.price_mentions ?? []).filter((m) => !!m && typeof m.text === "string" && m.text.trim().length > 0);
}

/**
 * Numeric research mentions ("₹500", with context) for the Pricing
 * section. summarisePrice() puts these in the header as a "reported"
 * range, so the section has to show what the range came from.
 */
export function getNumericPriceMentions(turf: Pick<Turf, "price_mentions">): NumericMention[] {
  return getReportedPriceRange(turf)?.mentions ?? [];
}

/**
 * What the Pricing section lists when the turf has no price table: notes
 * first, then bare numbers from reviews, three at most. Cleaned of any
 * booking app first (cleanPriceMentions), so a note that was only an
 * app's listing or grid never decides that this view shows.
 */
export function reportedMentions(turf: Pick<Turf, "price_mentions">): PriceMention[] {
  const clean = { price_mentions: cleanPriceMentions(turf.price_mentions) };
  return [...getTextPriceMentions(clean), ...getNumericPriceMentions(clean).filter((m) => !m.text?.trim())].slice(0, 3);
}

/**
 * Per-slot price for a table cell. A missing slot is "–", as in the
 * listed price bands, never "₹0" or "N/A" (24 weekend-only turfs read
 * "N/A/hr" in every weekday cell). Callers leave the unit off a missing
 * cell.
 */
export function formatPrice(price: number | null | undefined): string {
  const p = positivePrice(price);
  return p == null ? "–" : `₹${p}`;
}

/**
 * "₹600–800" (or "₹600") with Indian digit grouping, for cards. Null
 * when neither end is known, so a caller can never print "₹0".
 */
export function priceRangeText(min: number | null | undefined, max: number | null | undefined): string | null {
  const lo = positivePrice(min) ?? positivePrice(max);
  const hi = positivePrice(max) ?? lo;
  if (lo == null || hi == null) return null;
  return `₹${lo.toLocaleString("en-IN")}${lo !== hi ? `–${hi.toLocaleString("en-IN")}` : ""}`;
}

export type PriceSummary = {
  label: string;
  kind: "real" | "reported" | "reported_text" | "unknown";
  /** Both set for "real" and "reported"; both null otherwise. */
  min: number | null;
  max: number | null;
  /** "/hr", "/90-min slot", "/person" */
  unit: string;
};

/** A listed range as summarisePrice() words it: "₹600 – ₹800/hr", or "₹600/hr" when min == max. */
export function realPriceSummary(min: number, max: number, unit: string): PriceSummary {
  return {
    label: min === max ? `₹${min}${unit}` : `₹${min} – ₹${max}${unit}`,
    kind: "real",
    min,
    max,
    unit,
  };
}

/**
 * Short label for a turf card. Priority:
 *   1. real range        → "₹600 – ₹800/hr" (or "₹600/hr" if min==max)
 *   2. reported range    → "~₹1,000/hr (reported)"
 *   3. reported text     → "See reported prices" (research notes only)
 *   4. nothing           → "Prices not listed yet"
 * Weekend prices, if any, are still included in min/max. The suffix
 * follows price_unit ("/hr", "/slot", "/person"). Cards, sorting, Ask
 * and the sport-city stats use this; list rows carry no pricing_bands,
 * so a turf page uses summarisePagePrice() instead.
 */
export function summarisePrice(turf: Turf): PriceSummary {
  const unit = priceUnitSuffix(turf);
  const min = getMinimumPrice(turf);
  const max = getMaximumPrice(turf);
  if (min != null && max != null) return realPriceSummary(min, max, unit);
  const reported = getReportedPriceRange(turf);
  if (reported) {
    const label =
      reported.min === reported.max
        ? `~₹${reported.min}${unit} (reported)`
        : `~₹${reported.min}–${reported.max}${unit} (reported)`;
    return { label, kind: "reported", min: reported.min, max: reported.max, unit };
  }
  if (getTextPriceMentions(turf).length > 0) {
    return { label: "See reported prices", kind: "reported_text", min: null, max: null, unit };
  }
  return { label: "Prices not listed yet", kind: "unknown", min: null, max: null, unit };
}

/** True when the owner saved prices on myTapturf: theirs show first. */
export function ownerSetPrices(turf: PricedTurf): boolean {
  return turf.price_owner_confirmed === true && hasRealPrices(turf);
}

/** Lowest and highest listed per-hour price in pricing_bands, or null. */
export function getBandPriceRange(turf: Pick<Turf, "pricing_bands">): { min: number; max: number } | null {
  const values = (turf.pricing_bands ?? [])
    .map((b) => positivePrice(b?.price_per_hour))
    .filter((p): p is number => p != null);
  return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null;
}

/** A price band as the page's table shows it: no source note. */
export type BandRow = Pick<PriceBand, "band" | "days" | "price_per_hour"> & { format: string | null };

/**
 * The bands for the Pricing table, which is a client component: only what
 * it shows goes into the page. The stored source notes ("listing:booking-app
 * grid 2026-10-16") stay on the server.
 */
export function bandRows(bands: readonly PriceBand[] | null | undefined): BandRow[] {
  return (bands ?? []).map((b) => ({ band: b.band, days: b.days, format: b.format ?? null, price_per_hour: b.price_per_hour }));
}

/** The latest YYYY-MM-DD named in the bands' source notes, as "Oct 2026"; null when none names a date. */
export function bandsCheckedOn(bands: readonly PriceBand[] | null | undefined): string | null {
  let best = "";
  for (const b of bands ?? []) for (const d of (typeof b.source === "string" ? b.source : "").match(/\d{4}-\d{2}-\d{2}/g) ?? []) if (d > best) best = d;
  if (!best) return null;
  const [y, m] = best.split("-").map(Number);
  if (!(m >= 1 && m <= 12)) return null;
  return `${MONTHS[m - 1]} ${y}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Whether the turf page's Pricing table shows the listed price bands
 * (by format and time band, the richest we have) rather than the six
 * slot columns. The owner's own prices win over the bands.
 */
export function showsPriceBands(turf: PricedTurf): boolean {
  return getBandPriceRange(turf) != null && !ownerSetPrices(turf);
}

/**
 * The turf page's Pricing section has nothing to show: no listed bands,
 * no slot price and no reported price (TurfPricing's empty state, "Prices
 * not listed yet"). The claim prompts there follow it (lib/turfPage/claimPrompts.ts).
 */
export function showsNoPrices(turf: Turf): boolean {
  return !showsPriceBands(turf) && !hasRealPrices(turf) && reportedMentions(turf).length === 0;
}

/**
 * The turf page's price summary: the same numbers as its Pricing table.
 * When the table lists the bands, the header, sidebar, title, meta and
 * JSON-LD priceRange follow the bands too, so a page never quotes a rate
 * its own table doesn't have. On 26 Oct 279 turfs had bands and slot
 * columns with different ranges (PlayAll Noida 105's title said ₹660/hr
 * over a table listing only ₹1760), and 18 had only bands and read
 * "Price on request" above a full table. Which source wins everywhere,
 * cards included, is the owner's call; this keeps each page consistent
 * with itself.
 */
export function summarisePagePrice(turf: Turf): PriceSummary {
  const bands = showsPriceBands(turf) ? getBandPriceRange(turf) : null;
  if (bands) {
    const { min, max } = bands;
    return { label: min === max ? `₹${min}/hr` : `₹${min} – ₹${max}/hr`, kind: "real", min, max, unit: "/hr" };
  }
  return summarisePrice(turf);
}

// ── The listed price at a time ─────────────────────────────

/**
 * The turf page's Pricing table of six columns, the one place its three
 * rows and their times are written: the table draws its labels from here
 * (components/turf/TurfPricing.tsx) and listedPriceAt reads the same hours,
 * so the two cannot drift. `from` and `to` are hours of the day; Evening
 * runs "to close", which here is up to LATE_NIGHT_UNTIL the next morning.
 */
export const SLOT_TIMES = [
  { slot: "morning", name: "Morning", emoji: "🌅", time: "6AM – 12PM", from: 6, to: 12 },
  { slot: "afternoon", name: "Afternoon", emoji: "☀️", time: "12PM – 5PM", from: 12, to: 17 },
  { slot: "evening", name: "Evening", emoji: "🌙", time: "5PM – Close", from: 17, to: 24 },
] as const;

/**
 * The listed price bands' times, the one place they are written: the bands
 * table draws its labels from here (components/turf/PriceBands.tsx) and
 * listedPriceAt reads the same hours. Night is "after 9 pm", up to
 * LATE_NIGHT_UNTIL the next morning.
 */
export const BAND_TIMES = [
  { band: "morning", name: "Morning", time: "5 am to 12 pm", from: 5, to: 12 },
  { band: "day", name: "Afternoon", time: "12 to 5 pm", from: 12, to: 17 },
  { band: "evening", name: "Evening", time: "5 to 9 pm", from: 17, to: 21 },
  { band: "night", name: "Night", time: "after 9 pm", from: 21, to: 24 },
] as const satisfies readonly { band: PriceBand["band"]; name: string; time: string; from: number; to: number }[];

/**
 * 12 am and 1 am are the late night of the day before, as the site's own
 * hour choices have it (5 AM to 1 AM: "Did you get a slot?" and Ask for a
 * slot). Later hours before the first row starts are in no row of either
 * table.
 */
export const LATE_NIGHT_UNTIL = 2;

/**
 * Whose night an hour is: 12 am and 1 am of a calendar date belong to the
 * evening of the date before. Give it the calendar date of the start.
 */
export function nightOf(date: string, hour: number): string {
  return hour < LATE_NIGHT_UNTIL ? new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) : date;
}

/** Saturday or Sunday: the day the weekend prices are for. */
export function weekendDate(date: string): boolean {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

/** A listed price per hour for a time: one price (min = max) or a lowest and highest. `from` says whether the table has that time ("time") or only the turf's whole range could be read ("range"). */
export type ListedAt = { min: number; max: number; from: "time" | "range" };

const rowAt = <T extends { from: number; to: number }>(rows: readonly T[], hour: number): T | null => {
  // 12 am and 1 am read the last row (the evening or the night they end).
  const h = hour < LATE_NIGHT_UNTIL ? 23 : hour;
  return rows.find((r) => h >= r.from && h < r.to) ?? null;
};

/**
 * The turf's listed price per hour at a time, by the page's own Pricing
 * table and nothing else: the listed bands where the page shows those
 * (showsPriceBands), else the six columns. `weekend` is for the day whose
 * night the hour is (nightOf, weekendDate); `hour` is 0 to 23.
 *
 * "time": the table has a price for that time and day type. With bands it
 * can be a lowest and highest, one per format (5-a-side, 7-a-side), since
 * the time alone does not say which ground. "range": the table has no
 * price there (a weekend with only weekday prices, an hour in no row), so
 * this is the turf's lowest to highest listed price, the range its page
 * and card show. Null: no listed price per hour at all (none listed, or
 * listed per slot or per person). Reported prices from reviews are never
 * read.
 */
export function listedPriceAt(turf: PricedTurf, at: { weekend: boolean; hour: number }): ListedAt | null {
  const day = at.weekend ? "weekend" : "weekday";
  if (showsPriceBands(turf)) {
    const band = rowAt(BAND_TIMES, at.hour)?.band;
    const here = (turf.pricing_bands ?? [])
      .filter((b) => b?.band === band && (b.days === day || b.days === "all"))
      .map((b) => positivePrice(b.price_per_hour))
      .filter((p): p is number => p != null);
    if (here.length) return { min: Math.min(...here), max: Math.max(...here), from: "time" };
    const all = getBandPriceRange(turf);
    return all ? { ...all, from: "range" } : null;
  }
  // The six columns are per hour unless the listing says per slot or per person.
  if (turf.price_unit === "per_slot" || turf.price_unit === "per_person") return null;
  const slot = rowAt(SLOT_TIMES, at.hour)?.slot;
  const cell = slot ? positivePrice(turf[`${at.weekend ? "weekend_" : ""}${slot}_price`]) : null;
  if (cell != null) return { min: cell, max: cell, from: "time" };
  const min = getMinimumPrice(turf);
  const max = getMaximumPrice(turf);
  return min != null && max != null ? { min, max, from: "range" } : null;
}
