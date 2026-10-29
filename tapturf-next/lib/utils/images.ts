import { isBookingAppUrl } from "./bookingApps";

/**
 * Ask Google user-content (lh3/lh4/... .googleusercontent.com) for a
 * real display size.
 *
 * Those hosts take sizing options after the first "=" in the last path
 * segment: `TOKEN=w32-h32-p-k-no`, `TOKEN=s96`, `TOKEN=w1600`, ... We
 * drop EVERYTHING from that "=" on and append exactly one suffix.
 *
 * The old version only stripped `=wN-hN…` / `=sN…`, so a bare
 * `TOKEN=w1600` survived and became `TOKEN=w1600=w1600-h1200`, which
 * Google answers with a 400 (blank photos across ~1,200 images).
 *
 * Only googleusercontent is touched: gstatic and other hosts use query
 * strings, and appending "=w…" to them breaks them.
 */
const GOOGLE_USER_CONTENT = /^https?:\/\/lh\d+\.googleusercontent\.com\//i;

export function upsizeGoogleUserContent(url: string, width = 1600, height = 1200): string {
  if (!url || typeof url !== "string") return url;
  if (!GOOGLE_USER_CONTENT.test(url)) return url;
  // Keep any query / hash aside; the size options live in the path.
  const cut = url.search(/[?#]/);
  let path = cut === -1 ? url : url.slice(0, cut);
  const tail = cut === -1 ? "" : url.slice(cut);
  const lastSlash = path.lastIndexOf("/");
  const eq = path.indexOf("=", lastSlash + 1);
  if (eq !== -1) path = path.slice(0, eq);
  return `${path}=w${width}-h${height}${tail}`;
}

/** Our copy of a turf photo (see supabase/functions/mirror-turf-photos): <hash>.webp plus a 640px <hash>-card.webp. */
const MIRRORED = /\/storage\/v1\/object\/public\/turf-photos\/[^?#]+\/[0-9a-f]{24}\.(jpg|webp)$/i;

/** A photo in our own turf-photos bucket (mirrored or uploaded by an owner). */
export function isOwnPhoto(url: string): boolean {
  return /\/storage\/v1\/object\/public\/turf-photos\//i.test(url);
}

/**
 * Photos in display order: our own copies first, then other hosts, then
 * Google user-content links last. Google photo links expire (33 Pune
 * covers imported in Aug and Sep answered 403 on 26 Oct), so a turf that
 * has copies in our storage shows those first instead of a dead cover.
 * Stable within each group, so the stored order still decides ties.
 * Drops empty entries, duplicates and booking apps' photos (playo.gumlet.io,
 * cdn.district.in: TapTurf shows none, see bookingApps.ts).
 */
export function orderPhotos(urls: readonly (string | null | undefined)[]): string[] {
  const rank = (u: string) => (isOwnPhoto(u) ? 0 : GOOGLE_USER_CONTENT.test(u) ? 2 : 1);
  const seen = new Set<string>();
  const list: string[] = [];
  for (const u of urls) {
    if (typeof u !== "string" || !u.trim() || seen.has(u) || isBookingAppUrl(u)) continue;
    seen.add(u);
    list.push(u);
  }
  return list
    .map((u, i) => ({ u, i, r: rank(u) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.u);
}

/** Still a tiny thumb after normalisation (a non-Google URL ending "=w32-h32-..."). */
function isTinyThumb(u: string): boolean {
  return /=w(?:\d{1,2}|1\d{2})-h(?:\d{1,2}|1\d{2})\b/.test(u);
}

/**
 * A turf's photos for cards, tiles and share images: the cover (unless
 * it is a tiny thumb), then the rest, in orderPhotos() order. The first
 * entry is the best cover we have; callers that show one photo try the
 * next when it fails to load.
 */
export function turfPhotos(turf: { cover_image?: string | null; images?: readonly string[] | null }): string[] {
  const cover = turf.cover_image && !isTinyThumb(turf.cover_image) ? turf.cover_image : null;
  return orderPhotos([cover, ...(turf.images ?? [])]);
}

/**
 * Smaller copy of a stored photo for cards and inline strips. Stored
 * URLs are normalised to 1600x1200 (Google) / w2000 (Drive), which is
 * right for the full-screen viewer but 4x what a 400px card needs.
 * Other hosts are returned unchanged.
 */
export function imageUrlForCard(url: string): string {
  if (!url || typeof url !== "string") return url;
  if (MIRRORED.test(url)) return url.replace(/\.(jpg|webp)$/i, "-card.$1");
  if (GOOGLE_USER_CONTENT.test(url)) return upsizeGoogleUserContent(url, 800, 600);
  if (/^https?:\/\/drive\.google\.com\/thumbnail\?/i.test(url)) return url.replace(/([?&]sz=)w\d+/i, "$1w800");
  return url;
}

/**
 * Converts a Google Drive sharing link to a direct image URL using thumbnail API
 */
export function convertGoogleDriveUrl(url: string): string {
  if (!url || typeof url !== "string") {
    return url;
  }

  if (!url.includes("drive.google.com")) {
    return url;
  }

  if (url.includes("drive.google.com/thumbnail")) {
    return url;
  }

  try {
    let fileId: string | null = null;

    const fileMatch = url.match(/\/file\/d\/([^/?]+)/);
    if (fileMatch) {
      fileId = fileMatch[1];
    }

    if (!fileId) {
      const openMatch = url.match(/[?&]id=([^&]+)/);
      if (openMatch) {
        fileId = openMatch[1];
      }
    }

    if (fileId) {
      return `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`;
    }

    return url;
  } catch {
    return url;
  }
}

/**
 * Normalizes any image URL for display: converts Drive share links to
 * their thumbnail form and upsizes tiny Google user-content thumbs.
 * Safe to call on non-Google URLs — both inner helpers are no-ops in
 * that case.
 */
export function normalizeImageUrl(url: string): string {
  return upsizeGoogleUserContent(convertGoogleDriveUrl(url));
}

/**
 * Split a stored value into individual links. Some rows hold several
 * URLs joined with commas in one string ("a.jpg, b.jpg, c.jpg,").
 */
export function splitImageUrls(value: string): string[] {
  return value
    .split(/,\s*(?=https?:\/\/)|,\s*$/)
    .map((u) => u.trim())
    .filter(Boolean);
}

/** Not a turf photo: Google's generic avatar placeholder. */
function isPlaceholderImage(url: string): boolean {
  return /googleusercontent\.com\/ogw\/default-user/i.test(url);
}

/**
 * Cleans an image list for display: splits comma-joined entries, drops
 * placeholders, booking apps' photos and duplicates, and normalizes each
 * URL. transformTurf runs every turf's photos through this, so no card,
 * tile, gallery, share image, JSON-LD or Ask card gets an app's photo.
 */
export function convertImageUrls(urls: string[]): string[] {
  if (!Array.isArray(urls)) {
    return [];
  }

  const out: string[] = [];
  for (const raw of urls) {
    if (!raw || typeof raw !== "string") continue;
    for (const u of splitImageUrls(raw)) {
      if (isPlaceholderImage(u) || isBookingAppUrl(u)) continue;
      const n = normalizeImageUrl(u);
      if (n && !out.includes(n)) out.push(n);
    }
  }
  return out;
}

/** Single-image version of convertImageUrls: first usable link or null. */
export function firstImageUrl(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  return convertImageUrls([value])[0] ?? null;
}

/**
 * Drops the photos the AI cover pass flagged (image_review rows with
 * usable: false: logos, screenshots, blur) from a turf's cleaned images
 * and cover. They stay in the row but never reach a card, gallery or
 * share image. Nothing is dropped when every photo was flagged, and the
 * cover goes only when another photo is left. `rawCover` is the stored
 * cover before cleaning (the review names stored URLs).
 */
export function filterReviewedPhotos(
  images: string[],
  cover: string | null,
  review: unknown,
  rawCover?: string | null,
): { images: string[]; cover: string | null } {
  if (!Array.isArray(review)) return { images, cover };
  const bad = new Set(
    (review as { url?: unknown; usable?: unknown }[])
      .filter((r) => r && r.usable === false && typeof r.url === "string")
      .map((r) => r.url as string),
  );
  if (!bad.size) return { images, cover };
  const kept = images.filter((u) => !bad.has(u));
  return {
    images: kept.length ? kept : images,
    cover: cover && kept.length && (bad.has(cover) || (rawCover != null && bad.has(rawCover))) ? null : cover,
  };
}

/**
 * Up to `max` photos of a turf row as stored (cover_image, images,
 * image_review), cleaned the way turf pages clean them, best first: for
 * game pages and game cards, which read the turf row themselves.
 */
export function usableTurfPhotos(
  raw: { cover_image?: string | null; images?: unknown; image_review?: unknown } | null | undefined,
  max: number,
): string[] {
  if (!raw) return [];
  const images = convertImageUrls(Array.isArray(raw.images) ? (raw.images as string[]) : []);
  const cover = firstImageUrl(raw.cover_image);
  const kept = filterReviewedPhotos(images, cover, raw.image_review, raw.cover_image);
  return turfPhotos({ cover_image: kept.cover, images: kept.images }).slice(0, Math.max(0, max));
}

/**
 * Gets a valid image URL, converting Google Drive links
 */
export function getValidImageUrl(url: string | undefined | null): string {
  if (!url || typeof url !== "string" || url.trim() === "") {
    return "";
  }

  return convertGoogleDriveUrl(url.trim());
}
