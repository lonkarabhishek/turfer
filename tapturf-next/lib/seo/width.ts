/**
 * How wide a title prints in Google's desktop results: Arial at 20px,
 * which cuts a title at about 580px (and, on a phone, at about 60
 * characters). Widths are Arial/Helvetica AFM units per 1000 em; a
 * character missing from the table counts as 600 (a little wider than
 * most), so an unknown glyph errs towards "too long".
 *
 * Pure (no imports), so node --test runs it and the blog check uses it.
 */

const PUNCT: Record<string, number> = {
  " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191, "(": 333, ")": 333, "*": 389, "+": 584,
  ",": 278, "-": 333, ".": 278, "/": 278, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015, "[": 278,
  "\\": 278, "]": 278, "^": 469, _: 556, "`": 333, "{": 334, "|": 260, "}": 334, "~": 584, "–": 556, "—": 1000, "·": 278,
  "₹": 556, "★": 800, "’": 222, "×": 584,
};
const UPPER: Record<string, number> = {
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778,
  P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
};
const LOWER: Record<string, number> = {
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556,
  p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
};

/** Estimated width in px of `s` in Arial at `size` px (20 = a Google desktop title). */
export function textWidthPx(s: string, size = 20): number {
  let w = 0;
  for (const ch of s) w += PUNCT[ch] ?? UPPER[ch] ?? LOWER[ch] ?? (/\d/.test(ch) ? 556 : 600);
  return Math.round((w * size) / 1000);
}

/** Longest title Google shows whole: 60 characters on a phone, about 580px on a desktop. */
export const TITLE_MAX_CHARS = 60;
export const TITLE_MAX_PX = 580;
/** Longest description shown whole on a phone. */
export const DESCRIPTION_MAX_CHARS = 155;

/** Whether a title shows whole on both a phone and a desktop. */
export function titleFits(t: string): boolean {
  return [...t].length <= TITLE_MAX_CHARS && textWidthPx(t) <= TITLE_MAX_PX;
}

/** " | TapTurf" on the end, only when the whole title still fits. */
export function withBrand(title: string, brand = "TapTurf"): string {
  const branded = `${title} | ${brand}`;
  return titleFits(branded) ? branded : title;
}

/**
 * Cut at a word boundary to at most `max` characters, never mid-word
 * when a boundary is in the second half, and without a dangling "and",
 * "&", "of", comma or dash at the end. No ellipsis: Google adds its own.
 */
export function truncateWords(s: string, max: number): string {
  if (max <= 0) return "";
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const at = cut.lastIndexOf(" ");
  return (at > max * 0.5 ? cut.slice(0, at) : s.slice(0, max)).replace(/(?:\s+(?:and|&|the|of|in|at))?[\s,–-]*$/i, "");
}
