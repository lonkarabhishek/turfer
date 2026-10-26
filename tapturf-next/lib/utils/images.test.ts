import { test } from "node:test";
import assert from "node:assert/strict";
import { isOwnPhoto, orderPhotos, turfPhotos } from "./images";

const OWN = (h: string) => `https://hwfsbpzercuoshodmnuf.supabase.co/storage/v1/object/public/turf-photos/t1/${h.padEnd(24, "0")}.webp`;
const LH3 = (k: string) => `https://lh3.googleusercontent.com/gps-cs-s/${k}=w1600-h1200`;
const PLAYO = "https://playo.gumlet.io/venue/cover.jpg";

test("our own copies first, other hosts next, Google links last; order kept within each", () => {
  // DN Parande on 26 Oct: six dead Google photos ahead of seven of ours.
  const stored = [LH3("a"), LH3("b"), OWN("1"), PLAYO, OWN("2"), LH3("a")];
  assert.deepEqual(orderPhotos(stored), [OWN("1"), OWN("2"), PLAYO, LH3("a"), LH3("b")]);
  assert.deepEqual(orderPhotos([null, "", undefined, "  "]), []);
  assert.equal(isOwnPhoto(OWN("1")), true);
  assert.equal(isOwnPhoto(LH3("a")), false);
});

test("a turf's photos: the cover leads unless a copy of ours exists", () => {
  assert.deepEqual(turfPhotos({ cover_image: OWN("9"), images: [LH3("a"), OWN("1")] }), [OWN("9"), OWN("1"), LH3("a")]);
  // A Google cover goes behind our copies, not out.
  assert.deepEqual(turfPhotos({ cover_image: LH3("c"), images: [OWN("1"), LH3("a")] }), [OWN("1"), LH3("c"), LH3("a")]);
  // A Google-only turf keeps its stored order, cover first.
  assert.deepEqual(turfPhotos({ cover_image: LH3("c"), images: [LH3("a"), LH3("c")] }), [LH3("c"), LH3("a")]);
  // A tiny thumb is no cover.
  assert.deepEqual(turfPhotos({ cover_image: "https://x.test/p=w32-h32-p", images: [PLAYO] }), [PLAYO]);
  assert.deepEqual(turfPhotos({ cover_image: null, images: [] }), []);
  assert.deepEqual(turfPhotos({ cover_image: PLAYO, images: null }), [PLAYO]);
});
