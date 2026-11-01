/**
 * /map's count bubbles: their colours and the average price per hour
 * each one shows. A turf bubble says how many turfs it holds and what the
 * ones that list a price charge an hour on average ("406", "avg ₹1.2k/hr"),
 * summed by Supercluster as it clusters (map and reduce below), so the
 * average is over exactly the turfs in the bubble. Pure, relative imports
 * only, so `npm run test:list` compiles it on its own.
 */

/**
 * The map's palette, TapTurf teal (CLAUDE.md's primary, #00A699) deepened
 * where white text sits on it so every pairing passes WCAG AA (4.5:1 for
 * normal text; checked in clusters.test.ts). The engine hands these to the
 * page as CSS variables, and the heat layer reads them as is.
 */
export const MAP_COLORS = {
  /** TapTurf teal: rings, halos and the heat's cool end. Never under text (3.0:1 with white). */
  teal: "#00A699",
  /** A turf bubble's face, top: white text 4.6:1. */
  face: "#008478",
  /** Its face, bottom; a picked price pill; the price tag's ink on white: 7.2:1. */
  deep: "#00635B",
  /** A game bubble and pin (the site's accent-600): white text 5.0:1. */
  game: "#15803D",
  /** The "avg" on a price tag, on white: 5.1:1. */
  muted: "#6E6E73",
  /** TapTurf coral: the heat's hottest end. */
  hot: "#FF385C",
} as const;

/** sRGB relative luminance of "#RRGGBB" (WCAG 2). */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two "#RRGGBB" colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * What a point or bubble carries for the average: the sum of the hourly
 * prices under it (ps) and how many turfs those are (pn). A turf with no
 * listed hourly price adds 0 and 0, so it counts in the bubble's number
 * and never in its average.
 */
export type PriceSum = { ps: number; pn: number };

/** A pin's share of the sums: its hourly price, or nothing. Supercluster's `map`. */
export function priceSum(hourly: number | null | undefined): PriceSum {
  return typeof hourly === "number" && Number.isFinite(hourly) && hourly > 0 ? { ps: hourly, pn: 1 } : { ps: 0, pn: 0 };
}

/** Folds one point's or bubble's sums into another's. Supercluster's `reduce` (it mutates `acc`). */
export function addPriceSum(acc: PriceSum, add: Readonly<PriceSum>): void {
  acc.ps += add.ps;
  acc.pn += add.pn;
}

/** The bubble's average hourly price, or null when none of its turfs lists one. */
export function averagePrice(s: Partial<PriceSum> | null | undefined): number | null {
  const ps = s?.ps;
  const pn = s?.pn;
  if (typeof ps !== "number" || typeof pn !== "number" || !(pn > 0) || !(ps > 0)) return null;
  return ps / pn;
}

/** An average, as a person would say it: to the nearest ₹10 ("₹1,150"). */
export function avgPriceWords(avg: number): string {
  return `₹${(Math.round(avg / 10) * 10).toLocaleString("en-IN")}`;
}

/**
 * An average on a bubble, short: "₹950" under a thousand (to the nearest
 * ₹10), then thousands to one decimal ("₹1.2k", "₹1k"), and whole
 * thousands from ₹10,000 ("₹12k").
 */
export function avgPriceShort(avg: number): string {
  const r = Math.round(avg / 10) * 10;
  if (r < 1000) return `₹${r}`;
  // Rounded once, from the average itself: ₹1,147 is ₹1.1k, not ₹1,150 and then ₹1.2k.
  if (avg < 9950) return `₹${Math.round(avg / 100) / 10}k`;
  return `₹${Math.round(avg / 1000)}k`;
}

/** A bubble's count: "406", "2,434", then "12k" from ten thousand, so it fits the bubble. */
export function countText(n: number): string {
  return n < 10_000 ? n.toLocaleString("en-IN") : `${Math.round(n / 1000)}k`;
}
