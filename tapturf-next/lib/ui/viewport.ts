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
  /** visualViewport.width, height, offsetTop, offsetLeft and scale. */
  width: number;
  height: number;
  offsetTop: number;
  offsetLeft: number;
  scale: number;
  /** A text field has focus: only then can an on-screen keyboard be up. */
  typing: boolean;
};

/** Where a fixed overlay goes to cover only what is visible (whole CSS px that never fall short of it). */
export type ViewportBox = {
  /** From the layout viewport's top to the visible area's top (a fixed element's `top`). */
  top: number;
  /** The visible height (the overlay's `height`). */
  height: number;
  /**
   * Only while zoomed (scale not 1), else null: the visible area is then
   * narrower than the page too, and the overlay follows it sideways.
   */
  left: number | null;
  width: number | null;
  /** What covers the bottom of the layout viewport (the keyboard on iOS; about 0 when the layout shrinks instead, 0 while zoomed). */
  inset: number;
  /** An on-screen keyboard is open: a field has focus and the visible area lost at least KEYBOARD_MIN to it. */
  keyboard: boolean;
};

/** Less than this is the address bar coming and going, not a keyboard (phone keyboards are 250 to 350 px). */
export const KEYBOARD_MIN = 120;

/**
 * The tallest visible height seen at a width: what the visible area is
 * with no keyboard. In screen terms (CSS px times scale), so zooming does
 * not change it; a new width (a turned phone) starts again, and so does
 * any reading with no field focused (no keyboard can be up then: a window
 * made shorter, split screen, a docked panel is the new height).
 */
export type Tallest = { width: number; height: number };

export function nextTallest(prev: Tallest | null, r: ViewportReading): Tallest {
  if (!usable(r)) return prev ?? { width: 0, height: 0 };
  const width = r.width * r.scale;
  const height = r.height * r.scale;
  if (!r.typing || !prev || Math.abs(prev.width - width) > 1) return { width, height };
  return { width: prev.width, height: Math.max(prev.height, height) };
}

function usable(r: ViewportReading): boolean {
  return (
    [r.innerHeight, r.width, r.height, r.offsetTop, r.offsetLeft, r.scale].every(Number.isFinite) &&
    r.height > 0 &&
    r.innerHeight > 0 &&
    r.width > 0 &&
    r.scale > 0
  );
}

/**
 * The visible area for a fixed overlay, or null to leave the overlay as
 * CSS has it (`inset-0`, dvh) when nothing usable was read. `tallest` is
 * nextTallest's height (0 when unknown). `touch`: the device has a touch
 * screen; only then can a shorter visible area be a keyboard (a desktop
 * window made shorter is not one).
 *
 * Zoomed in (iOS zooms into a focused field under 16px and stays there),
 * the box is still the visible area: visualViewport's offsets and size are
 * CSS px of the layout viewport, which is what a fixed element is placed
 * in, so the sheet fills what shows, sideways too.
 *
 * The keyboard is open when a field has focus and the keys cover the
 * layout viewport (iOS: inset), or the visible area shrank by a
 * keyboard's height since it was tallest (Android, where the layout
 * viewport shrinks with it and inset stays 0). The overlay never counts
 * both: its box is the visible area itself.
 */
export function viewportBox(r: ViewportReading, tallest: number, touch: boolean): ViewportBox | null {
  if (!usable(r)) return null;
  // iOS can report a negative offset while the page bounces: only the part inside the layout viewport is on screen.
  const top = Math.max(0, r.offsetTop);
  const bottom = r.offsetTop + r.height;
  if (bottom - top <= 0) return null;
  const zoomed = Math.abs(r.scale - 1) > 0.01;
  let left: number | null = null;
  let width: number | null = null;
  if (zoomed) {
    const l = Math.max(0, r.offsetLeft);
    const right = r.offsetLeft + r.width;
    if (right - l <= 0) return null;
    left = Math.floor(l);
    width = Math.ceil(right) - left;
  }
  // Zoomed in, what lies below the visible area is page, not keys: only the drop in screen terms tells then.
  const inset = zoomed ? 0 : Math.max(0, r.innerHeight - bottom);
  const drop = tallest - r.height * r.scale;
  const keyboard = touch && r.typing && (inset >= KEYBOARD_MIN || drop >= KEYBOARD_MIN);
  // Outward to whole px: a fraction short would leave a strip of the visible area uncovered.
  const t = Math.floor(top);
  return { top: t, height: Math.ceil(bottom) - t, left, width, inset: Math.round(inset), keyboard };
}

export function sameBox(a: ViewportBox | null, b: ViewportBox | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.height === b.height && a.left === b.left && a.width === b.width && a.inset === b.inset && a.keyboard === b.keyboard;
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
