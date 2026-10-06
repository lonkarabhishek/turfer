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
 * Collect only real, positive prices from a turf. 140/177 active turfs
 * have every price column NULL — this returns [] for those. Never
 * defaults to a fake number.
 */
function realPrices(turf: Turf): number[] {
  return PRICE_FIELDS.map((f) => turf[f] as number | null)
    .filter((p): p is number => typeof p === "number" && p > 0);
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
    (m): m is NumericMention => !!m && typeof m.price_inr === "number" && m.price_inr > 0,
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
 * Human-friendly per-slot price. Returns "N/A" for null so table
 * cells with a missing slot stay obvious. Real display code should
 * usually branch on hasRealPrices() first.
 */
export function formatPrice(price: number | null | undefined): string {
  if (!price || price <= 0) return "N/A";
  return `₹${price}`;
}

/**
 * Short label for a turf card. Priority:
 *   1. real range        → "₹600 – ₹800/hr" (or "₹600/hr" if min==max)
 *   2. reported range    → "~₹1,000/hr (reported)"
 *   3. reported text     → "See reported prices" (research notes only)
 *   4. nothing           → "Price on request"
 * Weekend prices, if any, are still included in min/max. The suffix
 * follows price_unit ("/hr", "/slot", "/person").
 */
export function summarisePrice(turf: Turf): {
  label: string;
  kind: "real" | "reported" | "reported_text" | "unknown";
  min: number | null;
  max: number | null;
  /** "/hr", "/90-min slot", "/person" */
  unit: string;
} {
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
  return { label: "Price on request", kind: "unknown", min: null, max: null, unit };
}
