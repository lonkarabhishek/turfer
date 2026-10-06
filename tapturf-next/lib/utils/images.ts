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

/**
 * Smaller copy of a stored photo for cards and inline strips. Stored
 * URLs are normalised to 1600x1200 (Google) / w2000 (Drive), which is
 * right for the full-screen viewer but 4x what a 400px card needs.
 * Other hosts are returned unchanged.
 */
export function imageUrlForCard(url: string): string {
  if (!url || typeof url !== "string") return url;
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
 * placeholders and duplicates, and normalizes each URL.
 */
export function convertImageUrls(urls: string[]): string[] {
  if (!Array.isArray(urls)) {
    return [];
  }

  const out: string[] = [];
  for (const raw of urls) {
    if (!raw || typeof raw !== "string") continue;
    for (const u of splitImageUrls(raw)) {
      if (isPlaceholderImage(u)) continue;
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
 * Gets a valid image URL, converting Google Drive links
 */
export function getValidImageUrl(url: string | undefined | null): string {
  if (!url || typeof url !== "string" || url.trim() === "") {
    return "";
  }

  return convertGoogleDriveUrl(url.trim());
}
