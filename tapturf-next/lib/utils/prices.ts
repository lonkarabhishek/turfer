import type { Turf, PriceMention } from "@/types/turf";

type NumericMention = PriceMention & { price_inr: number };

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
 * Collect only real, positive prices from a turf. 1,909 of 3,120 active
 * turfs (26 Oct) have every price column NULL; this returns [] for
 * those. Never defaults to a fake number.
 */
function realPrices(turf: Turf): number[] {
  return PRICE_FIELDS.map((f) => positivePrice(turf[f])).filter((p): p is number => p != null);
}

/** True when the turf has at least one real price column set. */
export function hasRealPrices(turf: Turf): boolean {
  return realPrices(turf).length > 0;
}

/**
 * Minimum real price in ₹, or null when no price column is set.
 * Callers MUST handle null — do not coerce to a default.
 */
export function getMinimumPrice(turf: Turf): number | null {
  const p = realPrices(turf);
  return p.length ? Math.min(...p) : null;
}

/**
 * Maximum real price in ₹, or null when no price column is set.
 */
export function getMaximumPrice(turf: Turf): number | null {
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
  turf: Turf,
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
export function getTextPriceMentions(turf: Turf): PriceMention[] {
  return (turf.price_mentions ?? []).filter((m) => !!m && typeof m.text === "string" && m.text.trim().length > 0);
}

/**
 * Numeric research mentions ("₹500", with context) for the Pricing
 * section. summarisePrice() puts these in the header as a "reported"
 * range, so the section has to show what the range came from.
 */
export function getNumericPriceMentions(turf: Turf): NumericMention[] {
  return getReportedPriceRange(turf)?.mentions ?? [];
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
  if (min != null && max != null) {
    return {
      label: min === max ? `₹${min}${unit}` : `₹${min} – ₹${max}${unit}`,
      kind: "real",
      min,
      max,
      unit,
    };
  }
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
export function ownerSetPrices(turf: Turf): boolean {
  return turf.price_owner_confirmed === true && hasRealPrices(turf);
}

/** Lowest and highest listed per-hour price in pricing_bands, or null. */
export function getBandPriceRange(turf: Pick<Turf, "pricing_bands">): { min: number; max: number } | null {
  const values = (turf.pricing_bands ?? [])
    .map((b) => positivePrice(b?.price_per_hour))
    .filter((p): p is number => p != null);
  return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null;
}

/**
 * Whether the turf page's Pricing table shows the listed price bands
 * (by format and time band, the richest we have) rather than the six
 * slot columns. The owner's own prices win over the bands.
 */
export function showsPriceBands(turf: Turf): boolean {
  return getBandPriceRange(turf) != null && !ownerSetPrices(turf);
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
