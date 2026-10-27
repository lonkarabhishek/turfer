import { test } from "node:test";
import assert from "node:assert/strict";
import { KEYBOARD_MIN, nextTallest, revealDelta, sameBox, viewportBox, type ViewportBox, type ViewportReading } from "./viewport";

// A 390 x 844 phone (an iPhone 14 in Safari, toolbars as they come), a field focused unless said otherwise.
const at = (p: Partial<ViewportReading> = {}): ViewportReading => ({
  innerHeight: 844,
  width: 390,
  height: 844,
  offsetTop: 0,
  offsetLeft: 0,
  scale: 1,
  typing: true,
  ...p,
});
const box = (p: Partial<ViewportBox>): ViewportBox => ({ top: 0, height: 844, left: null, width: null, inset: 0, keyboard: false, ...p });

test("no keyboard: the box is the whole layout viewport", () => {
  assert.deepEqual(viewportBox(at(), 844, true), box({}));
});

test("iOS keyboard over the layout viewport: the box ends at the keys", () => {
  // iOS keeps innerHeight at 844; the visible area is 500 tall from the top.
  assert.deepEqual(viewportBox(at({ height: 500 }), 844, true), box({ height: 500, inset: 344, keyboard: true }));
});

test("iOS scrolled the layout viewport to show a field: the box starts at offsetTop", () => {
  const b = viewportBox(at({ height: 500, offsetTop: 120 }), 844, true);
  assert.deepEqual(b, box({ top: 120, height: 500, inset: 224, keyboard: true }));
  // The box is exactly what shows: [offsetTop, offsetTop + height].
  assert.equal(b!.top + b!.height + b!.inset, 844);
});

test("Android with resizes-content: the layout shrinks too, inset stays 0, nothing counted twice", () => {
  // innerHeight follows the keyboard; only the tallest height seen says a keyboard is up.
  assert.deepEqual(viewportBox(at({ innerHeight: 500, height: 500 }), 844, true), box({ height: 500, keyboard: true }));
});

test("the address bar coming and going is not a keyboard", () => {
  assert.equal(viewportBox(at({ innerHeight: 788, height: 788 }), 844, true)!.keyboard, false);
  assert.equal(viewportBox(at({ height: 844 - KEYBOARD_MIN + 1 }), 844, true)!.keyboard, false);
  assert.equal(viewportBox(at({ height: 844 - KEYBOARD_MIN }), 844, true)!.keyboard, true);
});

test("no touch screen: a shorter window is never a keyboard, the box still follows it", () => {
  assert.deepEqual(viewportBox(at({ height: 500 }), 844, false), box({ height: 500, inset: 344 }));
});

test("no field focused: never a keyboard, whatever the heights say", () => {
  // Android split screen at the same width, an iPad window made shorter, DevTools docked on a touch laptop.
  assert.equal(viewportBox(at({ typing: false, innerHeight: 380, height: 380 }), 780, true)!.keyboard, false);
  assert.equal(viewportBox(at({ typing: false, height: 500 }), 844, true)!.keyboard, false);
});

test("zoomed in (iOS zooms into a small field and stays): the box is still what shows, sideways too", () => {
  // Zoom 1.14 after a 14px field, the page panned to (20, 50), keys up: 500 screen px show, 438.6 CSS px.
  const z = at({ scale: 1.14, width: 342.1, height: 438.6, offsetLeft: 20.4, offsetTop: 50.2 });
  // tallest is in screen terms: 844 with no keys. 844 - 438.6 * 1.14 = 344 of keys.
  assert.deepEqual(viewportBox(z, 844, true), box({ top: 50, height: 439, left: 20, width: 343, inset: 0, keyboard: true }));
  // Zoomed with no keys: the visible area is 740 CSS px tall (844 screen px), not a keyboard.
  const still = viewportBox(at({ scale: 1.14, width: 342.1, height: 740.4, offsetTop: 60 }), 844, true)!;
  assert.equal(still.keyboard, false);
  assert.equal(still.inset, 0);
  assert.deepEqual([still.top, still.height, still.left, still.width], [60, 741, 0, 343]);
  // A tiny rounding of scale is still 1: left and right stay as CSS has them.
  assert.equal(viewportBox(at({ scale: 1.004 }), 844, true)!.width, null);
});

test("a bad reading leaves the overlay to CSS", () => {
  assert.equal(viewportBox(at({ height: 0 }), 844, true), null);
  assert.equal(viewportBox(at({ height: Number.NaN }), 844, true), null);
  assert.equal(viewportBox(at({ innerHeight: 0 }), 844, true), null);
  assert.equal(viewportBox(at({ scale: 0 }), 844, true), null);
  assert.equal(viewportBox(at({ offsetLeft: Number.NaN }), 844, true), null);
  assert.equal(viewportBox(at({ scale: 2, width: 195, offsetLeft: -200 }), 844, true), null);
});

test("a bounce above the top: only the part below the layout viewport's top counts", () => {
  assert.deepEqual(viewportBox(at({ height: 500, offsetTop: -30 }), 844, true), box({ height: 470, inset: 374, keyboard: true }));
  assert.equal(viewportBox(at({ height: 20, offsetTop: -30 }), 844, true), null);
});

test("fractions go outward to whole pixels: the box never falls short of what shows", () => {
  // [10.6, 511] -> [10, 511].
  assert.deepEqual(viewportBox(at({ height: 500.4, offsetTop: 10.6 }), 844, true), box({ top: 10, height: 501, inset: 333, keyboard: true }));
  // Android at DPR 2.625: 793.3 visible, the box is 794 (not 793, which left a strip uncovered).
  assert.equal(viewportBox(at({ innerHeight: 793, height: 793.3 }), 793.3, true)!.height, 794);
});

test("tallest: the most seen at one width, a turned phone starts again", () => {
  let t = nextTallest(null, at({ height: 500 }));
  assert.deepEqual(t, { width: 390, height: 500 });
  t = nextTallest(t, at({ height: 844 }));
  t = nextTallest(t, at({ height: 600 }));
  assert.deepEqual(t, { width: 390, height: 844 });
  t = nextTallest(t, at({ width: 844, height: 390 }));
  assert.deepEqual(t, { width: 844, height: 390 });
  // A bad reading keeps what was known.
  assert.deepEqual(nextTallest(t, at({ height: Number.NaN })), t);
  assert.deepEqual(nextTallest(null, at({ height: 0 })), { width: 0, height: 0 });
});

test("tallest: in screen terms, so zooming keeps it", () => {
  const t = nextTallest(null, at({ typing: false }));
  // Zoom 1.14 with the keys up: 342 x 438.6 CSS px is 390 x 500 on screen, same width, the 844 stays.
  assert.deepEqual(nextTallest(t, at({ scale: 1.14, width: 390 / 1.14, height: 438.6 })), { width: 390, height: 844 });
});

test("tallest: with no field focused it is what shows now (a window made shorter starts again)", () => {
  // Full screen, then split screen at the same width with nothing focused: 380 is the height with no keys.
  let t = nextTallest(null, at({ typing: false, height: 780, innerHeight: 780 }));
  t = nextTallest(t, at({ typing: false, height: 380, innerHeight: 380 }));
  assert.deepEqual(t, { width: 390, height: 380 });
  // Then a field and the keys: the drop from 380 is the keyboard.
  t = nextTallest(t, at({ height: 150, innerHeight: 150 }));
  assert.deepEqual(t, { width: 390, height: 380 });
  assert.equal(viewportBox(at({ height: 150, innerHeight: 150 }), t.height, true)!.keyboard, true);
  // And no keyboard while the split window is simply shorter than it once was.
  assert.equal(viewportBox(at({ height: 380, innerHeight: 380 }), t.height, true)!.keyboard, false);
});

test("sameBox compares every field", () => {
  const a = box({ height: 500, inset: 344, keyboard: true });
  assert.equal(sameBox(a, { ...a }), true);
  assert.equal(sameBox(a, { ...a, keyboard: false }), false);
  assert.equal(sameBox(a, { ...a, top: 1 }), false);
  assert.equal(sameBox(a, { ...a, left: 20, width: 342 }), false);
  assert.equal(sameBox(null, null), true);
  assert.equal(sameBox(a, null), false);
});

test("revealDelta: the least scroll that shows a field, margin clear", () => {
  const view = { top: 100, bottom: 400 };
  // Shows already.
  assert.equal(revealDelta({ top: 150, bottom: 200 }, view), 0);
  // Below: scroll down until its bottom is 12 above the view's bottom.
  assert.equal(revealDelta({ top: 420, bottom: 470 }, view), 470 - 388);
  // Above: scroll up.
  assert.equal(revealDelta({ top: 60, bottom: 110 }, view), 60 - 112);
  // Taller than the room: its top goes to the top.
  assert.equal(revealDelta({ top: 300, bottom: 700 }, view), 300 - 112);
  // No room at all: leave it.
  assert.equal(revealDelta({ top: 0, bottom: 10 }, { top: 0, bottom: 20 }), 0);
  assert.equal(revealDelta({ top: 450, bottom: 470 }, view, 0), 70);
});
