import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TURF_PHOTOS_BUCKET,
  cardPhotoSrc,
  convertImageUrls,
  firstImageUrl,
  isOwnPhoto,
  isSitePhoto,
  orderPhotos,
  sitemapPhotos,
  sitePhotoKey,
  sitePhotoUrl,
  turfPhotos,
} from "./images";

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

// ── our photos from tapturf.in (sitePhotoUrl, the photo route's sitePhotoKey) ──

const TURF = "5b9f50b1-dcce-45a9-9c8f-c847812b18d0";
const BUCKET = (key: string) => `${TURF_PHOTOS_BUCKET}${key}`;
const SITE = (key: string) => `https://www.tapturf.in/photos/turf/${key}`;

test("our bucket's photos move to tapturf.in, every other URL stays as it is", () => {
  for (const key of [
    `${TURF}/0123456789abcdef01234567.webp`,
    `${TURF}/0123456789abcdef01234567-card.webp`,
    `${TURF}/0123456789abcdef01234567.jpg`,
    `${TURF}/abcdefgh.jpeg`,
    `${TURF}/${"z9".repeat(32)}.png`,
    `owner/${TURF}/0123456789abcdef01234567.jpg`,
    `owner/${TURF}/0123456789abcdef01234567-card.webp`,
  ]) {
    assert.equal(sitePhotoUrl(BUCKET(key)), SITE(key), key);
    // As a path, for <img> on our own pages.
    assert.equal(sitePhotoUrl(BUCKET(key), ""), `/photos/turf/${key}`, key);
    assert.equal(isSitePhoto(sitePhotoUrl(BUCKET(key))), true);
    assert.equal(isSitePhoto(sitePhotoUrl(BUCKET(key), "")), true);
  }
  for (const url of [
    LH3("a"),
    YAPPE,
    "https://drive.google.com/thumbnail?id=abc&sz=w2000",
    "https://cdn.district.in/assets/a.jpg",
    // Not our project, not that bucket.
    `https://x.supabase.co/storage/v1/object/public/turf-photos/${TURF}/0123456789abcdef01234567.webp`,
    BUCKET(`${TURF}/0123456789abcdef01234567.webp`).replace("/turf-photos/", "/avatars/"),
    BUCKET(`${TURF}/0123456789abcdef01234567.webp`).replace("/turf-photos/", "/review-photos/"),
    BUCKET(`${TURF}/0123456789abcdef01234567.webp`).replace("/public/", "/authenticated/"),
    // Names the route would refuse stay on Supabase.
    BUCKET(`${TURF}/0123456789abcdef01234567.webp?v=1`),
    BUCKET(`${TURF}/0123456789abcdef01234567.webp#x`),
    BUCKET(`${TURF}/0123456789ABCDEF01234567.webp`),
    BUCKET(`${TURF}/abc.webp`),
    BUCKET(`${TURF}/${"a".repeat(65)}.webp`),
    BUCKET(`${TURF}/0123456789abcdef01234567.gif`),
    BUCKET(`${TURF}/0123456789abcdef01234567.svg`),
    BUCKET(`${TURF}/0123456789abcdef01234567-thumb.webp`),
    BUCKET(`t1/0123456789abcdef01234567.webp`),
    BUCKET(`${TURF.toUpperCase()}/0123456789abcdef01234567.webp`),
    BUCKET(`${TURF}/x/0123456789abcdef01234567.webp`),
    BUCKET(`other/${TURF}/0123456789abcdef01234567.webp`),
    BUCKET(`${TURF}/../avatars/0123456789abcdef01234567.webp`),
    BUCKET(`${TURF}/%2e%2e/0123456789abcdef01234567.webp`),
    "",
  ]) {
    assert.equal(sitePhotoUrl(url), url, url);
    assert.equal(isSitePhoto(url), false, url);
  }
  assert.equal(sitePhotoUrl(null as unknown as string), null);
});

test("the photo route answers only the bucket's own names: no query, encoding, other folder or bucket", () => {
  const key = `${TURF}/0123456789abcdef01234567.webp`;
  assert.equal(sitePhotoKey(`/photos/turf/${key}`), key);
  assert.equal(sitePhotoKey(`/photos/turf/${key}`, ""), key);
  assert.equal(sitePhotoKey(`/photos/turf/${TURF}/0123456789abcdef01234567-card.webp`), `${TURF}/0123456789abcdef01234567-card.webp`);
  assert.equal(sitePhotoKey(`/photos/turf/owner/${key}`), `owner/${key}`);
  for (const [path, search] of [
    [`/photos/turf/${key}`, "?v=1"],
    [`/photos/turf/${key}`, "?"],
    [`/photos/turf/${key}/`, ""],
    [`/photos/turf//${key}`, ""],
    [`/photos/turf/${TURF}/%2e%2e%2f0123456789abcdef01234567.webp`, ""],
    [`/photos/turf/${TURF}/0123456789abcdef01234567%2ewebp`, ""],
    [`/photos/turf/../avatars/${key}`, ""],
    [`/photos/turf/avatars/${key}`, ""],
    [`/photos/turf/review-photos/${key}`, ""],
    [`/photos/turf/owner/owner/${key}`, ""],
    [`/photos/turf/${TURF}`, ""],
    [`/photos/turf/`, ""],
    [`/photos/turf/${TURF}/0123456789abcdef01234567.webp.png`, ""],
    [`/photos/turf/${TURF}/0123456789abcdef01234567.html`, ""],
    [`/photos/turf/${TURF}/0123456789abcdef01234567.WEBP`, ""],
    [`/photos/turf/${TURF}/abcdefg.webp`, ""],
    [`/photos/turf/https://evil.test/${key}`, ""],
    [`/photos/turf/${TURF}/0123456789abcdef01234567.webp\n`, ""],
    [`/storage/v1/object/public/turf-photos/${key}`, ""],
    [`/photos/turfx/${key}`, ""],
  ]) {
    assert.equal(sitePhotoKey(path, search), null, `${path}${search}`);
  }
});

test("cards and tiles: the card size of ours from tapturf.in, others as imageUrlForCard gives them", () => {
  const full = BUCKET(`${TURF}/0123456789abcdef01234567.webp`);
  assert.equal(cardPhotoSrc(full), `/photos/turf/${TURF}/0123456789abcdef01234567-card.webp`);
  assert.equal(cardPhotoSrc(BUCKET(`owner/${TURF}/0123456789abcdef01234567.jpg`)), `/photos/turf/owner/${TURF}/0123456789abcdef01234567-card.jpg`);
  // A name with no card copy (not 24 hex) stays the full size, still from tapturf.in.
  assert.equal(cardPhotoSrc(BUCKET(`${TURF}/abcdefgh.png`)), `/photos/turf/${TURF}/abcdefgh.png`);
  assert.equal(cardPhotoSrc(LH3("a")), "https://lh3.googleusercontent.com/gps-cs-s/a=w800-h600");
  assert.equal(cardPhotoSrc(YAPPE), YAPPE);
});

test("image sitemap: up to 5 of our own, cover first, from tapturf.in; never another host's", () => {
  const own = (n: number) => BUCKET(`${TURF}/${String(n).padStart(24, "0")}.webp`);
  const site = (n: number) => SITE(`${TURF}/${String(n).padStart(24, "0")}.webp`);
  assert.deepEqual(
    sitemapPhotos({ cover_image: own(9), images: [LH3("a"), own(1), YAPPE, own(2), own(3), own(4), own(5), own(6)] }),
    [site(9), site(1), site(2), site(3), site(4)],
  );
  assert.deepEqual(sitemapPhotos({ cover_image: LH3("c"), images: [LH3("a"), own(1)] }, 5), [site(1)]);
  // Only other hosts: no photo (pages keep showing them, the sitemap lists none).
  assert.deepEqual(sitemapPhotos({ cover_image: LH3("c"), images: [LH3("a"), YAPPE, "https://drive.google.com/thumbnail?id=abc&sz=w2000"] }), []);
  // The cover pass's unusable ones stay out, as on the page.
  assert.deepEqual(sitemapPhotos({ cover_image: own(1), images: [own(1), own(2)], image_review: [{ url: own(1), usable: false }] }), [site(2)]);
  assert.deepEqual(sitemapPhotos({ cover_image: own(1), images: [own(2)] }, 1), [site(1)]);
  assert.deepEqual(sitemapPhotos(null), []);
  assert.deepEqual(sitemapPhotos({ images: "not a list" }), []);
});
