import { test } from "node:test";
import assert from "node:assert/strict";
import { KEYBOARD_MIN, nextTallest, revealDelta, sameBox, viewportBox, type ViewportReading } from "./viewport";

// A 390 x 844 phone (an iPhone 14 in Safari, toolbars as they come).
const at = (p: Partial<ViewportReading> = {}): ViewportReading => ({ innerHeight: 844, width: 390, height: 844, offsetTop: 0, scale: 1, ...p });

test("no keyboard: the box is the whole layout viewport", () => {
  assert.deepEqual(viewportBox(at(), 844, true), { top: 0, height: 844, inset: 0, keyboard: false });
});

test("iOS keyboard over the layout viewport: the box ends at the keys", () => {
  // iOS keeps innerHeight at 844; the visible area is 500 tall from the top.
  assert.deepEqual(viewportBox(at({ height: 500 }), 844, true), { top: 0, height: 500, inset: 344, keyboard: true });
});

test("iOS scrolled the layout viewport to show a field: the box starts at offsetTop", () => {
  const box = viewportBox(at({ height: 500, offsetTop: 120 }), 844, true);
  assert.deepEqual(box, { top: 120, height: 500, inset: 224, keyboard: true });
  // The box is exactly what shows: [offsetTop, offsetTop + height].
  assert.equal(box!.top + box!.height + box!.inset, 844);
});

test("Android with resizes-content: the layout shrinks too, inset stays 0, nothing counted twice", () => {
  // innerHeight follows the keyboard; only the tallest height seen says a keyboard is up.
  const box = viewportBox(at({ innerHeight: 500, height: 500 }), 844, true);
  assert.deepEqual(box, { top: 0, height: 500, inset: 0, keyboard: true });
});

test("the address bar coming and going is not a keyboard", () => {
  assert.equal(viewportBox(at({ innerHeight: 788, height: 788 }), 844, true)!.keyboard, false);
  assert.equal(viewportBox(at({ height: 844 - KEYBOARD_MIN + 1 }), 844, true)!.keyboard, false);
  assert.equal(viewportBox(at({ height: 844 - KEYBOARD_MIN }), 844, true)!.keyboard, true);
});

test("no touch screen: a shorter window is never a keyboard, the box still follows it", () => {
  assert.deepEqual(viewportBox(at({ height: 500 }), 844, false), { top: 0, height: 500, inset: 344, keyboard: false });
});

test("pinch zoom or a bad reading leaves the overlay to CSS", () => {
  assert.equal(viewportBox(at({ scale: 2, height: 422 }), 844, true), null);
  assert.equal(viewportBox(at({ height: 0 }), 844, true), null);
  assert.equal(viewportBox(at({ height: Number.NaN }), 844, true), null);
  assert.equal(viewportBox(at({ innerHeight: 0 }), 844, true), null);
  // A tiny rounding of scale is still 1.
  assert.notEqual(viewportBox(at({ scale: 1.004 }), 844, true), null);
});

test("a bounce above the top: only the part below the layout viewport's top counts", () => {
  assert.deepEqual(viewportBox(at({ height: 500, offsetTop: -30 }), 844, true), { top: 0, height: 470, inset: 374, keyboard: true });
  assert.equal(viewportBox(at({ height: 20, offsetTop: -30 }), 844, true), null);
});

test("fractions are rounded to whole pixels", () => {
  assert.deepEqual(viewportBox(at({ height: 500.4, offsetTop: 10.6 }), 844, true), { top: 11, height: 500, inset: 333, keyboard: true });
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

test("sameBox compares every field", () => {
  const a = { top: 0, height: 500, inset: 344, keyboard: true };
  assert.equal(sameBox(a, { ...a }), true);
  assert.equal(sameBox(a, { ...a, keyboard: false }), false);
  assert.equal(sameBox(a, { ...a, top: 1 }), false);
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
