/**
 * Rewrite tiny Google user-content thumbnails (e.g. Google Maps photo
 * URLs ending in `=w32-h32-p-k-no`) up to a real display size.
 *
 * Bluebird's cover_image in Supabase is `...=w32-h32-p-k-no`, which
 * renders as a 32px placeholder on the turf card. Any URL from
 * lh3.googleusercontent.com / lh4.../lh5... / ...gstatic.com uses the
 * `=wWIDTH-hHEIGHT-...` suffix to control the served size, so we can
 * safely rewrite it up. Leaves non-Google URLs untouched.
 */
export function upsizeGoogleUserContent(url: string, width = 1600, height = 1200): string {
  if (!url || typeof url !== "string") return url;
  if (!/(?:lh\d+\.googleusercontent|gstatic)\.com/i.test(url)) return url;
  // Case: existing size suffix like =w32-h32-p-k-no or =s96 — rewrite it.
  if (/=(?:w\d+-h\d+|s\d+)(?:-[^/?#]*)?$/i.test(url)) {
    return url.replace(/=(?:w\d+-h\d+|s\d+)(?:-[^/?#]*)?$/i, `=w${width}-h${height}`);
  }
  // Case: no size suffix — append one so we ask for a real image.
  return `${url}=w${width}-h${height}`;
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
 * Converts an array of image URLs, handling Google Drive links
 */
export function convertImageUrls(urls: string[]): string[] {
  if (!Array.isArray(urls)) {
    return [];
  }

  return urls
    .filter((url) => url && typeof url === "string" && url.trim() !== "")
    .map((url) => normalizeImageUrl(url.trim()));
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
