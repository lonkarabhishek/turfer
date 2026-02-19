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
 * Converts an array of image URLs, handling Google Drive links
 */
export function convertImageUrls(urls: string[]): string[] {
  if (!Array.isArray(urls)) {
    return [];
  }

  return urls
    .filter((url) => url && typeof url === "string" && url.trim() !== "")
    .map((url) => convertGoogleDriveUrl(url.trim()));
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
