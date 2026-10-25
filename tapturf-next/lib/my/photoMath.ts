import { CONTACT_EMAIL } from "../contact";
import { convertImageUrls } from "../utils/images";
import type { OwnerPhoto, OwnerPhotoList } from "./photoTypes";

/**
 * The arithmetic and wording of owner photo uploads on myTapturf: limits,
 * sizes, which files we take, what each error says, and the photo grid
 * as players see it. No browser APIs; relative imports only
 * (npm run test:photos).
 */

export const PHOTO = {
  /** Per batch; owner_photo_start refuses more. */
  maxBatch: 10,
  /** Live owner photos per turf. */
  maxLive: 20,
  /** We don't open a file bigger than this. */
  maxRawBytes: 30 * 1024 * 1024,
  /** Shortest side, in pixels, of a photo worth showing. */
  minSide: 600,
  /** Long side of the full photo and of its card. */
  full: 1600,
  card: 640,
  /** Encoder quality: WebP, and JPEG where the browser can't make WebP (older Safari). */
  qFull: 0.8,
  qCard: 0.78,
  qJpg: 0.82,
  qJpgCard: 0.74,
  /** A card that came out no smaller than its photo (a photo already card-sized) is made again at this. */
  qRetryCard: 0.6,
} as const;

/** w x h scaled to fit max on its long side; never enlarged. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

export type FileProblem = "not_photo" | "too_big" | "too_small" | "unreadable";

// Some phones hand over HEIC photos with no type at all.
const PHOTO_NAME = /\.(jpe?g|png|webp|heic|heif)$/i;

/** Why a picked file can't be used before we even open it, or null. */
export function checkFile(f: { type: string; name: string; size: number }): FileProblem | null {
  const type = (f.type || "").toLowerCase();
  const photo = type ? type.startsWith("image/") && type !== "image/svg+xml" : PHOTO_NAME.test(f.name || "");
  if (!photo) return "not_photo";
  if (f.size > PHOTO.maxRawBytes) return "too_big";
  if (f.size <= 0) return "unreadable";
  return null;
}

/** A file name for a message: no folder, no extension, not too long. */
export function photoLabel(name: string | undefined, keepExt = false): string {
  let n = (name ?? "").split(/[\\/]/).pop()?.trim() || "This file";
  if (!keepExt) n = n.replace(/\.[a-z0-9]{2,5}$/i, "") || n;
  return n.length > 40 ? `${n.slice(0, 37)}…` : n;
}

/** What to tell the owner for an RPC error or a FileProblem. */
export function ownerPhotoMessage(err: string, name?: string, left?: number): string {
  switch (err) {
    case "batch":
      return `Pick up to ${PHOTO.maxBatch} photos at a time.`;
    case "too_big":
      return `“${photoLabel(name)}” is too big to open (over 30 MB). Try another photo.`;
    case "too_small":
      return `“${photoLabel(name)}” is too small to look good. Pick the original from your camera, not a forwarded copy.`;
    case "unreadable":
      return `We couldn’t open “${photoLabel(name)}”. If it’s an HEIC photo, share it as JPG from your gallery and try again.`;
    case "not_photo":
      return `“${photoLabel(name, true)}” isn’t a photo.`;
    case "duplicate":
      return "You’ve already added this photo.";
    case "too_many":
      return left && left > 0
        ? `You can add ${left} more ${left === 1 ? "photo" : "photos"} (${PHOTO.maxLive} at most). Pick fewer and try again.`
        : `You’ve added ${PHOTO.maxLive} photos, the most for now. Remove one to add another.`;
    case "daily_limit":
      return left && left > 0
        ? `You can add ${left} more ${left === 1 ? "photo" : "photos"} today. Pick fewer, or try again tomorrow.`
        : "You’ve added a lot of photos today. Try again tomorrow.";
    case "forbidden":
      return "Sign in again to change photos.";
    case "paused":
      return `Photo uploads are paused for a bit. Email them to ${CONTACT_EMAIL}.`;
    case "hidden":
      return "That photo is hidden from your page, so it can’t be the cover.";
    case "not_found":
      return "That photo isn’t there any more. Reload the page to see the latest.";
    case "bad_request":
      return "Something went wrong there. Reload the page and try again.";
    case "network":
    default:
      return "Some photos didn’t upload. Check your connection and tap Try again.";
  }
}

export type PhotoTile = {
  /** The URL as displayed (normalised): unique per tile. */
  key: string;
  /** As stored in turfs.images: what Make cover sends. */
  raw: string;
  src: string;
  /** The photo cards lead with. */
  cover: boolean;
  /** First in turfs.images: first in the gallery. */
  first: boolean;
  /** Left out of the public page by the cover pass. */
  hidden: boolean;
  note: string | null;
  /** The owner photo's id when an owner added it; only those can be removed here. */
  mine: string | null;
};

/** checking: uploaded, waiting for the check (not on the page yet). */
export type PhotoGrid = { tiles: PhotoTile[]; visible: number; mineLive: number; checking: OwnerPhoto[]; held: OwnerPhoto[] };

/**
 * The grid in stored order, marked the way the public page treats each
 * photo (lib/queries/turfs.ts transformTurf): links normalised, duplicates
 * and placeholders dropped, and the cover pass's flagged photos hidden,
 * unless that would hide them all. visible is the count players see.
 */
export function photoTiles(list: OwnerPhotoList): PhotoGrid {
  const bad = new Map(list.flagged.map((f) => [f.url, f.note]));
  const live = new Map(list.mine.filter((m) => m.status === "live").map((m) => [m.url, m.id]));
  const tiles: PhotoTile[] = [];
  const seen = new Set<string>();
  for (const raw of list.images) {
    const src = convertImageUrls([raw])[0];
    if (!src || seen.has(src)) continue;
    seen.add(src);
    tiles.push({ key: src, raw, src, cover: false, first: raw === list.images[0], hidden: bad.has(src), note: bad.get(src) ?? null, mine: live.get(raw) ?? null });
  }
  let visible = tiles.filter((t) => !t.hidden).length;
  if (visible === 0) {
    for (const t of tiles) t.hidden = false;
    visible = tiles.length;
  }
  // Cards lead with cover_image, or the first photo when it has none.
  const cover = list.cover ? convertImageUrls([list.cover])[0] : undefined;
  const lead = tiles.find((t) => t.src === cover) ?? tiles[0];
  if (lead) lead.cover = true;
  return {
    tiles,
    visible,
    mineLive: live.size,
    checking: list.mine.filter((m) => m.status === "checking"),
    held: list.mine.filter((m) => m.status === "held"),
  };
}

/** "6 photos on your page · 2 added by you" */
export function photoCountLine(visible: number, mine: number): string {
  if (visible === 0) return "No photos on your page yet.";
  const base = `${visible} ${visible === 1 ? "photo" : "photos"} on your page`;
  return mine > 0 ? `${base} · ${mine} added by you` : base;
}
