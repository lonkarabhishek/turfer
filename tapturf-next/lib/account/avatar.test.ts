import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AVATAR_PRESETS,
  INITIALS_COLORS,
  PHOTO_UPLOAD,
  clampCrop,
  coverScale,
  cropSource,
  googlePhotoToKeep,
  imageInfo,
  initialsColor,
  initialsOf,
  isPresetId,
  maxZoom,
  photoErrorText,
  pictureKind,
  presetOf,
  presetPath,
  sizedPhotoUrl,
  startCrop,
  stripPhotoDetails,
  uploadProblem,
  zoomCrop,
} from "./avatar";
import { avatarSvg } from "./avatarArt";

/* ------------------------------------------------------------------ */
/* Avatars                                                             */
/* ------------------------------------------------------------------ */

test("avatars: at least eight, each with its own id, name and colour", () => {
  assert.ok(AVATAR_PRESETS.length >= 8);
  assert.equal(new Set(AVATAR_PRESETS.map((p) => p.id)).size, AVATAR_PRESETS.length);
  assert.equal(new Set(AVATAR_PRESETS.map((p) => p.label)).size, AVATAR_PRESETS.length);
  const backgrounds = AVATAR_PRESETS.map((p) => /<rect width="64" height="64" fill="(#[0-9A-F]{6})"/.exec(avatarSvg(p.id))?.[1]);
  assert.ok(backgrounds.every(Boolean));
  assert.equal(new Set(backgrounds).size, AVATAR_PRESETS.length, "no two look alike at a glance");
  for (const p of AVATAR_PRESETS) {
    // The database's rule for an avatar id (account_photo_set).
    assert.match(p.id, /^[a-z][a-z0-9-]{1,30}$/);
    assert.ok(isPresetId(p.id));
  }
  assert.equal(isPresetId("dragon"), false);
});

test("avatars: plain SVG with its name, nothing that runs or loads", () => {
  for (const p of AVATAR_PRESETS) {
    const svg = avatarSvg(p.id);
    assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"'), p.id);
    assert.ok(svg.endsWith("</svg>"));
    assert.ok(svg.includes(`<title>${p.label}</title>`) && svg.includes(`aria-label="${p.label}"`), `${p.id} is named`);
    assert.doesNotMatch(svg, /<script|<foreignObject|<image|\son[a-z]+=|href=|<text/i, `${p.id} is static`);
    assert.equal(svg.match(/https?:/g)?.length, 1, `${p.id}: only the namespace`);
    assert.doesNotMatch(svg, /NaN|undefined/);
  }
});

test("avatars: the address is the picture", () => {
  for (const p of AVATAR_PRESETS) {
    assert.equal(presetPath(p.id), `/avatars/${p.id}.svg`);
    assert.equal(presetOf(presetPath(p.id)), p.id);
    assert.equal(presetOf(`https://www.tapturf.in/avatars/${p.id}.svg`), p.id);
  }
  for (const x of ["/avatars/dragon.svg", "/avatars/football.png", "https://evil.in/avatars/football.svg", "avatars/football.svg", null, undefined, ""])
    assert.equal(presetOf(x), null, String(x));
});

test("pictureKind: an avatar, Google's photo, an upload, or something else", () => {
  assert.equal(pictureKind(null), null);
  assert.equal(pictureKind(""), null);
  assert.equal(pictureKind("/avatars/whistle.svg"), "preset");
  assert.equal(pictureKind("https://lh3.googleusercontent.com/a/ACg8oc_x-Y=s96-c"), "google");
  assert.equal(pictureKind("https://hwfsbpzercuoshodmnuf.supabase.co/storage/v1/object/public/avatars/0123456789abcdef01234567.webp"), "upload");
  assert.equal(pictureKind("https://hwfsbpzercuoshodmnuf.supabase.co/storage/v1/object/public/profile-photos/u/profile.jpg"), "upload");
  assert.equal(pictureKind("https://example.com/me.png"), "other");
});

test("Google photo: kept at 256 px, asked for at the size shown", () => {
  assert.equal(googlePhotoToKeep("https://lh3.googleusercontent.com/a/ACg8oc_x-Y=s96-c"), "https://lh3.googleusercontent.com/a/ACg8oc_x-Y=s256-c");
  assert.equal(googlePhotoToKeep("https://lh5.googleusercontent.com/a/ACg8oc_x"), "https://lh5.googleusercontent.com/a/ACg8oc_x=s256-c");
  for (const bad of ["http://lh3.googleusercontent.com/a/x", "https://lh3.googleusercontent.com.evil.in/a", "https://evil.in/lh3.googleusercontent.com/a", "https://lh3.googleusercontent.com/a/x y", null])
    assert.equal(googlePhotoToKeep(bad), null, String(bad));
  assert.equal(sizedPhotoUrl("https://lh3.googleusercontent.com/a/x=s256-c", 28), "https://lh3.googleusercontent.com/a/x=s64-c");
  assert.equal(sizedPhotoUrl("https://lh3.googleusercontent.com/a/x=s96-c", 96), "https://lh3.googleusercontent.com/a/x=s192-c");
  assert.equal(sizedPhotoUrl("https://lh3.googleusercontent.com/a/x=s96-c", 800), "https://lh3.googleusercontent.com/a/x=s512-c");
  const ours = "https://x.supabase.co/storage/v1/object/public/avatars/a.webp";
  assert.equal(sizedPhotoUrl(ours, 28), ours);
});

/* ------------------------------------------------------------------ */
/* Initials                                                            */
/* ------------------------------------------------------------------ */

test("initials: first and last word, whole characters", () => {
  assert.equal(initialsOf("Asha Rao"), "AR");
  assert.equal(initialsOf("asha"), "A");
  assert.equal(initialsOf("  priya   kumari  sharma "), "PS");
  assert.equal(initialsOf("Dr. Ravi"), "DR");
  assert.equal(initialsOf("ravi_k"), "RK");
  assert.equal(initialsOf("@ravi"), "R");
  assert.equal(initialsOf("अमित शर्मा"), "अश");
  assert.equal(initialsOf("⚽ Sunil"), "S");
  assert.equal(initialsOf("23 Strikers"), "2S");
  for (const none of ["", "   ", "⚽", null, undefined]) assert.equal(initialsOf(none), "", String(none));
});

/** WCAG relative luminance contrast of white on a colour. */
function contrastWithWhite(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return 1.05 / (l + 0.05);
}

test("initials colour: the same for the same name, readable white letters, spread out", () => {
  for (const c of INITIALS_COLORS) assert.ok(contrastWithWhite(c) >= 4.5, `${c}: ${contrastWithWhite(c).toFixed(2)}`);
  assert.equal(initialsColor("Asha Rao"), initialsColor(" asha  rao "));
  assert.ok((INITIALS_COLORS as readonly string[]).includes(initialsColor("")));
  const names = Array.from({ length: 200 }, (_, i) => `Player ${i}`);
  const used = new Set(names.map(initialsColor));
  assert.equal(used.size, INITIALS_COLORS.length, "every colour gets used");
});

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
const le32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
const le16 = (n: number) => [n & 255, (n >> 8) & 255];
const be16 = (n: number) => [(n >> 8) & 255, n & 255];

/** A WebP made of these chunks (id, payload). */
function webp(chunks: [string, number[]][]): Uint8Array {
  const body = chunks.flatMap(([id, data]) => [...[...id].map((c) => c.charCodeAt(0)), ...le32(data.length), ...data, ...(data.length & 1 ? [0] : [])]);
  return bytes("RIFF", le32(4 + body.length), "WEBP", body);
}
const vp8 = (w: number, h: number) => ["VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(w), ...le16(h), 1, 2, 3, 4]] as [string, number[]];
function vp8l(w: number, h: number): [string, number[]] {
  const bits = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14);
  return ["VP8L", [0x2f, ...le32(bits), 9, 9, 9]];
}
const vp8x = (w: number, h: number, flags: number) => ["VP8X", [flags, 0, 0, 0, ...le32(w - 1).slice(0, 3), ...le32(h - 1).slice(0, 3)]] as [string, number[]];

/** A JPEG: SOI, the given segments, a frame header, then scan data. */
function jpeg(w: number, h: number, before: number[][] = []): Uint8Array {
  const sof = [0xff, 0xc0, ...be16(17), 8, ...be16(h), ...be16(w), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  const sos = [0xff, 0xda, ...be16(12), 3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0, 0x12, 0x34, 0xff, 0xd9];
  return Uint8Array.from([0xff, 0xd8, ...before.flat(), ...sof, ...sos]);
}
const seg = (marker: number, payload: string) => [0xff, marker, ...be16(payload.length + 2), ...[...payload].map((c) => c.charCodeAt(0))];

test("imageInfo: WebP and JPEG sizes from their own bytes", () => {
  assert.deepEqual(imageInfo(webp([vp8(512, 512)])), { type: "webp", w: 512, h: 512 });
  assert.deepEqual(imageInfo(webp([vp8l(300, 200)])), { type: "webp", w: 300, h: 200 });
  assert.deepEqual(imageInfo(webp([vp8x(640, 480, 0), vp8(640, 480)])), { type: "webp", w: 640, h: 480 });
  assert.deepEqual(imageInfo(jpeg(512, 384)), { type: "jpeg", w: 512, h: 384 });
  assert.deepEqual(imageInfo(jpeg(400, 400, [seg(0xe0, "JFIF\0"), seg(0xe1, "Exif\0\0GPS 18.5N")])), { type: "jpeg", w: 400, h: 400 });
  // Anything else, or a header that stops early.
  for (const junk of [bytes("GIF89a", [0, 0, 0, 0]), bytes([0x89], "PNG", [13, 10, 26, 10]), bytes("<svg></svg>"), new Uint8Array(0), jpeg(10, 10).subarray(0, 8), bytes("RIFF", le32(4), "WEBP")])
    assert.equal(imageInfo(junk), null);
});

test("stripPhotoDetails: a camera's EXIF and comments go, the picture stays", () => {
  const app0 = seg(0xe0, "JFIF\0");
  const exif = seg(0xe1, "Exif\0\0lat 19.99 lng 73.78");
  const com = seg(0xfe, "taken at home");
  const plain = jpeg(512, 512, [app0]);
  const out = stripPhotoDetails(jpeg(512, 512, [app0, exif, com]));
  assert.ok(out);
  assert.deepEqual([...out], [...plain]);
  assert.deepEqual(imageInfo(out), { type: "jpeg", w: 512, h: 512 });

  const clean = webp([vp8(256, 256)]);
  assert.equal(stripPhotoDetails(clean), clean, "nothing to take out: the same file");
  const withExif = webp([vp8x(256, 256, 0x08 | 0x04), vp8(256, 256), ["EXIF", [...[..."lat 19.99"].map((c) => c.charCodeAt(0))]], ["XMP ", [1, 2, 3]]]);
  const w = stripPhotoDetails(withExif);
  assert.ok(w);
  assert.deepEqual([...w], [...webp([vp8x(256, 256, 0), vp8(256, 256)])], "chunks gone, the size and flags put right");
  assert.equal(stripPhotoDetails(bytes("hello")), null);
});

test("uploadProblem: the server's own check of the square", () => {
  assert.equal(uploadProblem({ type: "webp", w: 512, h: 512 }, 60_000), null);
  assert.equal(uploadProblem({ type: "jpeg", w: 96, h: 96 }, 5_000), null);
  assert.equal(uploadProblem(null, 100), "not_photo");
  assert.equal(uploadProblem({ type: "webp", w: 512, h: 512 }, PHOTO_UPLOAD.maxBytes + 1), "too_big");
  assert.equal(uploadProblem({ type: "webp", w: 95, h: 512 }, 5_000), "too_small");
  assert.equal(uploadProblem({ type: "webp", w: 4000, h: 3000 }, 5_000), "too_small", "not the square we make");
});

test("photoErrorText: plain words for each answer, never the check's own", () => {
  assert.match(photoErrorText("refused", "sexual"), /can’t be a profile picture/);
  assert.match(photoErrorText("refused", "personal_info"), /number, a document or a code/);
  assert.match(photoErrorText("unchecked"), /wasn’t saved/);
  assert.match(photoErrorText("bad", "too_small"), /too small/);
  assert.match(photoErrorText("bad", "unreadable"), /HEIC/);
  assert.match(photoErrorText("limit"), /tomorrow/);
  assert.match(photoErrorText("sign_in"), /log in again/);
  assert.match(photoErrorText(null), /Check your connection/);
  // Every answer offers a way on.
  for (const e of ["refused", "unchecked", "limit"]) assert.match(photoErrorText(e), /avatar/);
});

/* ------------------------------------------------------------------ */
/* Crop                                                                */
/* ------------------------------------------------------------------ */

test("crop: starts centred, always covers the frame, zooms about a point", () => {
  const F = 280;
  // A 1600 x 1200 photo: the short side fills the frame.
  const s = startCrop(1600, 1200, F);
  assert.equal(s.scale, coverScale(1600, 1200, F));
  assert.ok(Math.abs(s.y) < 1e-9);
  assert.ok(Math.abs(s.x + (1600 * s.scale - F) / 2) < 1e-9);
  // Dragged too far either way: back to the edge.
  assert.deepEqual(clampCrop({ ...s, x: 50, y: 50 }, 1600, 1200, F), { ...s, x: 0, y: 0 });
  const far = clampCrop({ ...s, x: -5000, y: -5000 }, 1600, 1200, F);
  assert.ok(Math.abs(far.x - (F - 1600 * s.scale)) < 1e-9 && Math.abs(far.y - (F - 1200 * s.scale)) < 1e-9);
  // Never smaller than cover, never past the zoom cap.
  assert.equal(clampCrop({ ...s, scale: s.scale / 2 }, 1600, 1200, F).scale, s.scale);
  assert.equal(clampCrop({ ...s, scale: s.scale * 99 }, 1600, 1200, F).scale, s.scale * maxZoom(1600, 1200));
  // Zooming keeps the frame's centre on the same point of the photo.
  const z = zoomCrop(s, 2, 1600, 1200, F);
  const before = { x: (F / 2 - s.x) / s.scale, y: (F / 2 - s.y) / s.scale };
  const after = { x: (F / 2 - z.x) / z.scale, y: (F / 2 - z.y) / z.scale };
  assert.ok(Math.abs(before.x - after.x) < 1e-6 && Math.abs(before.y - after.y) < 1e-6);
});

test("crop: the square to keep is inside the photo, 512 px at most, never enlarged", () => {
  const F = 280;
  const s = startCrop(1600, 1200, F);
  const c = cropSource(s, 1600, 1200, F);
  assert.ok(Math.abs(c.side - 1200) < 1e-6 && Math.abs(c.sx - 200) < 1e-6 && Math.abs(c.sy) < 1e-6);
  assert.equal(c.out, 512);
  const z = cropSource(zoomCrop(s, 4, 1600, 1200, F), 1600, 1200, F);
  assert.ok(Math.abs(z.side - 300) < 1e-6 && z.sx >= 0 && z.sx + z.side <= 1600 && z.sy + z.side <= 1200);
  // A small photo: kept at its own size, and no zoom past 128 photo pixels.
  assert.equal(maxZoom(200, 150), 1.171875);
  const small = cropSource(startCrop(200, 150, F), 200, 150, F);
  assert.equal(small.out, 150);
  assert.equal(maxZoom(100, 100), 1);
});
