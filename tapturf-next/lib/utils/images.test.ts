import { test } from "node:test";
import assert from "node:assert/strict";
import { convertImageUrls, firstImageUrl, isOwnPhoto, orderPhotos, turfPhotos } from "./images";

const OWN = (h: string) => `https://hwfsbpzercuoshodmnuf.supabase.co/storage/v1/object/public/turf-photos/t1/${h.padEnd(24, "0")}.webp`;
const LH3 = (k: string) => `https://lh3.googleusercontent.com/gps-cs-s/${k}=w1600-h1200`;
// Another host that is no booking app: Yappe, a business directory.
const YAPPE = "https://files.yappe.in/place/full/the-turf-ground-4279055.webp";
// Booking apps' photos (26 Oct): TapTurf shows none of them.
const PLAYO = "https://playo.gumlet.io/OFFSIDE20220118061504299878/offside1642486494630.jpg";
const DISTRICT = "https://cdn.district.in/assets/events/publisher/event_gallery/01KXZS43PEXENHYYBP7DGNN892.jpg";
const TURFWALA = "https://turfwala.com/public/storage/images/exterior/1719337316_exx.png";
const HUDLE = "https://img1.hudle.in/venues/3528/images/1040x490/x.jpg";

test("our own copies first, other hosts next, Google links last; order kept within each", () => {
  // DN Parande on 26 Oct: six dead Google photos ahead of seven of ours.
  const stored = [LH3("a"), LH3("b"), OWN("1"), YAPPE, OWN("2"), LH3("a")];
  assert.deepEqual(orderPhotos(stored), [OWN("1"), OWN("2"), YAPPE, LH3("a"), LH3("b")]);
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
  assert.deepEqual(turfPhotos({ cover_image: "https://x.test/p=w32-h32-p", images: [YAPPE] }), [YAPPE]);
  assert.deepEqual(turfPhotos({ cover_image: null, images: [] }), []);
  assert.deepEqual(turfPhotos({ cover_image: YAPPE, images: null }), [YAPPE]);
});

test("booking apps' photos never show: not in the order, not as the cover, not after normalising", () => {
  assert.deepEqual(orderPhotos([PLAYO, OWN("1"), DISTRICT, LH3("a"), TURFWALA, HUDLE, YAPPE]), [OWN("1"), YAPPE, LH3("a")]);
  assert.deepEqual(turfPhotos({ cover_image: PLAYO, images: [DISTRICT, LH3("a")] }), [LH3("a")]);
  assert.deepEqual(turfPhotos({ cover_image: PLAYO, images: [DISTRICT] }), []);
  // transformTurf's cleaning: comma-joined lists too.
  assert.deepEqual(convertImageUrls([`${PLAYO}, ${OWN("2")}`, DISTRICT, YAPPE]), [OWN("2"), YAPPE]);
  assert.equal(firstImageUrl(PLAYO), null);
  assert.equal(firstImageUrl(`${PLAYO}, ${OWN("3")}`), OWN("3"));
});
