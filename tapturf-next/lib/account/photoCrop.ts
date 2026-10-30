import { canEncodeWebp, decode, PhotoError } from "@/lib/my/photos";
import { checkFile } from "@/lib/my/photoMath";
import { cropSource, PHOTO_UPLOAD, type Crop } from "./avatar";

/**
 * Browser side of the profile photo crop: the picked photo upright on a
 * canvas to move and zoom in the square frame, then the square it shows
 * drawn again at 512 px at most (which also leaves the camera's details,
 * like the location, behind) as the file to upload. The decoding is the
 * owners' photo upload's (lib/my/photos.ts). The arithmetic is in
 * lib/account/avatar.ts.
 */

export { PhotoError };

/** The photo to crop: upright, 1600 px on its long side at most. */
export type CropSource = { canvas: HTMLCanvasElement; w: number; h: number };

/** Read a picked file for the crop. Throws PhotoError (not_photo, too_big, too_small, unreadable). */
export async function loadForCrop(file: File): Promise<CropSource> {
  const problem = checkFile(file);
  if (problem) throw new PhotoError(problem);
  const d = await decode(file);
  try {
    if (!d.w || !d.h) throw new PhotoError("unreadable");
    if (Math.min(d.origW, d.origH) < PHOTO_UPLOAD.minSide) throw new PhotoError("too_small");
    const canvas = document.createElement("canvas");
    canvas.width = d.w;
    canvas.height = d.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PhotoError("unreadable");
    ctx.drawImage(d.src, 0, 0, d.w, d.h);
    return { canvas, w: d.w, h: d.h };
  } finally {
    d.done();
  }
}

/** iOS keeps a canvas's memory until its size is zero. */
export function releaseCanvas(c: HTMLCanvasElement | null | undefined): void {
  if (!c) return;
  c.width = 0;
  c.height = 0;
}

function toBlob(c: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b && b.type === type ? resolve(b) : reject(new PhotoError("unreadable"))), type, quality),
  );
}

/** The square the frame shows, as the file to upload: WebP (JPEG where the browser can't), 512 KB at most. */
export async function cropToFile(src: CropSource, crop: Crop, frame: number): Promise<Blob> {
  const { sx, sy, side, out } = cropSource(crop, src.w, src.h, frame);
  const c = document.createElement("canvas");
  c.width = out;
  c.height = out;
  try {
    const ctx = c.getContext("2d");
    if (!ctx) throw new PhotoError("unreadable");
    const webp = await canEncodeWebp();
    if (!webp) {
      // JPEG has no transparency: a see-through PNG would turn black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, out, out);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src.canvas, sx, sy, side, side, 0, 0, out, out);
    const type = webp ? "image/webp" : "image/jpeg";
    for (const q of [PHOTO_UPLOAD.quality, 0.74, 0.6]) {
      const b = await toBlob(c, type, q);
      if (b.size <= PHOTO_UPLOAD.maxBytes) return b;
    }
    throw new PhotoError("too_big");
  } finally {
    releaseCanvas(c);
  }
}
