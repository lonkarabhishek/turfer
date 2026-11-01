import { canEncodeWebp, decode, PhotoError } from "@/lib/my/photos";
import { checkFile, fitWithin } from "@/lib/my/photoMath";
import { REVIEW_PHOTOS } from "./photos";

/**
 * Browser side of a photo for a report: the picked photo (camera or
 * gallery) upright, drawn again at 1600 px on its long side at most and as
 * a 360 px thumbnail, WebP (JPEG where the browser can't). Drawing it again
 * leaves the camera's details behind, the location too; the server takes
 * them out once more. The decoding is the owners' photo upload's
 * (lib/my/photos.ts). Loaded only when a player adds a photo.
 */

export { PhotoError };

export type PreparedPhoto = { full: Blob; thumb: Blob; w: number; h: number };

function draw(src: CanvasImageSource, w: number, h: number, opaque: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new PhotoError("unreadable");
  if (opaque) {
    // JPEG has no transparency: a see-through PNG would turn black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

function encode(c: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b && b.type === type ? resolve(b) : reject(new PhotoError("unreadable"))), type, quality));
}

// iOS keeps a canvas's memory until its size is zero.
function release(c: HTMLCanvasElement | null) {
  if (!c) return;
  c.width = 0;
  c.height = 0;
}

/** Make the photo and its thumbnail from a picked file. Throws PhotoError (not_photo, too_big, too_small, unreadable). */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const problem = checkFile(file);
  if (problem) throw new PhotoError(problem);
  const webp = await canEncodeWebp();
  const type = webp ? "image/webp" : "image/jpeg";
  const d = await decode(file);
  let big: HTMLCanvasElement | null = null;
  let small: HTMLCanvasElement | null = null;
  try {
    if (!d.w || !d.h) throw new PhotoError("unreadable");
    if (Math.min(d.origW, d.origH) < REVIEW_PHOTOS.minSide) throw new PhotoError("too_small");
    const f = fitWithin(d.w, d.h, REVIEW_PHOTOS.full);
    big = draw(d.src, f.w, f.h, !webp);
    d.done();
    // The thumbnail from the 1600 copy, not the original: far less to scale.
    const t = fitWithin(f.w, f.h, REVIEW_PHOTOS.thumb);
    small = draw(big, t.w, t.h, !webp);
    let full: Blob | null = null;
    for (const q of REVIEW_PHOTOS.quality) {
      const b = await encode(big, type, q);
      if (b.size <= REVIEW_PHOTOS.maxBytes) {
        full = b;
        break;
      }
    }
    if (!full) throw new PhotoError("too_big");
    const thumb = await encode(small, type, REVIEW_PHOTOS.thumbQuality);
    if (thumb.size > REVIEW_PHOTOS.thumbMaxBytes || thumb.size >= full.size) throw new PhotoError("unreadable");
    return { full, thumb, w: f.w, h: f.h };
  } finally {
    d.done();
    release(big);
    release(small);
  }
}
