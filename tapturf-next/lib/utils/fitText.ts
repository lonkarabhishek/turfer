/**
 * A CSS font-size that keeps one unbreakable word on one line inside its
 * container: min(the inherited size, the container's width over the
 * word's width). The word's width is its length times `emPerChar`, the
 * average bold glyph width of the display face with its -0.025em
 * tracking. The face is the device's own (SF, Roboto, Segoe UI, Inter);
 * the widest common one, DejaVu Sans Bold on Linux, measures 0.605em per
 * letter for "Thiruvananthapuram.", so 0.64 leaves room. Needs an
 * ancestor with container-type: inline-size for the cqi unit; a browser
 * without container units drops the declaration and keeps the inherited
 * size, so pair it with overflow-wrap: anywhere.
 */
export function fitFontSize(word: string, emPerChar = 0.64): string {
  const em = Math.max(1, word.length) * emPerChar;
  return `min(1em, ${(100 / em).toFixed(2)}cqi)`;
}
