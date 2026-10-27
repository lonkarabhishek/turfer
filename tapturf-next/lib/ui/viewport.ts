/**
 * The part of the page a phone actually shows, from window.visualViewport.
 *
 * Android Chrome follows the layout's interactiveWidget: "resizes-content"
 * and shrinks the layout viewport above the keyboard. iOS Safari and the
 * in-app browsers (WhatsApp, Instagram) do not: the keyboard covers the
 * bottom of the layout viewport, 100dvh stays as it was, and the browser
 * may scroll the layout viewport (offsetTop > 0) to show a focused field.
 * A sheet that sits in `fixed inset-0` is then partly under the keys.
 * These numbers say where the visible area is, so a sheet can sit in it.
 *
 * Pure: no window, no DOM (useVisualViewport reads them; tests run in node).
 */

/** What the browser reports, in CSS px. */
export type ViewportReading = {
  /** window.innerHeight: the layout viewport, which iOS keeps when the keyboard opens. */
  innerHeight: number;
  /** visualViewport.width, height, offsetTop and scale. */
  width: number;
  height: number;
  offsetTop: number;
  scale: number;
};

/** Where a fixed overlay goes to cover only what is visible. */
export type ViewportBox = {
  /** From the layout viewport's top to the visible area's top (a fixed element's `top`). */
  top: number;
  /** The visible height (the overlay's `height`). */
  height: number;
  /** What covers the bottom of the layout viewport (the keyboard on iOS; about 0 when the layout shrinks instead). */
  inset: number;
  /** An on-screen keyboard is open: the visible area lost at least KEYBOARD_MIN to it. */
  keyboard: boolean;
};

/** Less than this is the address bar coming and going, not a keyboard (phone keyboards are 250 to 350 px). */
export const KEYBOARD_MIN = 120;

/** The tallest visible height seen at a width: what the visible area is with no keyboard. A new width (a turned phone) starts again. */
export type Tallest = { width: number; height: number };

export function nextTallest(prev: Tallest | null, r: ViewportReading): Tallest {
  if (!usable(r)) return prev ?? { width: 0, height: 0 };
  if (!prev || Math.abs(prev.width - r.width) > 1) return { width: r.width, height: r.height };
  return { width: prev.width, height: Math.max(prev.height, r.height) };
}

function usable(r: ViewportReading): boolean {
  return [r.innerHeight, r.width, r.height, r.offsetTop, r.scale].every(Number.isFinite) && r.height > 0 && r.innerHeight > 0 && r.width > 0;
}

/**
 * The visible area for a fixed overlay, or null to leave the overlay as
 * CSS has it (`inset-0`, dvh): nothing usable read, or the page is pinch
 * zoomed (moving a sheet under someone's fingers while they zoom is worse
 * than leaving it). `tallest` is nextTallest's height (0 when unknown).
 * `touch`: the device has a touch screen; only then can a shorter
 * visible area be a keyboard (a desktop window made shorter is not one).
 *
 * The keyboard is open when it covers the layout viewport (iOS: inset), or
 * when the visible area shrank by a keyboard's height since it was tallest
 * (Android, where the layout viewport shrinks with it and inset stays 0).
 * The overlay never counts both: its box is the visible area itself.
 */
export function viewportBox(r: ViewportReading, tallest: number, touch: boolean): ViewportBox | null {
  if (!usable(r)) return null;
  if (Math.abs(r.scale - 1) > 0.01) return null;
  // iOS can report a negative offsetTop while the page bounces: only the part below the layout viewport's top is on screen.
  const top = Math.max(0, r.offsetTop);
  const height = r.height + Math.min(0, r.offsetTop);
  if (height <= 0) return null;
  const inset = Math.max(0, r.innerHeight - r.height - r.offsetTop);
  const keyboard = touch && (inset >= KEYBOARD_MIN || tallest - r.height >= KEYBOARD_MIN);
  return { top: Math.round(top), height: Math.round(height), inset: Math.round(inset), keyboard };
}

export function sameBox(a: ViewportBox | null, b: ViewportBox | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.height === b.height && a.inset === b.inset && a.keyboard === b.keyboard;
}

/** A vertical span on screen (getBoundingClientRect's top and bottom). */
export type Span = { top: number; bottom: number };

/**
 * How far to scroll a box (scrollTop += the answer) so a focused field
 * shows inside its visible span, `margin` clear of the edges: the least
 * move that does it, or its top when it is taller than the space.
 * 0 when it shows already.
 */
export function revealDelta(field: Span, view: Span, margin = 12): number {
  const room = view.bottom - view.top - 2 * margin;
  if (room <= 0) return 0;
  const lo = view.top + margin;
  const hi = view.bottom - margin;
  if (field.bottom - field.top > room) return field.top - lo;
  if (field.bottom > hi) return field.bottom - hi;
  if (field.top < lo) return field.top - lo;
  return 0;
}
