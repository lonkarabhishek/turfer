import { test } from "node:test";
import assert from "node:assert/strict";
import { PHOTO, checkFile, fitWithin, ownerPhotoMessage, photoCountLine, photoLabel, photoTiles } from "./photoMath";
import { toAdminPhotos, toPhotoList, type OwnerPhotoList } from "./photoTypes";
import { imageUrlForCard } from "../utils/images";

const BASE = "https://hwfsbpzercuoshodmnuf.supabase.co/storage/v1/object/public/turf-photos/";
const TURF = "94caa616-0000-4000-8000-000000000001";
const HEX = "0123456789abcdef01234567";

test("fitWithin: a phone photo to 1600 and its card", () => {
  assert.deepEqual(fitWithin(4032, 3024, PHOTO.full), { w: 1600, h: 1200 });
  assert.deepEqual(fitWithin(1600, 1200, PHOTO.card), { w: 640, h: 480 });
  assert.deepEqual(fitWithin(3024, 4032, PHOTO.full), { w: 1200, h: 1600 }, "portrait");
  assert.deepEqual(fitWithin(8064, 6048, PHOTO.full), { w: 1600, h: 1200 }, "48 MP");
  assert.deepEqual(fitWithin(1000, 700, PHOTO.full), { w: 1000, h: 700 }, "never enlarged");
  assert.deepEqual(fitWithin(12000, 1000, PHOTO.full), { w: 1600, h: 133 }, "a panorama");
  assert.deepEqual(fitWithin(100000, 10, PHOTO.card), { w: 640, h: 1 }, "at least a pixel");
});

test("checkFile", () => {
  assert.equal(checkFile({ type: "image/jpeg", name: "IMG_2041.JPG", size: 4_000_000 }), null);
  assert.equal(checkFile({ type: "image/heic", name: "IMG_2041.HEIC", size: 2_000_000 }), null);
  assert.equal(checkFile({ type: "", name: "IMG_2041.HEIC", size: 2_000_000 }), null, "no type, but a photo's name");
  assert.equal(checkFile({ type: "", name: "IMG_2041.heif", size: 2_000_000 }), null);
  assert.equal(checkFile({ type: "", name: "notes.txt", size: 2_000 }), "not_photo");
  assert.equal(checkFile({ type: "application/pdf", name: "file.pdf", size: 200_000 }), "not_photo");
  assert.equal(checkFile({ type: "application/octet-stream", name: "x.jpg", size: 200_000 }), "not_photo", "a type that says otherwise wins");
  assert.equal(checkFile({ type: "image/svg+xml", name: "logo.svg", size: 2_000 }), "not_photo");
  assert.equal(checkFile({ type: "image/jpeg", name: "big.jpg", size: 30 * 1024 * 1024 }), null, "30 MB is fine");
  assert.equal(checkFile({ type: "image/jpeg", name: "big.jpg", size: 30 * 1024 * 1024 + 1 }), "too_big");
  assert.equal(checkFile({ type: "image/jpeg", name: "empty.jpg", size: 0 }), "unreadable");
});

test("messages", () => {
  assert.equal(ownerPhotoMessage("batch"), "Pick up to 10 photos at a time.");
  assert.equal(ownerPhotoMessage("too_big", "IMG_2041.HEIC"), "“IMG_2041” is too big to open (over 30 MB). Try another photo.");
  assert.equal(ownerPhotoMessage("too_small", "IMG_2041.jpg"), "“IMG_2041” is too small to look good. Pick the original from your camera, not a forwarded copy.");
  assert.equal(ownerPhotoMessage("unreadable", "IMG_2041.HEIC"), "We couldn’t open “IMG_2041”. If it’s an HEIC photo, share it as JPG from your gallery and try again.");
  assert.equal(ownerPhotoMessage("not_photo", "file.pdf"), "“file.pdf” isn’t a photo.");
  assert.equal(ownerPhotoMessage("duplicate"), "You’ve already added this photo.");
  assert.equal(ownerPhotoMessage("too_many"), "You’ve added 20 photos, the most for now. Remove one to add another.");
  assert.equal(ownerPhotoMessage("too_many", undefined, 0), "You’ve added 20 photos, the most for now. Remove one to add another.");
  assert.equal(ownerPhotoMessage("too_many", undefined, 3), "You can add 3 more photos (20 at most). Pick fewer and try again.");
  assert.equal(ownerPhotoMessage("too_many", undefined, 1), "You can add 1 more photo (20 at most). Pick fewer and try again.");
  assert.equal(ownerPhotoMessage("daily_limit"), "You’ve added a lot of photos today. Try again tomorrow.");
  assert.equal(ownerPhotoMessage("daily_limit", undefined, 2), "You can add 2 more photos today. Pick fewer, or try again tomorrow.");
  assert.equal(ownerPhotoMessage("forbidden"), "Sign in again to change photos.");
  assert.equal(ownerPhotoMessage("network"), "Some photos didn’t upload. Check your connection and tap Try again.");
  assert.equal(ownerPhotoMessage("paused"), "Photo uploads are paused for a bit. Email them to info@tapturf.in.");
  assert.equal(ownerPhotoMessage("hidden"), "That photo is hidden from your page, so it can’t be the cover.");
  assert.match(ownerPhotoMessage("not_found"), /isn’t there any more/);
  assert.match(ownerPhotoMessage("bad_request"), /Reload the page/);
  assert.equal(ownerPhotoMessage("something new"), ownerPhotoMessage("network"), "anything else reads as a connection problem");
  for (const e of ["batch", "too_big", "too_small", "unreadable", "not_photo", "duplicate", "too_many", "daily_limit", "forbidden", "network", "paused", "hidden", "not_found", "bad_request"])
    assert.doesNotMatch(ownerPhotoMessage(e, "x.jpg", 2), /[—–]/, `${e}: no em or en dashes`);
});

test("photoLabel", () => {
  assert.equal(photoLabel("IMG_2041.HEIC"), "IMG_2041");
  assert.equal(photoLabel("C:\\fakepath\\IMG_2041.jpg"), "IMG_2041");
  assert.equal(photoLabel("file.pdf", true), "file.pdf");
  assert.equal(photoLabel(""), "This file");
  assert.equal(photoLabel(undefined), "This file");
  assert.equal(photoLabel("a".repeat(60) + ".jpg").length, 38);
});

test("naming contract: imageUrlForCard finds an owner photo's card", () => {
  for (const ext of ["webp", "jpg"]) {
    const url = `${BASE}owner/${TURF}/${HEX}.${ext}`;
    assert.equal(imageUrlForCard(url), `${BASE}owner/${TURF}/${HEX}-card.${ext}`);
  }
  assert.equal(imageUrlForCard(`${BASE}owner/${TURF}/${HEX}-card.webp`), `${BASE}owner/${TURF}/${HEX}-card.webp`, "a card is left alone");
});

const list = (over: Partial<OwnerPhotoList> = {}): OwnerPhotoList => ({
  images: [],
  cover: null,
  flagged: [],
  mine: [],
  maxMine: 20,
  maxBatch: 10,
  ...over,
});

test("photoTiles: the grid as players see it", () => {
  const own = `${BASE}owner/${TURF}/${HEX}.webp`;
  const lh3 = "https://lh3.googleusercontent.com/p/AF1Qip=w32-h32-k-no";
  const lh3n = "https://lh3.googleusercontent.com/p/AF1Qip=w1600-h1200";
  const g = photoTiles(
    list({
      images: [`${BASE}${TURF}/aaaaaaaaaaaaaaaaaaaaaaaa.webp`, own, lh3, "https://files.yappe.in/place/full/x.webp", lh3n, "https://lh3.googleusercontent.com/ogw/default-user=s96", "https://playo.gumlet.io/x.jpg"],
      cover: own,
      flagged: [{ url: lh3n, note: "A logo" }],
      mine: [
        { id: "p1", url: own, status: "live", at: null, checked: true, note: null },
        { id: "p2", url: `${BASE}owner/${TURF}/${"f".repeat(24)}.webp`, status: "held", at: null, checked: true, note: "A price list" },
        { id: "p3", url: `${BASE}owner/${TURF}/${"e".repeat(24)}.webp`, status: "checking", at: null, checked: false, note: null },
      ],
    }),
  );
  assert.deepEqual(g.tiles.map((t) => t.src), [`${BASE}${TURF}/aaaaaaaaaaaaaaaaaaaaaaaa.webp`, own, lh3n, "https://files.yappe.in/place/full/x.webp"], "normalised; duplicates, placeholders and booking apps' photos dropped, as on the page");
  assert.equal(g.tiles[2].raw, lh3, "Make cover sends the stored URL");
  assert.equal(g.tiles[2].hidden, true, "flagged by its normalised URL");
  assert.equal(g.tiles[2].note, "A logo");
  assert.equal(g.visible, 3, "players see three");
  assert.deepEqual(g.tiles.map((t) => t.cover), [false, true, false, false], "the cover is cover_image");
  assert.deepEqual(g.tiles.map((t) => t.first), [true, false, false, false]);
  assert.deepEqual(g.tiles.map((t) => t.mine), [null, "p1", null, null], "only owner photos can be removed");
  assert.equal(g.mineLive, 1);
  assert.deepEqual(g.held.map((h) => h.id), ["p2"]);
  assert.deepEqual(g.checking.map((h) => h.id), ["p3"], "being checked: not on the page, shown apart");
  assert.ok(!g.tiles.some((t) => t.src.includes("e".repeat(24))));
});

test("photoTiles: edges", () => {
  const a = "https://x.in/a.jpg", b = "https://x.in/b.jpg";
  let g = photoTiles(list({ images: [a, b], flagged: [{ url: a, note: null }, { url: b, note: null }] }));
  assert.equal(g.visible, 2, "all flagged: the page shows them all");
  assert.deepEqual(g.tiles.map((t) => t.hidden), [false, false]);
  g = photoTiles(list({ images: [a, b] }));
  assert.deepEqual(g.tiles.map((t) => t.cover), [true, false], "no cover: cards lead with the first photo");
  g = photoTiles(list({ images: [a, b], cover: "https://x.in/elsewhere.jpg" }));
  assert.deepEqual(g.tiles.map((t) => t.cover), [true, false], "a cover not in the list: the first photo is marked");
  g = photoTiles(list());
  assert.equal(g.visible, 0);
  assert.deepEqual(g.tiles, []);
});

test("photoCountLine", () => {
  assert.equal(photoCountLine(6, 2), "6 photos on your page · 2 added by you");
  assert.equal(photoCountLine(1, 0), "1 photo on your page");
  assert.equal(photoCountLine(0, 0), "No photos on your page yet.");
});

test("toPhotoList", () => {
  assert.deepEqual(toPhotoList({ error: "forbidden" }), { error: "forbidden" });
  assert.deepEqual(toPhotoList(null), { error: "bad_answer" });
  const r = toPhotoList({
    images: ["https://x.in/a.jpg", 5, "", null],
    cover: "https://x.in/a.jpg",
    flagged: [{ url: "https://x.in/a.jpg", note: "Blurred" }, { note: "no url" }],
    mine: [
      { id: "p1", url: "https://x.in/a.jpg", status: "live", at: "2026-10-25T10:00:00Z", checked: false, note: null },
      { id: "p2", url: "https://x.in/b.jpg", status: "removed" },
      { id: "p3", status: "held" },
      { id: "p4", url: "https://x.in/c.jpg", status: "checking", checked: false },
    ],
    max_mine: 20,
    max_batch: 10,
  });
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.deepEqual(r.images, ["https://x.in/a.jpg"]);
  assert.deepEqual(r.flagged, [{ url: "https://x.in/a.jpg", note: "Blurred" }]);
  assert.deepEqual(r.mine.map((m) => m.id), ["p1", "p4"], "only live, checking and held rows with a URL");
  assert.equal(r.mine[0].checked, false);
  assert.equal(r.maxMine, 20);
});

test("toAdminPhotos", () => {
  const rows = toAdminPhotos([
    { id: "p1", turf_id: "t1", user_key: "p:9800000001", status: "held", url: "https://x.in/a.webp", bytes: 300000, created_at: "2026-10-25T10:00:00Z", checked_at: "2026-10-25T10:00:09Z", verdict: { usable: false, note: "A price list" }, turf_name: "Turfit", slug: "turfit", city: "udaipur" },
    { id: "p2", turf_id: "t1", user_key: "e:a@x.in", status: "live", verdict: { usable: false, note: "x", override: true } },
    { id: "p3", turf_id: "t1", user_key: "e:a@x.in", status: "uploading" },
    { id: "p4", turf_id: "t1", user_key: "e:a@x.in", status: "checking", check_tries: 2, verdict: { note: "Claim taken away", unclaimed: true } },
    { turf_id: "t1", user_key: "e:a@x.in", status: "live" },
    "nonsense",
  ]);
  assert.deepEqual(rows.map((r) => r.id), ["p1", "p2", "p4"]);
  assert.deepEqual([rows[2].status, rows[2].checkTries, rows[2].unclaimed, rows[0].checkTries, rows[0].unclaimed], ["checking", 2, true, 0, false]);
  assert.deepEqual([rows[0].status, rows[0].note, rows[0].usable, rows[0].override, rows[0].bytes, rows[0].turfName], ["held", "A price list", false, false, 300000, "Turfit"]);
  assert.equal(rows[0].checkedAt, Date.parse("2026-10-25T10:00:09Z"));
  assert.deepEqual([rows[1].checkedAt, rows[1].override, rows[1].turfName], [null, true, "A turf no longer listed"]);
  assert.deepEqual(toAdminPhotos({ error: "forbidden" }), []);
});
