import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TURF_PHOTOS_BUCKET,
  cardPhotoSrc,
  convertImageUrls,
  firstImageUrl,
  imageUrlForCard,
  isOwnPhoto,
  isOwnerPhoto,
  isSitePhoto,
  orderPhotos,
  ownerPhotosFirst,
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

// ── owners' photos from tapturf.in (sitePhotoUrl, the photo route's sitePhotoKey) ──

const TURF = "5b9f50b1-dcce-45a9-9c8f-c847812b18d0";
const BUCKET = (key: string) => `${TURF_PHOTOS_BUCKET}${key}`;
const SITE = (key: string) => `https://www.tapturf.in/photos/turf/${key}`;
// An owner's upload (owner_photo_start's names) and a copy the old mirror job made of a Google Maps photo.
const OWNER = (n: number, ext = "jpg") => `owner/${TURF}/${String(n).padStart(24, "0")}.${ext}`;
const MIRROR = (n: number) => `${TURF}/${String(n).padStart(24, "0")}.webp`;

test("owners' photos move to tapturf.in; mirrored copies and every other URL stay as they are", () => {
  for (const key of [
    `owner/${TURF}/0123456789abcdef01234567.jpg`,
    `owner/${TURF}/0123456789abcdef01234567.webp`,
    `owner/${TURF}/0123456789abcdef01234567-card.jpg`,
    `owner/${TURF}/0123456789abcdef01234567-card.webp`,
  ]) {
    assert.equal(isOwnerPhoto(BUCKET(key)), true, key);
    assert.equal(sitePhotoUrl(BUCKET(key)), SITE(key), key);
    // As a path, for <img> on our own pages.
    assert.equal(sitePhotoUrl(BUCKET(key), ""), `/photos/turf/${key}`, key);
    assert.equal(isSitePhoto(sitePhotoUrl(BUCKET(key))), true);
    assert.equal(isSitePhoto(sitePhotoUrl(BUCKET(key), "")), true);
  }
  for (const url of [
    // The mirror job's copies: Supabase's links, as before.
    BUCKET(`${TURF}/0123456789abcdef01234567.webp`),
    BUCKET(`${TURF}/0123456789abcdef01234567-card.webp`),
    BUCKET(`${TURF}/0123456789abcdef01234567.jpg`),
    BUCKET(`${TURF}/abcdefgh.jpeg`),
    BUCKET(`${TURF}/${"z9".repeat(32)}.png`),
    LH3("a"),
    YAPPE,
    "https://drive.google.com/thumbnail?id=abc&sz=w2000",
    "https://cdn.district.in/assets/a.jpg",
    // Not our project, not that bucket.
    `https://x.supabase.co/storage/v1/object/public/turf-photos/owner/${TURF}/0123456789abcdef01234567.jpg`,
    BUCKET(`owner/${TURF}/0123456789abcdef01234567.jpg`).replace("/turf-photos/", "/avatars/"),
    BUCKET(`owner/${TURF}/0123456789abcdef01234567.jpg`).replace("/turf-photos/", "/review-photos/"),
    BUCKET(`owner/${TURF}/0123456789abcdef01234567.jpg`).replace("/public/", "/authenticated/"),
    // Names the route would refuse stay on Supabase.
    BUCKET(`owner/${TURF}/0123456789abcdef01234567.jpg?v=1`),
    BUCKET(`owner/${TURF}/0123456789abcdef01234567.jpg#x`),
    BUCKET(`owner/${TURF}/0123456789ABCDEF01234567.jpg`),
    BUCKET(`owner/${TURF}/0123456789abcdef0123456.jpg`),
    BUCKET(`owner/${TURF}/0123456789abcdef012345678.jpg`),
    BUCKET(`owner/${TURF}/0123456789abcdefghijklmn.jpg`),
    BUCKET(`owner/${TURF}/0123456789abcdef01234567.jpeg`),
    BUCKET(`owner/${TURF}/0123456789abcdef01234567.png`),
    BUCKET(`owner/${TURF}/0123456789abcdef01234567.gif`),
    BUCKET(`owner/${TURF}/0123456789abcdef01234567-thumb.jpg`),
    BUCKET(`owner/t1/0123456789abcdef01234567.jpg`),
    BUCKET(`owner/${TURF.toUpperCase()}/0123456789abcdef01234567.jpg`),
    BUCKET(`owner/x/${TURF}/0123456789abcdef01234567.jpg`),
    BUCKET(`owner/owner/${TURF}/0123456789abcdef01234567.jpg`),
    BUCKET(`${TURF}/owner/${TURF}/0123456789abcdef01234567.jpg`),
    BUCKET(`owner/${TURF}/../${TURF}/0123456789abcdef01234567.jpg`),
    BUCKET(`owner/${TURF}/%2e%2e/0123456789abcdef01234567.jpg`),
    "",
  ]) {
    assert.equal(isOwnerPhoto(url), false, url);
    assert.equal(sitePhotoUrl(url), url, url);
    assert.equal(sitePhotoUrl(url, ""), url, url);
    assert.equal(isSitePhoto(url), false, url);
  }
  assert.equal(sitePhotoUrl(null as unknown as string), null);
  assert.equal(isOwnerPhoto(null as unknown as string), false);
});

test("the photo route answers only owners' photos: no mirrored copy, query, encoding, other folder or bucket", () => {
  for (const key of [OWNER(1), OWNER(1, "webp"), `owner/${TURF}/0123456789abcdef01234567-card.jpg`, `owner/${TURF}/0123456789abcdef01234567-card.webp`]) {
    assert.equal(sitePhotoKey(`/photos/turf/${key}`), key);
    assert.equal(sitePhotoKey(`/photos/turf/${key}`, ""), key);
  }
  const key = OWNER(1);
  for (const [path, search] of [
    // The mirror job's copies: never from tapturf.in.
    [`/photos/turf/${MIRROR(1)}`, ""],
    [`/photos/turf/${TURF}/0123456789abcdef01234567-card.webp`, ""],
    [`/photos/turf/${TURF}/abcdefgh.jpeg`, ""],
    [`/photos/turf/${TURF}/owner/${TURF}/0123456789abcdef01234567.jpg`, ""],
    [`/photos/turf/${key}`, "?v=1"],
    [`/photos/turf/${key}`, "?"],
    [`/photos/turf/${key}/`, ""],
    [`/photos/turf//${key}`, ""],
    [`/photos/turf/owner//${TURF}/0123456789abcdef01234567.jpg`, ""],
    [`/photos/turf/owner/${TURF}/%2e%2e%2f0123456789abcdef01234567.jpg`, ""],
    [`/photos/turf/owner/${TURF}/0123456789abcdef01234567%2ejpg`, ""],
    [`/photos/turf/owner%2f${TURF}/0123456789abcdef01234567.jpg`, ""],
    [`/photos/turf/../avatars/${key}`, ""],
    [`/photos/turf/avatars/${key}`, ""],
    [`/photos/turf/review-photos/${key}`, ""],
    [`/photos/turf/owner/${key}`, ""],
    [`/photos/turf/owner/${TURF}`, ""],
    [`/photos/turf/owner/`, ""],
    [`/photos/turf/`, ""],
    [`/photos/turf/owner/${TURF}/0123456789abcdef01234567.jpg.png`, ""],
    [`/photos/turf/owner/${TURF}/0123456789abcdef01234567.html`, ""],
    [`/photos/turf/owner/${TURF}/0123456789abcdef01234567.JPG`, ""],
    [`/photos/turf/owner/${TURF}/0123456789abcdef01234567.jpeg`, ""],
    [`/photos/turf/owner/${TURF}/0123456789abcdef01234567.png`, ""],
    [`/photos/turf/owner/${TURF}/0123456789abcdef0123456.jpg`, ""],
    [`/photos/turf/owner/${TURF}/0123456789abcdefghijklmn.jpg`, ""],
    [`/photos/turf/https://evil.test/${key}`, ""],
    [`/photos/turf/${key}\n`, ""],
    [`/storage/v1/object/public/turf-photos/${key}`, ""],
    [`/photos/turfx/${key}`, ""],
  ]) {
    assert.equal(sitePhotoKey(path, search), null, `${path}${search}`);
  }
});

test("owners' photos first for share cards and JSON-LD, the rest in their order; no owner photo, nothing moves", () => {
  const [o1, o2, m1, m2] = [BUCKET(OWNER(1)), BUCKET(OWNER(2, "webp")), BUCKET(MIRROR(1)), BUCKET(MIRROR(2))];
  assert.deepEqual(ownerPhotosFirst([m1, LH3("a"), o1, m2, o2]), [o1, o2, m1, LH3("a"), m2]);
  assert.deepEqual(ownerPhotosFirst([m1, LH3("a"), m2]), [m1, LH3("a"), m2]);
  assert.deepEqual(ownerPhotosFirst([]), []);
});

test("cards and tiles: owners' photos at card size from tapturf.in, everything else exactly as imageUrlForCard gives it", () => {
  assert.equal(cardPhotoSrc(BUCKET(OWNER(1))), `/photos/turf/owner/${TURF}/${String(1).padStart(24, "0")}-card.jpg`);
  assert.equal(cardPhotoSrc(BUCKET(OWNER(1, "webp"))), `/photos/turf/owner/${TURF}/${String(1).padStart(24, "0")}-card.webp`);
  // A mirrored copy: its Supabase card, as before.
  assert.equal(cardPhotoSrc(BUCKET(MIRROR(1))), BUCKET(MIRROR(1)).replace(".webp", "-card.webp"));
  for (const url of [BUCKET(MIRROR(1)), BUCKET(`${TURF}/abcdefgh.png`), LH3("a"), YAPPE, "https://drive.google.com/thumbnail?id=abc&sz=w2000"]) {
    assert.equal(cardPhotoSrc(url), imageUrlForCard(url), url);
  }
  assert.equal(cardPhotoSrc(LH3("a")), "https://lh3.googleusercontent.com/gps-cs-s/a=w800-h600");
});

test("image sitemap: up to 5 of the owners' photos, cover first, from tapturf.in; no mirrored copy, no other host", () => {
  const own = (n: number) => BUCKET(OWNER(n));
  const site = (n: number) => SITE(OWNER(n));
  assert.deepEqual(
    sitemapPhotos({ cover_image: BUCKET(MIRROR(9)), images: [LH3("a"), BUCKET(MIRROR(1)), own(1), YAPPE, own(2), own(3), own(4), own(5), own(6)] }),
    [site(1), site(2), site(3), site(4), site(5)],
  );
  // An owner's cover leads.
  assert.deepEqual(sitemapPhotos({ cover_image: own(7), images: [BUCKET(MIRROR(1)), own(1)] }), [site(7), site(1)]);
  assert.deepEqual(sitemapPhotos({ cover_image: LH3("c"), images: [LH3("a"), own(1)] }, 5), [site(1)]);
  // Only mirrored copies, or only other hosts: no photo (pages keep showing them, the sitemap lists none).
  assert.deepEqual(sitemapPhotos({ cover_image: BUCKET(MIRROR(1)), images: [BUCKET(MIRROR(1)), BUCKET(MIRROR(2)), LH3("a")] }), []);
  assert.deepEqual(sitemapPhotos({ cover_image: LH3("c"), images: [LH3("a"), YAPPE, "https://drive.google.com/thumbnail?id=abc&sz=w2000"] }), []);
  // The cover pass's unusable ones stay out, as on the page.
  assert.deepEqual(sitemapPhotos({ cover_image: own(1), images: [own(1), own(2)], image_review: [{ url: own(1), usable: false }] }), [site(2)]);
  assert.deepEqual(sitemapPhotos({ cover_image: own(1), images: [own(2)] }, 1), [site(1)]);
  assert.deepEqual(sitemapPhotos(null), []);
  assert.deepEqual(sitemapPhotos({ images: "not a list" }), []);
});
