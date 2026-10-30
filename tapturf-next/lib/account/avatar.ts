/**
 * A person's picture (users.profile_image_url): what kind it is, the
 * drawn sports avatars, initials on a colour of their own when there is
 * none, the photo size to ask for, the square crop and the checks on an
 * uploaded file. Browser and server alike; no secrets. Relative imports
 * only (npm run test:account). The avatars are drawn in avatarArt.ts and
 * served at /avatars/<id>.svg (app/avatars/[file]/route.ts).
 */

/** The drawn avatars, in the order the picker shows them. label: the accessible name. */
export const AVATAR_PRESETS = [
  { id: "football", label: "Football" },
  { id: "cricket-ball", label: "Cricket ball" },
  { id: "bat", label: "Cricket bat" },
  { id: "stumps", label: "Stumps" },
  { id: "racquet", label: "Tennis racquet" },
  { id: "shuttlecock", label: "Shuttlecock" },
  { id: "basketball", label: "Basketball" },
  { id: "volleyball", label: "Volleyball" },
  { id: "whistle", label: "Whistle" },
  { id: "trophy", label: "Trophy" },
  { id: "jersey", label: "Jersey" },
  { id: "hockey", label: "Hockey stick" },
] as const;

export type AvatarPresetId = (typeof AVATAR_PRESETS)[number]["id"];

export const isPresetId = (id: unknown): id is AvatarPresetId => AVATAR_PRESETS.some((p) => p.id === id);

/** Where an avatar is served; also what users.profile_image_url holds for one (account_photo_set). */
export const presetPath = (id: AvatarPresetId) => `/avatars/${id}.svg`;

const PRESET_URL = /^(?:https:\/\/(?:www\.)?tapturf\.in)?\/avatars\/([a-z][a-z0-9-]{1,30})\.svg$/;

/** The avatar a picture is, or null. */
export function presetOf(url: string | null | undefined): AvatarPresetId | null {
  const m = PRESET_URL.exec(url ?? "");
  return m && isPresetId(m[1]) ? m[1] : null;
}

const GOOGLE_PHOTO = /^https:\/\/lh\d+\.googleusercontent\.com\/[A-Za-z0-9/_=.~-]+$/;
/** The public avatars bucket (20261030_profile_photos.sql), and the bucket the first app used. */
const UPLOADED = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/(?:avatars|profile-photos)\//;

export type PictureKind = "upload" | "google" | "preset" | "other";

/** What a picture is; null for none. */
export function pictureKind(url: string | null | undefined): PictureKind | null {
  if (!url) return null;
  if (presetOf(url)) return "preset";
  if (GOOGLE_PHOTO.test(url)) return "google";
  if (UPLOADED.test(url)) return "upload";
  return "other";
}

/**
 * A Google photo address as we keep it (a 256 px square, from Google's
 * own sizing suffix), or null when it isn't one. Only for the photo of
 * the verified Google sign-in, never one a browser sent.
 */
export function googlePhotoToKeep(url: string | null | undefined): string | null {
  if (!url || url.length > 900 || !GOOGLE_PHOTO.test(url)) return null;
  return /=s\d+(-c)?$/.test(url) ? url.replace(/=s\d+(-c)?$/, "=s256-c") : /=/.test(url) ? url : `${url}=s256-c`;
}

/**
 * The address to load for a picture shown `px` CSS pixels wide: Google
 * photos are asked for at about twice that (sharp on a phone, never the
 * full size). Others are already small (our uploads are 512 px at most).
 */
export function sizedPhotoUrl(url: string, px: number): string {
  if (!GOOGLE_PHOTO.test(url) || !/=s\d+(-c)?$/.test(url)) return url;
  const want = Math.min(512, Math.max(32, Math.ceil((px * 2) / 16) * 16));
  return url.replace(/=s\d+(-c)?$/, `=s${want}-c`);
}

/* ------------------------------------------------------------------ */
/* Initials                                                            */
/* ------------------------------------------------------------------ */

/** "Asha Rao" -> "AR", "asha" -> "A", "  " -> "". Letters and digits only, whole characters (not half an emoji). */
export function initialsOf(name: string | null | undefined): string {
  const words = String(name ?? "")
    .normalize("NFC")
    .split(/[\s._-]+/)
    .map((w) => Array.from(w).find((c) => /[\p{L}\p{N}]/u.test(c)) ?? "")
    .filter(Boolean);
  if (words.length === 0) return "";
  const pick = words.length > 1 ? [words[0], words[words.length - 1]] : [words[0]];
  return pick.join("").toLocaleUpperCase("en-IN");
}

/**
 * Background colours for initials, each with white letters at 4.5:1 or
 * more, so even the smallest avatar reads (WCAG AA).
 */
export const INITIALS_COLORS = [
  "#15803D", // green
  "#0F766E", // teal
  "#0369A1", // sky
  "#1D4ED8", // blue
  "#6D28D9", // violet
  "#A21CAF", // fuchsia
  "#BE123C", // rose
  "#C2410C", // orange
  "#A16207", // ochre
  "#374151", // slate
] as const;

/** FNV-1a, 32 bit: the same name gets the same colour everywhere. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** The colour of a name's initials. */
export function initialsColor(name: string | null | undefined): string {
  const key = String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return INITIALS_COLORS[hash(key) % INITIALS_COLORS.length];
}

/* ------------------------------------------------------------------ */
/* Uploads                                                             */
/* ------------------------------------------------------------------ */

export const PHOTO_UPLOAD = {
  /** The square we keep: 512 px, or the photo's own size when it is smaller. */
  side: 512,
  /** The smallest square worth keeping. */
  minSide: 96,
  /** The bucket's limit (20261030_profile_photos.sql). */
  maxBytes: 524_288,
  /** We don't open a file bigger than this. */
  maxRawBytes: 30 * 1024 * 1024,
  /** Encoder quality, then lower if the file comes out too big. */
  quality: 0.86,
  /** The most the crop zooms in. */
  maxZoom: 4,
} as const;

export type ImageInfo = { type: "webp" | "jpeg"; w: number; h: number };

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

/**
 * The type and size of a WebP or JPEG from its first bytes; null for
 * anything else, and for an animated WebP (the check sees one frame, a
 * browser plays them all; our crop never makes one). Never trusts the
 * sender's type.
 */
export function imageInfo(b: Uint8Array): ImageInfo | null {
  if (b.length >= 16 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") {
    const chunk = ascii(b, 12, 4);
    if (chunk === "VP8 " && b.length >= 30 && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
      return { type: "webp", w: u16le(b, 26) & 0x3fff, h: u16le(b, 28) & 0x3fff };
    }
    if (chunk === "VP8L" && b.length >= 25 && b[20] === 0x2f) {
      const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
      return { type: "webp", w: (bits & 0x3fff) + 1, h: ((bits >>> 14) & 0x3fff) + 1 };
    }
    // VP8X: bit 1 of its flags says animated.
    if (chunk === "VP8X" && b.length >= 30 && !(b[20] & 0x02)) return { type: "webp", w: u24le(b, 24) + 1, h: u24le(b, 27) + 1 };
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 4 <= b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xff) {
        i++;
        continue;
      }
      // Markers with no length.
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) return null;
      const len = u16be(b, i + 2);
      if (len < 2) return null;
      // Start of frame (not DHT c4, JPG c8 or DAC cc): height, then width.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        if (i + 9 > b.length) return null;
        return { type: "jpeg", w: u16be(b, i + 7), h: u16be(b, i + 5) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/**
 * The file without the details a camera adds: a JPEG's APP1 to APP15
 * segments (EXIF with the location, XMP) and comments; a WebP's EXIF and
 * XMP chunks. Our own crop never sends them (a canvas leaves them
 * behind); this is for a file sent some other way. null: not a file we
 * can read, or a WebP with animation frames whatever its flags say.
 */
export function stripPhotoDetails(b: Uint8Array): Uint8Array | null {
  const info = imageInfo(b);
  if (!info) return null;
  if (info.type === "jpeg") {
    const parts: Uint8Array[] = [b.subarray(0, 2)];
    let i = 2;
    while (i + 4 <= b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xda) {
        parts.push(b.subarray(i));
        return concat(parts);
      }
      const len = u16be(b, i + 2);
      if (len < 2 || i + 2 + len > b.length) return null;
      const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
      if (!drop) parts.push(b.subarray(i, i + 2 + len));
      i += 2 + len;
    }
    return null;
  }
  // WebP: RIFF chunks after the 12-byte header, each padded to an even size.
  const parts: Uint8Array[] = [];
  let i = 12;
  let removed = false;
  while (i + 8 <= b.length) {
    const id = ascii(b, i, 4);
    const size = (b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24)) >>> 0;
    const end = i + 8 + size + (size & 1);
    if (end > b.length + (size & 1)) return null;
    if (id === "ANIM" || id === "ANMF") return null;
    if (id === "EXIF" || id === "XMP ") removed = true;
    else parts.push(b.subarray(i, Math.min(end, b.length)));
    i = end;
  }
  if (!removed) return b;
  const body = concat(parts);
  const out = new Uint8Array(12 + body.length);
  out.set(b.subarray(0, 12));
  out.set(body, 12);
  const riff = out.length - 8;
  out[4] = riff & 0xff;
  out[5] = (riff >>> 8) & 0xff;
  out[6] = (riff >>> 16) & 0xff;
  out[7] = (riff >>> 24) & 0xff;
  // VP8X flags: no EXIF (bit 3), no XMP (bit 2) any more.
  if (ascii(out, 12, 4) === "VP8X") out[20] &= ~0x0c;
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export type UploadProblem = "not_photo" | "too_big" | "too_small";

/** Why an uploaded file is not one we keep, or null (the server's own check of what the browser made). */
export function uploadProblem(info: ImageInfo | null, bytes: number): UploadProblem | null {
  if (!info) return "not_photo";
  if (bytes > PHOTO_UPLOAD.maxBytes) return "too_big";
  if (Math.min(info.w, info.h) < PHOTO_UPLOAD.minSide || Math.max(info.w, info.h) > 1024) return "too_small";
  return null;
}

/**
 * What to tell the person when a picture didn't change: an account error
 * from /api/account/photo with its problem, or a file the browser
 * couldn't use (error "bad", problem not_photo, too_big, too_small or
 * unreadable). Never the check's own words.
 */
export function photoErrorText(error: string | null, problem?: string | null): string {
  switch (error) {
    case "refused":
      return problem === "personal_info"
        ? "That photo seems to show a number, a document or a code. Pick another photo, or an avatar."
        : "That photo can’t be a profile picture on TapTurf. Pick another photo, or an avatar.";
    case "unchecked":
      return "We couldn’t check your photo just now, so it wasn’t saved. Try again in a few minutes, or pick an avatar.";
    case "bad":
      switch (problem) {
        case "too_small":
          return "That photo is too small. Pick a bigger one.";
        case "too_big":
          return "That photo is too big to open (over 30 MB). Try another.";
        case "not_photo":
          return "That file isn’t a photo we can use. Try a JPG or PNG from your gallery.";
        case "unreadable":
          return "We couldn’t open that photo. If it’s an HEIC photo, share it as JPG from your gallery and try again.";
        default:
          return "Something went wrong there. Try again.";
      }
    case "limit":
      return "You’ve changed your photo a lot today. Try again tomorrow, or pick an avatar.";
    case "not_allowed":
      return "Your Google photo isn’t available here. Log in with Google to use it.";
    case "sign_in":
    case "new":
      return "Your login ended. Please log in again.";
    case "slow":
      return "Too many tries. Wait a minute and try again.";
    default:
      return "Couldn’t reach TapTurf. Check your connection and try again.";
  }
}

/* ------------------------------------------------------------------ */
/* The square crop                                                     */
/* ------------------------------------------------------------------ */

/** Where the photo sits in the square frame: its top-left corner (CSS px, from the frame's) and its scale. */
export type Crop = { x: number; y: number; scale: number };

/** The scale at which the photo's short side fills a frame `frame` px wide (zoom 1). */
export const coverScale = (w: number, h: number, frame: number) => frame / Math.min(w, h);

/** How far in the crop may zoom: never past 4x, nor so far that fewer than 128 photo pixels fill the frame. */
export const maxZoom = (w: number, h: number) => Math.max(1, Math.min(PHOTO_UPLOAD.maxZoom, Math.min(w, h) / 128));

/** The photo kept covering the whole frame. */
export function clampCrop(c: Crop, w: number, h: number, frame: number): Crop {
  const min = coverScale(w, h, frame);
  const scale = Math.min(Math.max(c.scale, min), min * maxZoom(w, h));
  const x = Math.min(0, Math.max(frame - w * scale, c.x));
  const y = Math.min(0, Math.max(frame - h * scale, c.y));
  return { x, y, scale };
}

/** The photo centred at zoom 1. */
export function startCrop(w: number, h: number, frame: number): Crop {
  const scale = coverScale(w, h, frame);
  return { x: (frame - w * scale) / 2, y: (frame - h * scale) / 2, scale };
}

/** Zoom to `zoom` (1 = cover) keeping the point at (cx, cy) in the frame where it is. */
export function zoomCrop(c: Crop, zoom: number, w: number, h: number, frame: number, cx = frame / 2, cy = frame / 2): Crop {
  const scale = coverScale(w, h, frame) * zoom;
  const px = (cx - c.x) / c.scale;
  const py = (cy - c.y) / c.scale;
  return clampCrop({ x: cx - px * scale, y: cy - py * scale, scale }, w, h, frame);
}

/** The part of the photo the frame shows (photo pixels), and the side of the square to make from it. */
export function cropSource(c: Crop, w: number, h: number, frame: number): { sx: number; sy: number; side: number; out: number } {
  const k = clampCrop(c, w, h, frame);
  const side = Math.min(frame / k.scale, w, h);
  const sx = Math.min(Math.max(0, -k.x / k.scale), w - side);
  const sy = Math.min(Math.max(0, -k.y / k.scale), h - side);
  return { sx, sy, side, out: Math.max(1, Math.min(PHOTO_UPLOAD.side, Math.round(side))) };
}
